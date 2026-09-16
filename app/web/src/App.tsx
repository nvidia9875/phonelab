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
import { activeRecordForTheme, clearAll, createRecord, recordById, setHalted, setSettings, setStudent, useStore, type StudyRecord } from "./store/records";
import { DEFAULT_CLASS_POLICY, detectCaps, type DeviceCaps } from "./store/status";
import { useMeasurement } from "./measure/useMeasurement";
import { checksFor, clockLabels, clocksOf, type Features } from "./measure/features";
import { demoFeatures } from "./measure/demo";
import { probeMotionEvents } from "./measure/pendulum";
import * as flow from "./flow/useFlow";

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

/** 描画中に副作用を起こさないため、リダイレクト先と「描画前にやること」をここで決める */
function resolve(route: Route, rec: StudyRecord | undefined, theme: Theme | undefined, hasStudent: boolean, halted: boolean): { redirect?: string; need?: "create" | "judge" } {
  const inTheme = route.name === "predict" || route.name === "plan" || route.name === "rejected" || route.name === "setup" || route.name === "measure" || route.name === "hold" || route.name === "result" || route.name === "chat";
  if (!inTheme) return {};
  if (!theme) return { redirect: "/" };
  if (!hasStudent) return { redirect: "/me" };
  if (halted && (route.name === "setup" || route.name === "measure")) return { redirect: "/halted" };
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
  const policy = { ...DEFAULT_CLASS_POLICY, halted: store.halted };
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
  const { redirect, need } = resolve(route, rec, theme, !!store.student, store.halted);

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
    halted: store.halted,
    school: store.settings.school,
    onOpenTheme: (t: Theme) => {
      if (!store.student) return nav("/me");
      const r = activeRecordForTheme(t.id, store.records);
      if (r?.status === "held") return nav(`/x/${t.id}/hold`);
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
      return <Teacher halted={store.halted} onHalt={() => setHalted(!store.halted)} />;
    case "halted":
      return <Halted halted={store.halted} onHome={goHome} />;
    case "settings":
      return <Settings settings={store.settings} onChange={setSettings} onMe={() => nav("/me")} onTeacher={() => nav("/teacher")} onHome={goHome} />;
    case "me":
      return (
        <Me
          student={store.student}
          caps={caps}
          policy={policy}
          recordCount={store.records.length}
          onSave={(s) => { setStudent(s); goHome(); }}
          onClear={() => { if (confirm("この端末の記録をすべて消します。よろしいですか？")) clearAll(); }}
          onHome={goHome}
        />
      );
    case "record": {
      const r = recordById(route.id);
      const t = r && themeById(r.themeId);
      if (!r || !t) return <Home {...homeProps} />;
      return <Record theme={t} variant={variantById(t, r.variantId) ?? null} record={r} onVerify={() => alert("端末で再検証: IndexedDB の生データから再計算します（実装予定）")} onHome={goHome} />;
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
          theme={t}
          initialText={r.prediction.text}
          questionBack={r.prediction.questionBack}
          hintMessage={r.prediction.hints > 0 ? `ヒントは ${r.prediction.hints} / 3 回使いました` : null}
          onSubmit={(text) => {
            const next = flow.submitPrediction(r, t, text);
            nav(next === "predict" ? `/x/${t.id}` : `/x/${t.id}/${next}`);
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
            ? { phase: "countdown", elapsed: 0, seconds: s.seconds, conditionLabel: label, clocks: emptyClocks, unit, checks: [], sentBytes: null, allOk: false, countdown: s.count, cue: t.goCue }
          : s.phase === "requesting"
            ? { phase: "requesting", elapsed: 0, seconds: s.seconds, conditionLabel: label, clocks: emptyClocks, unit, checks: [], sentBytes: null, allOk: false, waitingFor: s.sensor === "microphone" ? "マイクの許可を待っています。ブラウザの確認で「許可」を押してください" : "センサーの許可を待っています。確認で「許可」を押してください" }
          : s.phase === "done"
            ? { phase: "done", elapsed: s.seconds, seconds: s.seconds, conditionLabel: label, clocks: clocksOf(s.features), unit, checks: checksToRows(s.checks), sentBytes: JSON.stringify(s.features).length, allOk: s.checks.every((c) => c.ok), previousHold: r.retries[route.cond] > 0 ? "前回の測定は検査で保留になりました。今回はその再測定です。" : undefined }
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
          onRemeasure={r.retries[route.cond] < flow.MAX_RETRY ? () => { m.reset(); flow.remeasure(r, route.cond); nav(`/x/${t.id}/setup/${route.cond}`); } : undefined}
          onDemo={s.phase === "denied" || s.phase === "requesting" ? () => finish(demoFeatures(t, variant!, idx), true) : undefined}
        />
      );
    }
    case "hold": {
      const last = r.measurements[r.measurements.length - 1];
      const cond = last.condition;
      return (
        <Hold
          checks={last.checks}
          conditionLabel={variant!.conditions[cond === "A" ? 0 : 1].label}
          retry={r.retries[cond]}
          maxRetry={flow.MAX_RETRY}
          onRetry={() => { flow.retry(r, cond); nav(`/x/${t.id}/setup/${cond}`); }}
          onChat={() => nav(`/x/${t.id}/chat`)}
          onOther={goHome}
          onHome={goHome}
        />
      );
    }
    case "result": {
      const nextVariant = flow.nextVariantFor(r, t);
      return (
        <Result
          variant={variant!}
          judgement={r.result!}
          explain={r.explain}
          nextVariant={nextVariant}
          nextDirection={r.nextPrediction?.direction ?? null}
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
