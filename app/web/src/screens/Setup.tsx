import { Button, Card, CardTitle, Eyebrow, Foot, FootNote, PermitChip, Screen } from "../components/ui";
import { SENSOR_LABEL, type Condition, type Theme, type Variant } from "../catalog/themes";
import "./catalog.css";

export interface SetupProps {
  theme: Theme;
  variant: Variant;
  condition: Condition;
  index: 0 | 1;
  retry: number;
  onReady: () => void;
  onBack: () => void;
  onHome: () => void;
}

/** 条件の準備。ここではまだセンサーを読まない。「測る」を押した瞬間から読む */
export function Setup({ theme, variant, condition, index, retry, onReady, onBack, onHome }: SetupProps) {
  const sensors = theme.sensors.map((s) => SENSOR_LABEL[s]).join("・");
  return (
    <Screen badge={`準備 ${condition.key}`} onHome={onHome}>
      <Card panel>
        <Eyebrow>{index === 0 ? "1 つ目の条件" : "2 つ目の条件"}{retry > 0 ? `（再測定 ${retry} 回目）` : ""}</Eyebrow>
        <CardTitle>{condition.label}</CardTitle>
        <div className="setup-art" aria-hidden>
          <PendulumArt heavy={index === 1 && variant.variable === "mass"} long={index === 1 && variant.variable === "length"} wide={index === 1 && variant.variable === "amplitude"} />
        </div>
        <div className="step">
          <span className="step__n">1</span>
          <p style={{ fontSize: 14, lineHeight: 1.6 }}>{condition.setup}</p>
        </div>
        <div className="step">
          <span className="step__n">2</span>
          <p style={{ fontSize: 14, lineHeight: 1.6 }}>
            スマホは袋に入れたまま、画面はこのまま。「測る」を押すと {theme.seconds} 秒だけ読み取ります
          </p>
        </div>
        <PermitChip sensors={sensors} seconds={theme.seconds} denied="それ以外は読まない" />
      </Card>

      <Card variant="line">
        <Eyebrow>一定にするもの</Eyebrow>
        <p style={{ fontSize: 14, fontWeight: 700 }}>{variant.holds}</p>
        <p className="card__hint">{theme.safety}</p>
      </Card>

      <Foot>
        <Button onClick={onReady}>準備できた、測る</Button>
        <Button secondary onClick={onBack}>計画に戻る</Button>
        <FootNote>読み取りは {theme.seconds} 秒で必ず止まります。</FootNote>
      </Foot>
    </Screen>
  );
}

function PendulumArt({ heavy, long, wide }: { heavy: boolean; long: boolean; wide: boolean }) {
  const len = long ? 92 : 60;
  const ang = wide ? 32 : 14;
  const rad = (ang * Math.PI) / 180;
  const x = 90 + len * Math.sin(rad);
  const y = 18 + len * Math.cos(rad);
  return (
    <svg width={180} height={130} viewBox="0 0 180 130" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
      <path d="M30 18h120" />
      <circle cx={90} cy={18} r={3} fill="currentColor" />
      <path d={`M90 18 L${x.toFixed(1)} ${y.toFixed(1)}`} />
      <rect x={x - 9} y={y - 2} width={18} height={26} rx={4} fill="var(--card)" />
      {heavy && <rect x={x - 9} y={y + 26} width={18} height={12} rx={3} fill="var(--orange)" stroke="var(--orange)" />}
      <path d={`M${(90 - len * Math.sin(rad) - 4).toFixed(1)} ${(y + 14).toFixed(1)} Q90 ${(y + 30).toFixed(1)} ${(x + 4).toFixed(1)} ${(y + 14).toFixed(1)}`} stroke="var(--teal)" strokeDasharray="4 4" />
    </svg>
  );
}
