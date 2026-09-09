import { useEffect, useState } from "react";
import { Predict } from "./screens/Predict";
import { Measure, checksToRows, sampleMeasureView, type MeasureView } from "./screens/Measure";
import { Result } from "./screens/Result";
import { Hold } from "./screens/Hold";
import { Rejected } from "./screens/Rejected";
import { Record } from "./screens/Record";
import { Teacher } from "./screens/Teacher";
import { useMeasurement } from "./measure/useMeasurement";
import { plan } from "./sample/data";

/**
 * 画面カタログ + 実測の結線。
 *  - `#predict` などのハッシュで 6 画面を見られる（サンプル値）
 *  - 画面 1 の「承認して測る」は本物の DeviceMotion で 20 秒測り、端末内で検査する
 *  - `/teacher` は教員画面
 * サーバ（Planner / Policy / Verifier / 署名）は次のフェーズで差し込む
 */
const SCREENS = ["predict", "measure", "result", "hold", "rejected", "record"] as const;
type ScreenId = (typeof SCREENS)[number];

function readHash(): ScreenId {
  const h = location.hash.replace("#", "") as ScreenId;
  return SCREENS.includes(h) ? h : "predict";
}

export function App() {
  const [screen, setScreen] = useState<ScreenId>(readHash);
  const m = useMeasurement();
  useEffect(() => {
    const onHash = () => setScreen(readHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  const go = (s: ScreenId) => () => {
    location.hash = s;
  };

  if (location.pathname.startsWith("/teacher")) {
    return <Teacher onHalt={() => alert("全端末停止はサーバ実装後に有効になります")} />;
  }

  const approve = async () => {
    location.hash = "measure";
    await m.start({ sensors: ["accelerometer", "gyroscope"], seconds: plan.seconds });
  };

  switch (screen) {
    case "predict":
      return <Predict onApprove={approve} onOther={go("rejected")} />;
    case "measure": {
      const s = m.state;
      let view: MeasureView;
      if (s.phase === "measuring") {
        view = { elapsed: s.elapsed, seconds: s.seconds, conditionLabel: "重さ 1倍", tAccel: null, tGyro: null, checks: [], sentBytes: null, done: false };
      } else if (s.phase === "done") {
        view = {
          elapsed: s.seconds,
          seconds: s.seconds,
          conditionLabel: "重さ 1倍",
          tAccel: s.features.T_accel_s,
          tGyro: s.features.T_gyro_s,
          checks: checksToRows(s.checks),
          sentBytes: JSON.stringify(s.features).length,
          done: true,
        };
      } else if (s.phase === "denied") {
        view = { ...sampleMeasureView(), tAccel: null, tGyro: null, checks: [{ ok: false, text: s.reason === "unsupported" ? "この端末では加速度センサーが読めません" : "センサーの許可がありませんでした" }], previousHold: undefined, sentBytes: null, elapsed: 0 };
      } else {
        view = sampleMeasureView();
      }
      const allOk = s.phase === "done" && s.checks.every((c) => c.ok);
      return (
        <Measure
          view={view}
          onStop={() => {
            m.stop();
            m.reset();
            location.hash = "predict";
          }}
          onContinue={s.phase === "done" ? go(allOk ? "result" : "hold") : s.phase === "idle" ? go("result") : undefined}
        />
      );
    }
    case "result":
      return <Result onRecord={go("record")} onTrace={go("record")} />;
    case "hold":
      return <Hold onRetry={approve} onOther={go("predict")} />;
    case "rejected":
      return <Rejected onApprove={approve} onAsk={go("predict")} />;
    case "record":
      return <Record onExport={go("result")} onSend={go("predict")} />;
  }
}
