import { Button, Card, CardTitle, Eyebrow, Foot, FootNote, PermitChip, Screen } from "../components/ui";
import { SENSOR_LABEL, type Condition, type Theme, type Variant } from "../catalog/themes";
import "./catalog.css";

export interface SetupProps {
  theme: Theme;
  variant: Variant;
  condition: Condition;
  index: 0 | 1;
  retry: number;
  /** 何回のうちの何回目か（平均を取る実験。1 なら出さない） */
  attempt: number;
  repeats: number;
  onReady: () => void;
  onBack: () => void;
  onHome: () => void;
}

/** 条件の準備。ここではまだセンサーを読まない。「測る」を押した瞬間から読む */
export function Setup({ theme, variant, condition, index, retry, attempt, repeats, onReady, onBack, onHome }: SetupProps) {
  const sensors = theme.sensors.map((s) => SENSOR_LABEL[s]).join("・");
  const second = index === 1;
  return (
    <Screen badge={`準備 ${condition.key}`} onHome={onHome}>
      <Card panel>
        <Eyebrow>{index === 0 ? "1 つ目の条件" : "2 つ目の条件"}{retry > 0 ? `（再測定 ${retry} 回目）` : ""}</Eyebrow>
        <CardTitle>{condition.label}</CardTitle>
        {repeats > 1 && <p className="card__hint">同じ条件を {repeats} 回測って、平均で判定します（いまは {Math.min(attempt, repeats)} 回目）</p>}
        <div className="setup-art" aria-hidden>
          {theme.measureProfile === "pitch" ? (
            <SoundArt strong={second && variant.variable === "strength"} short={second && variant.variable === "length"} bottle={variant.variable === "water"} water={second && variant.variable === "water"} />
          ) : (
            <PendulumArt
              heavy={second && variant.variable === "mass"}
              long={second && variant.variable === "length"}
              wide={second && variant.variable === "amplitude"}
              lift={variant.variable === "height" ? (second ? "high" : "low") : theme.measureProfile === "pendulum_speed" ? "low" : null}
            />
          )}
        </div>
        <div className="step">
          <span className="step__n">1</span>
          <p style={{ fontSize: 14, lineHeight: 1.6 }}>{condition.setup}</p>
        </div>
        <div className="step">
          <span className="step__n">2</span>
          <p style={{ fontSize: 14, lineHeight: 1.6 }}>
            {theme.measureHint}。読み取りは {theme.seconds} 秒だけです
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

interface PendulumArtProps {
  heavy: boolean;
  long: boolean;
  wide: boolean;
  /** 放す高さ（中 3）。null は高さを描かない */
  lift: "low" | "high" | null;
}

function PendulumArt({ heavy, long, wide, lift }: PendulumArtProps) {
  const len = long ? 92 : 70;
  // 高さの差が絵で見えるように、放す角度は実際（26° / 41°）より大きく描く
  const ang = wide ? 32 : lift === "high" ? 55 : lift === "low" ? 36 : 14;
  const rad = (ang * Math.PI) / 180;
  const x = 90 + len * Math.sin(rad);
  const y = 14 + len * Math.cos(rad);
  const bottomY = 14 + len;
  return (
    <svg width={180} height={130} viewBox="0 0 180 130" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
      <path d="M30 14h120" />
      <circle cx={90} cy={14} r={3} fill="currentColor" />
      {lift && <rect x={81} y={bottomY - 2} width={18} height={24} rx={4} strokeDasharray="3 3" opacity={0.45} />}
      <path d={`M90 14 L${x.toFixed(1)} ${y.toFixed(1)}`} />
      <rect x={x - 9} y={y - 2} width={18} height={24} rx={4} fill="var(--card)" />
      {heavy && <rect x={x - 9} y={y + 24} width={18} height={10} rx={3} fill="var(--orange)" stroke="var(--orange)" />}
      {lift && (
        <>
          <path d={`M90 ${bottomY} v24`} strokeDasharray="3 4" opacity={0.5} />
          <path d={`M${(x + 16).toFixed(1)} ${(bottomY + 22).toFixed(1)} V${(y + 22).toFixed(1)}`} stroke="var(--orange)" />
          <path d={`M${(x + 12).toFixed(1)} ${(y + 26).toFixed(1)} l4 -4 4 4`} stroke="var(--orange)" />
          <path d={`M72 ${bottomY + 30} h30`} stroke="var(--teal)" />
          <path d={`M96 ${bottomY + 26} l6 4 -6 4`} stroke="var(--teal)" />
        </>
      )}
      {!lift && (
        <path d={`M${(90 - len * Math.sin(rad) - 4).toFixed(1)} ${(y + 14).toFixed(1)} Q90 ${(y + 30).toFixed(1)} ${(x + 4).toFixed(1)} ${(y + 14).toFixed(1)}`} stroke="var(--teal)" strokeDasharray="4 4" />
      )}
    </svg>
  );
}

interface SoundArtProps {
  strong: boolean;
  short: boolean;
  bottle: boolean;
  water: boolean;
}

function SoundArt({ strong, short, bottle, water }: SoundArtProps) {
  if (bottle) {
    return (
      <svg width={180} height={130} viewBox="0 0 180 130" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
        <path d="M78 12h24v14q16 8 16 26v54q0 10 -10 10H72q-10 0 -10 -10V52q0 -18 16 -26z" />
        {water && <path d="M63 76h54v30q0 9 -9 9H72q-9 0 -9 -9z" fill="var(--orange)" opacity={0.3} stroke="none" />}
        <path d="M34 22 q6 -6 12 0 M28 32 q12 -10 24 0" stroke="var(--teal)" />
      </svg>
    );
  }
  const amp = strong ? 16 : 6;
  const startX = short ? 94 : 30;
  const segments = short ? 3 : 6;
  const wave = `M${startX} 36 q10 ${-amp} 20 0` + " t20 0".repeat(segments - 1);
  return (
    <svg width={180} height={130} viewBox="0 0 180 130" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
      <rect x={30} y={64} width={120} height={50} rx={6} fill="var(--card)" />
      <ellipse cx={90} cy={84} rx={24} ry={8} />
      <path d="M22 74 H158" stroke="var(--orange)" strokeWidth={2.4} />
      {short && <circle cx={90} cy={74} r={6} fill="var(--orange)" stroke="var(--orange)" />}
      <path d={wave} stroke="var(--teal)" strokeDasharray="4 4" />
    </svg>
  );
}
