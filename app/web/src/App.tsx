import { useCallback, useEffect, useState } from "react";
import { Home } from "./screens/Home";
import { Me } from "./screens/Me";
import { Predict } from "./screens/Predict";
import { Plan } from "./screens/Plan";
import { Rejected } from "./screens/Rejected";
import { Setup } from "./screens/Setup";
import { Measure, checksToRows, type MeasureView } from "./screens/Measure";
import { Hold } from "./screens/Hold";
import { Result } from "./screens/Result";
import { Record } from "./screens/Record";
import { Halted } from "./screens/Halted";
import { Teacher } from "./screens/Teacher";
import { Settings } from "./screens/Settings";
import { Chat } from "./screens/Chat";
import { repeatsOf, themeById, variantById, type Theme } from "./catalog/themes";
import { matchRoute, nav, usePath, type Route } from "./router";
import { activeRecordForTheme, clearAll, createRecord, getState, myRecordById, setClassState, setHalted, setSettings, setStudent, useStore, type ClassState, type StudyRecord } from "./store/records";
import { DEFAULT_CLASS_POLICY, detectCaps, themeStatus, type ClassPolicy, type DeviceCaps } from "./store/status";
import { ClassError, fetchClass, joinClass, resetStudent, setClassHalt, setClassPolicyOnServer, type ClassInfo } from "./agent/classroom";
import { startRecordSync } from "./agent/sync";
import { useMeasurement } from "./measure/useMeasurement";
import { checksFor, clockLabels, clocksOf, type Features } from "./measure/features";
import { demoFeatures } from "./measure/demo";
import { probeMotionEvents } from "./measure/pendulum";
import * as flow from "./flow/useFlow";
import { askNext, isNextStale } from "./flow/nextStep";

const goHome = () => nav("/");

/** 音は最初の 0.5 秒で雑音の大きさを測るので、合図の前に「しーっ」を出す（docs/verifier.md 1.4） */
const QUIET_S = 0.5;
const CUE_HOLD_S = 2;
function cueFor(theme: Theme, elapsed: number): string {
  if (theme.measureProfile === "pitch") return elapsed < QUIET_S ? "しーっ、静かに" : theme.goCue;
  return elapsed < CUE_HOLD_S ? theme.goCue : "そのまま待ちます";
}

/** 記録の段階 → その続きの URL */
function stagePath(themeId: string, stage: StudyRecord["stage"]): string {
  switch (stage) {
    case "plan": return `/x/${themeId}/plan`;
    case "setup_A": case "measure_A": return `/x/${themeId}/setup/A`;
    case "setup_B": case "measure_B": return `/x/${themeId}/setup/B`;
    case "result": return `/x/${themeId}/result`;
    default: return `/x/${themeId}`;
  }
}

/** 同じ条件を測り直しているときの一文。前回が検査で止まったのか、自分で測り直したのかを分ける */
function previousAttemptNote(rec: StudyRecord, cond: "A" | "B"): string | undefined {
  if (rec.retries[cond] === 0) return undefined;
  const previous = rec.measurements.filter((x) => x.condition === cond).at(-1);
  if (previous && !previous.pass) return "前回の測定は検査で保留になりました。今回はその再測定です。";
  return `この条件を測り直しています（${rec.retries[cond] + 1} 回目）。前の測定も記録に残ります。`;
}

function classStateFrom(info: ClassInfo): ClassState {
  return { classCode: info.class_code, school: info.school, allowedSensors: info.allowed_sensors, teacherEnabled: info.teacher_enabled, halted: info.halted, updatedAt: info.updated_at, seenAt: new Date().toISOString() };
}

/** 学級の停止はポーリングで届く。測定と準備の画面では 2 秒、それ以外は 10 秒（docs/policy.md 5 章） */
const POLL_MEASURING_MS = 2000;
const POLL_IDLE_MS = 10000;
/** 続けて何回確かめられなかったら「停止が届くか分からない」とするか（測定中なら約 6 秒）。10/9 Codex #9 */
const UNREACHABLE_AFTER = 3;

