import { useEffect, useMemo } from "react";
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
import { themeById, variantById, type Theme } from "./catalog/themes";
import { matchRoute, nav, usePath, type Route } from "./router";
import { activeRecordForTheme, clearAll, createRecord, recordById, setHalted, setStudent, useStore, type StudyRecord } from "./store/records";
import { DEFAULT_CLASS_POLICY, detectCaps } from "./store/status";
import { useMeasurement } from "./measure/useMeasurement";
import { analyze, localChecks, type PendulumFeatures } from "./measure/pendulum";
import * as flow from "./flow/useFlow";

const goHome = () => nav("/");

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
  const inTheme = route.name === "predict" || route.name === "plan" || route.name === "rejected" || route.name === "setup" || route.name === "measure" || route.name === "hold" || route.name === "result";
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
  const caps = useMemo(detectCaps, []);
  const policy = { ...DEFAULT_CLASS_POLICY, halted: store.halted };
  const m = useMeasurement();

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
    onOpenTheme: (t: Theme) => {
      if (!store.student) return nav("/me");
      const r = activeRecordForTheme(t.id, store.records);
      if (r?.status === "held") return nav(`/x/${t.id}/hold`);
      nav(r && r.variantId ? stagePath(t.id, r.stage) : `/x/${t.id}`);
    },
    onOpenRecord: (id: string) => nav(`/records/${id}`),
    onMe: () => nav("/me"),
  };

  if (redirect || need) return null;

  switch (route.name) {
    case "teacher":
      return <Teacher halted={store.halted} onHalt={() => setHalted(!store.halted)} />;
    case "halted":
      return <Halted halted={store.halted} onHome={goHome} />;
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
          onReady={() => {
            flow.startMeasure(r, route.cond);
            nav(`/x/${t.id}/measure/${route.cond}`);
            void m.start({ sensors: ["accelerometer", "gyroscope"], seconds: t.seconds }); // iOS の許可はこのタップの中で
          }}
          onBack={() => nav(`/x/${t.id}/plan`)}
          onHome={goHome}
        />
      );
    }
    case "measure": {
      const idx = route.cond === "A" ? 0 : 1;
      const label = variant!.conditions[idx].label;
      const s = m.state;
      const view: MeasureView =
        s.phase === "measuring"
          ? { phase: "measuring", elapsed: s.elapsed, seconds: s.seconds, conditionLabel: label, tAccel: null, tGyro: null, checks: [], sentBytes: null, allOk: false }
          : s.phase === "done"
            ? { phase: "done", elapsed: s.seconds, seconds: s.seconds, conditionLabel: label, tAccel: s.features.T_accel_s, tGyro: s.features.T_gyro_s, checks: checksToRows(s.checks), sentBytes: JSON.stringify(s.features).length, allOk: s.checks.every((c) => c.ok), previousHold: r.retries[route.cond] > 0 ? "前回の測定は検査で保留になりました。今回はその再測定です。" : undefined }
            : { phase: "denied", elapsed: 0, seconds: t.seconds, conditionLabel: label, tAccel: null, tGyro: null, checks: [], sentBytes: null, allOk: false, deniedReason: s.phase === "denied" && s.reason === "denied" ? "センサーの許可がありませんでした" : s.phase === "idle" ? "測定が始まっていません。準備画面から「測る」を押してください" : "この端末では加速度センサーが読めません" };
      const finish = (features: PendulumFeatures, demo: boolean) => {
        const hash = s.phase === "done" ? s.rawHash : "sha256:demo";
        const outcome = flow.finishMeasure(r, route.cond, features, localChecks(features), hash, demo);
        m.reset();
        if (outcome === "hold") nav(`/x/${t.id}/hold`);
        else if (route.cond === "A") nav(`/x/${t.id}/setup/B`);
        else nav(`/x/${t.id}/result`);
      };
      return (
        <Measure
          view={view}
          onStop={() => { m.stop(); m.reset(); flow.stopMeasure(r, route.cond); nav(`/x/${t.id}/setup/${route.cond}`); }}
          onContinue={() => { if (s.phase === "done") finish(s.features, false); }}
          onDemo={s.phase === "denied" ? () => finish(demoFeatures(idx, variant!.variable), true) : undefined}
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
          onExplain={(x) => flow.setExplain(r, x)}
          onNext={(d) => flow.chooseNext(r, t, d)}
          onGoNext={async () => { const next = await flow.closeAndNext(r, t); nav(next ? `/x/${t.id}/plan` : "/"); }}
          onFinish={async () => { await flow.sealRecord(r); goHome(); }}
          onRecord={async () => { await flow.sealRecord(r); nav(`/records/${r.id}`); }}
          onHome={goHome}
        />
      );
    }
  }
  return <Home {...homeProps} />;
}

/** センサーの無い端末（審査員の PC など）用のサンプル特徴量。demo フラグ付きで記録に残る */
function demoFeatures(idx: number, variable: string): PendulumFeatures {
  const T = variable === "length" && idx === 1 ? 2.01 : variable === "amplitude" && idx === 1 ? 1.44 : idx === 1 ? 1.43 : 1.42;
  const n = 1200, dt = 1000 / 60;
  const t: number[] = [], ax: number[] = [], ay: number[] = [], az: number[] = [], gx: number[] = [], gy: number[] = [], gz: number[] = [];
  for (let i = 0; i < n; i++) {
    const s = (i * dt) / 1000;
    const th = 0.3 * Math.sin((2 * Math.PI * s) / T);
    t.push(i * dt);
    ax.push(9.8 * Math.sin(th)); ay.push(0.1 * Math.sin(3 * s)); az.push(9.8 * Math.cos(th) + 0.5 * Math.cos((4 * Math.PI * s) / T));
    gx.push(0.5 * Math.sin(5 * s)); gy.push(17.2 * ((2 * Math.PI) / T) * Math.cos((2 * Math.PI * s) / T)); gz.push(0.2 * Math.cos(7 * s));
  }
  return analyze({ t, ax, ay, az, gx, gy, gz, interval: dt });
}