function useClassPoll(classCode: string | null, measuring: boolean): void {
  useEffect(() => {
    if (!classCode) return;
    let alive = true;
    let failures = 0;
    const tick = async () => {
      try {
        const info = await fetchClass(classCode);
        failures = 0;
        if (alive) setClassState(classStateFrom(info));
      } catch (e: unknown) {
        if (!alive) return;
        // 学級が消えた（404）ときは端末の学級を外す
        if (e instanceof ClassError && e.status === 404) {
          setClassState(null);
          return;
        }
        // 通信の失敗が続いたら、先生の停止が届くか分からないので測定に進ませない（前の「止めていない」を信じ続けない）
        failures += 1;
        const current = getState().classState;
        if (failures >= UNREACHABLE_AFTER && current && !current.unreachable) setClassState({ ...current, unreachable: true });
      }
    };
    void tick();
    const id = setInterval(() => void tick(), measuring ? POLL_MEASURING_MS : POLL_IDLE_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [classCode, measuring]);
}

/** 描画中に副作用を起こさないため、リダイレクト先と「描画前にやること」をここで決める */
function resolve(route: Route, rec: StudyRecord | undefined, theme: Theme | undefined, hasStudent: boolean, halted: boolean, allowed: boolean, unreachable = false): { redirect?: string; need?: "create" | "judge" } {
  const inTheme = route.name === "predict" || route.name === "plan" || route.name === "rejected" || route.name === "setup" || route.name === "measure" || route.name === "hold" || route.name === "result" || route.name === "chat";
  if (!inTheme) return {};
  if (!theme) return { redirect: "/" };
  if (!hasStudent) return { redirect: "/me" };
  if (!allowed) return { redirect: "/" }; // 学級の許可・端末の能力で選べないテーマは URL 直打ちでも開かない（9/18 Codex I2）
  if ((halted || unreachable) && (route.name === "setup" || route.name === "measure")) return { redirect: "/halted" };
  // 承認してから測る（D4）。URL を直接開いても、承認していなければ計画へ戻す（10/2 の通し操作で飛ばせた）
  if ((route.name === "setup" || route.name === "measure") && rec && !rec.approvedAt) return { redirect: `/x/${theme.id}/plan` };
  if (route.name === "predict") {
    if (!rec) return { need: "create" };
    if (rec.stage !== "predict" && rec.variantId) return { redirect: stagePath(theme.id, rec.stage) };
    return {};
  }
  if (!rec || !rec.variantId) return { redirect: `/x/${theme.id}` };
  if (route.name === "rejected" && !rec.rejection) return { redirect: `/x/${theme.id}/plan` };
  if (route.name === "hold") {
    const last = rec.measurements[rec.measurements.length - 1];
    if (!last || last.pass) return { redirect: `/x/${theme.id}/plan` };
  }
  if (route.name === "chat" && !rec.result && rec.status !== "held") return { redirect: stagePath(theme.id, rec.stage) };
  if (route.name === "result") {
    if (!rec.result) {
      const a = rec.measurements.some((m) => m.condition === "A" && m.pass);
      const b = rec.measurements.some((m) => m.condition === "B" && m.pass);
      if (!a) return { redirect: `/x/${theme.id}/setup/A` };
      if (!b) return { redirect: `/x/${theme.id}/setup/B` };
      return { need: "judge" };
    }
  }
  return {};
}

export function App() {
  const path = usePath();
  const route = matchRoute(path);
  const store = useStore();
  const [caps, setCaps] = useState<DeviceCaps>(detectCaps);
  // 学級に入っていれば先生の許可・停止・学校種はサーバのもの。入っていなければ端末の設定（テストモード）
  const cls = store.classState;
  const halted = cls ? cls.halted : store.halted;
  const policy: ClassPolicy = cls ? { allowedSensors: cls.allowedSensors, teacherEnabled: cls.teacherEnabled, halted } : { ...DEFAULT_CLASS_POLICY, halted };
  const school = cls?.school ?? store.settings.school;
  // 準備・測定中と、止められて待っている間は 2 秒ごと（解除もすぐ届くように）
  useClassPoll(store.student?.classCode ?? null, route.name === "setup" || route.name === "measure" || halted);
  // 記録の要約を先生の画面へ（学級に入っている端末だけ。生データは送らない）
  useEffect(() => startRecordSync(), []);
  const markNoMotion = useCallback(() => setCaps((c) => ({ ...c, motionEvents: "no" })), []);
  const m = useMeasurement({ onMotionUnavailable: markNoMotion });

  // 加速度の値が本当に届くかを起動時に確かめる。何も来なければ（iOS など許可が要る端末）測るときに確かめる
  useEffect(() => {
    if (!caps.motion) return;
    let alive = true;
    void probeMotionEvents().then((support) => {
      if (alive && support !== "unknown") setCaps((c) => ({ ...c, motionEvents: support }));
    });
    return () => {
      alive = false;
    };
  }, [caps.motion]);

  const themeId = "theme" in route ? route.theme : null;
  const theme = themeId ? themeById(themeId) : undefined;
  const rec = theme ? activeRecordForTheme(theme.id, store.records) : undefined;
  const allowed = !theme || themeStatus(theme, store.records, caps, policy, store.settings.testMode).kind !== "unavailable";
  const unreachable = !!cls?.unreachable;
  const { redirect, need } = resolve(route, rec, theme, !!store.student, halted, allowed, unreachable);

  useEffect(() => {
    if (redirect) {
      m.stop();
      nav(redirect, true);
    } else if (need === "create" && theme) {
      // StrictMode の二重実行や連打で二重に作らない
      if (!activeRecordForTheme(theme.id)) createRecord(theme.id);
    } else if (need === "judge" && rec && theme) {
      flow.ensureJudged(rec, theme);
    }
  }, [redirect, need, theme?.id, rec?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const homeProps = {
    student: store.student,
    records: store.records,
    caps,
    policy,
    halted,
    school,
    onOpenTheme: (t: Theme) => {
      if (!store.student) return nav("/me");
      const r = activeRecordForTheme(t.id, store.records);
      if (r?.status === "held") return nav(r.result?.undecided ? `/x/${t.id}/result` : `/x/${t.id}/hold`);
      nav(r && r.variantId ? stagePath(t.id, r.stage) : `/x/${t.id}`);
    },
    onOpenRecord: (id: string) => nav(`/records/${id}`),
    onMe: () => nav("/me"),
    onSettings: () => nav("/settings"),
    testMode: store.settings.testMode,
  };

  if (redirect || need) return null;

  switch (route.name) {
    case "teacher":
      return (
        <Teacher
          classCode={cls?.classCode ?? store.student?.classCode ?? "DEMO-2026"}
          cls={cls}
          halted={halted}
          onHalt={async (code, pin, next) => {
            if (!code) return setHalted(next); // 学級に入っていない端末（テストモード）は端末内だけ
            setClassState(classStateFrom(await setClassHalt(code, pin, next)));
          }}
          onPolicy={async (code, pin, sensors, enabled) => {
            setClassState(classStateFrom(await setClassPolicyOnServer(code, pin, sensors, enabled)));
          }}
          onResetStudent={(code, pin, number) => resetStudent(code, pin, number)}
        />
      );
    case "halted":
      return <Halted halted={halted} unreachable={unreachable && !halted} onHome={goHome} />;
    case "settings":
      return <Settings settings={store.settings} onChange={setSettings} onMe={() => nav("/me")} onTeacher={() => nav("/teacher")} onHome={goHome} />;
    case "me":
      return (
        <Me
          student={store.student}
          caps={caps}
          policy={policy}
          recordCount={store.records.length}
          onSave={async (s) => {
            // 同じ端末で同じ番号なら、保存済みの合言葉を使う（入力欄が空のとき）
            const known = store.student && store.student.classCode === s.classCode && store.student.number === s.number ? store.student.secret : undefined;
            let secret = s.secret ?? known;
            let fresh: string | null = null;
            try {
              const info = await joinClass(s.classCode, s.number, secret);
              setClassState(classStateFrom(info));
              if (info.secret) {
                secret = info.secret; // 最初の入場。合言葉はこの端末に保存する
                fresh = info.secret;
              }
            } catch (e: unknown) {
              // テストモードだけ、学級が無くても端末内で進める（404 のときだけ。番号の取り合いは通さない）
              const notFound = e instanceof ClassError && e.status === 404;
              if (!(store.settings.testMode && notFound)) return { error: e instanceof ClassError ? e.message : "学級につながりませんでした" };
              setClassState(null);
            }
            setStudent({ classCode: s.classCode, number: s.number, secret });
            // 初めての入場なら、Me が合言葉の画面を出してからトップへ戻す
            return { secret: fresh };
          }}
          onClear={() => clearAll()}
          onHome={goHome}
        />
      );
    case "record": {
      const r = myRecordById(route.id);
      const t = r && themeById(r.themeId);
      if (!r || !t) return <Home {...homeProps} />;
      return <Record theme={t} variant={variantById(t, r.variantId) ?? null} record={r} onHome={goHome} />;
    }
    case "home":
    case "gallery":
      return <Home {...homeProps} />;
  }

  // ---- テーマの中。ここから先は theme と rec が揃っている（resolve が保証） ----
  const t = theme!;
  const r = rec!;
  const variant = variantById(t, r.variantId);

  switch (route.name) {
    case "predict":
      return (
        <Predict
          key={t.id}
          theme={t}
          initialText={r.prediction.text}
          questionBack={r.prediction.questionBack}
          hintMessage={r.prediction.hints > 0 ? `ヒントは ${r.prediction.hints} / 3 回使いました` : null}
          onSubmit={async (text) => {
            const next = await flow.submitPrediction(r, t, text);
            nav(next === "halted" ? "/halted" : next === "predict" ? `/x/${t.id}` : `/x/${t.id}/${next}`);
          }}
          onHome={goHome}
        />
      );
    case "rejected":
      return (
        <Rejected
          theme={t}
          memo={r.prediction.text}
          rejection={r.rejection!}
          alternative={variant!}
          onApprove={() => { flow.approve(r, t); nav(`/x/${t.id}/setup/A`); }}
          onAsk={goHome}
          onHome={goHome}
        />
      );
    case "plan":
      return (
        <Plan
          theme={t}
          variant={variant!}
          predictionText={r.prediction.text}
          why={flow.planWhy(r, t)}
          source={r.plan?.source}
          trail={r.plan?.trail}
          selfCorrected={r.plan?.selfCorrected}
          traceId={r.plan?.traceId}
          alternatives={flow.alternativesFor(r, t)}
          onPick={(id) => flow.pickVariant(r, t, id)}
          onApprove={() => { flow.approve(r, t); nav(`/x/${t.id}/setup/A`); }}
          onOther={goHome}
          onHome={goHome}
        />
      );
    case "setup": {
      const idx = route.cond === "A" ? 0 : 1;
      return (
        <Setup
          theme={t}
          variant={variant!}
          condition={variant!.conditions[idx]}
          index={idx}
          retry={r.retries[route.cond]}
          attempt={(r.tries?.[route.cond] ?? 0) + 1}
          repeats={repeatsOf(variant!)}
          onReady={() => {
            flow.startMeasure(r, route.cond);
            nav(`/x/${t.id}/measure/${route.cond}`);
            const profile = t.measureProfile;
            if (store.settings.testMode) {
              m.markUnsupported("テストモード: サンプルの測定で進めます");
            } else if (profile === "pendulum_period" || profile === "pendulum_speed" || profile === "pitch") {
              // iOS の許可はこのタップの中で求める
              void m.start({ profile, sensors: t.sensors, seconds: t.seconds, lengthM: variant!.lengthM }, variant!);
            } else {
              m.markUnsupported("この実験の測定はまだ実装中です。サンプルで進めます");
            }
          }}
          onBack={() => nav(`/x/${t.id}/plan`)}
          onHome={goHome}
        />
      );
    }
    case "measure": {
      const idx = route.cond === "A" ? 0 : 1;
      const label = variant!.conditions[idx].label;
      const unit = variant!.unit;
      const s = m.state;
      const emptyClocks = clockLabels(t.measureProfile).map((l) => ({ label: l, value: null }));
      const cannotRead = t.measureProfile === "pitch" ? "この端末ではマイクが使えません" : "この端末では加速度センサーが読めません";
      const view: MeasureView =
        s.phase === "measuring"
          ? { phase: "measuring", elapsed: s.elapsed, seconds: s.seconds, conditionLabel: label, clocks: emptyClocks, unit, checks: [], sentBytes: null, allOk: false, cue: cueFor(t, s.elapsed) }
          : s.phase === "countdown"
            ? { phase: "countdown", elapsed: 0, seconds: s.seconds, conditionLabel: label, clocks: emptyClocks, unit, checks: [], sentBytes: null, allOk: false, countdown: s.count, cue: t.goCue, quietFirst: t.measureProfile === "pitch" }
          : s.phase === "requesting"
            ? { phase: "requesting", elapsed: 0, seconds: s.seconds, conditionLabel: label, clocks: emptyClocks, unit, checks: [], sentBytes: null, allOk: false, waitingFor: s.sensor === "microphone" ? "マイクの許可を待っています。ブラウザの確認で「許可」を押してください" : "センサーの許可を待っています。確認で「許可」を押してください" }
          : s.phase === "done"
            ? { phase: "done", elapsed: s.seconds, seconds: s.seconds, conditionLabel: label, clocks: clocksOf(s.features), unit, checks: checksToRows(s.checks), sentBytes: JSON.stringify(s.features).length, allOk: s.checks.every((c) => c.ok), previousHold: previousAttemptNote(r, route.cond) }
            : { phase: "denied", elapsed: 0, seconds: t.seconds, conditionLabel: label, clocks: emptyClocks, unit, checks: [], sentBytes: null, allOk: false, deniedReason: s.phase === "denied" ? (s.message ?? (s.reason === "denied" ? "センサーの許可がありませんでした" : cannotRead)) : "測定が始まっていません。準備画面から「測る」を押してください" };
      const finish = (features: Features, demo: boolean) => {
        const hash = s.phase === "done" ? s.rawHash : "sha256:demo";
        const outcome = flow.finishMeasure(r, route.cond, features, checksFor(features, variant!), hash, demo, repeatsOf(variant!));
        m.reset();
        if (outcome === "hold") nav(`/x/${t.id}/hold`);
        else if (outcome === "again") nav(`/x/${t.id}/setup/${route.cond}`); // 平均を取るので同じ条件をもう一回
        else if (route.cond === "A") nav(`/x/${t.id}/setup/B`);
        else nav(`/x/${t.id}/result`);
      };
      return (
        <Measure
          view={view}
          onStop={() => { m.stop(); m.reset(); flow.stopMeasure(r, route.cond); nav(`/x/${t.id}/setup/${route.cond}`); }}
          onContinue={() => { if (s.phase === "done") finish(s.features, false); }}
          onRemeasure={s.phase === "done" && s.checks.every((c) => c.ok) && r.retries[route.cond] < flow.MAX_RETRY ? () => { m.reset(); flow.remeasure(r, route.cond); nav(`/x/${t.id}/setup/${route.cond}`); } : undefined}
          onDemo={store.settings.testMode && (s.phase === "denied" || s.phase === "requesting") ? () => finish(demoFeatures(t, variant!, idx), true) : undefined}
        />
      );
    }
    case "hold": {
      const last = r.measurements[r.measurements.length - 1];
      const cond = last.condition;
      return (
        <Hold
          key={`${r.id}-${r.measurements.length}`}
          checks={last.checks}
          conditionLabel={variant!.conditions[cond === "A" ? 0 : 1].label}
          retry={r.retries[cond]}
          maxRetry={flow.MAX_RETRY}
          advice={r.holdAdvice && r.holdAdvice.measurementIndex === r.measurements.length - 1 ? r.holdAdvice : null}
          onLoadAdvice={() => flow.askHoldAdvice(r, t)}
          onSwitchTo={(id) => { const next = flow.switchExperiment(r, t, id); nav(next ? `/x/${t.id}` : "/"); }}
          switchTitleOf={(id) => variantById(t, id)?.title ?? null}
          onRetry={() => { flow.retry(r, cond); nav(`/x/${t.id}/setup/${cond}`); }}
          onChat={() => nav(`/x/${t.id}/chat`)}
          onOther={() => { const next = flow.switchExperiment(r, t); nav(next ? `/x/${t.id}` : "/"); }}
          onHome={goHome}
        />
      );
    }
    case "result": {
      const nextVariant = flow.nextVariantFor(r, t);
      return (
        <Result
          key={r.id}
          sample={r.measurements.some((x) => x.demo)}
          variant={variant!}
          judgement={r.result!}
          explain={r.explain}
          nextVariant={nextVariant}
          nextDirection={r.nextPrediction?.direction ?? null}
          suggestion={r.nextSuggestion ?? null}
          stale={isNextStale(r)}
          onLoadNext={() => askNext(r, t)}
          retries={r.retries}
          maxRetry={flow.MAX_RETRY}
          repeats={repeatsOf(variant!)}
          onRemeasure={(cond) => { if (flow.remeasure(r, cond)) nav(`/x/${t.id}/setup/${cond}`); }}
          onExplain={(x) => flow.setExplain(r, x)}
          onNext={(d) => flow.chooseNext(r, t, d)}
          onGoNext={async () => { const next = await flow.closeAndNext(r, t); nav(next ? `/x/${t.id}/plan` : "/"); }}
          onFinish={async () => { await flow.sealRecord(r); goHome(); }}
          onRecord={async () => { await flow.sealRecord(r); nav(`/records/${r.id}`); }}
          onChat={() => nav(`/x/${t.id}/chat`)}
          onHome={goHome}
        />
      );
    }
    case "chat":
      return (
        <Chat
          key={r.id}
          rec={r}
          theme={t}
          variant={variant!}
          onThinking={(x) => flow.setChatThinking(r, x)}
          onTurn={(x, reply) => flow.addChatTurn(r, x, reply)}
          onBack={() => nav(r.result ? `/x/${t.id}/result` : `/x/${t.id}/hold`)}
          onHome={goHome}
        />
      );
  }
  return <Home {...homeProps} />;
}
