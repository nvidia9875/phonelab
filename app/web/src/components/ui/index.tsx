import type { ButtonHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";
import { Icon, type IconName } from "./Icon";
import "./ui.css";

/* ---------- Screen ---------- */
type BadgeTone = "ink" | "teal" | "orange" | "outline";

export function Screen({
  badge,
  tone = "ink",
  tight,
  children,
}: {
  badge: string;
  tone?: BadgeTone;
  tight?: boolean;
  children: ReactNode;
}) {
  return (
    <main className={`screen${tight ? " screen--tight" : ""}`}>
      <header className="screen__head">
        <h1 className="screen__title">PhoneLab</h1>
        <Badge tone={tone}>{badge}</Badge>
      </header>
      {children}
    </main>
  );
}

export function Badge({ tone = "ink", children }: { tone?: BadgeTone; children: ReactNode }) {
  return <span className={`badge${tone !== "ink" ? ` badge--${tone}` : ""}`}>{children}</span>;
}

export function Foot({ row, children }: { row?: boolean; children: ReactNode }) {
  return <footer className={`screen__foot${row ? " screen__foot--row" : ""}`}>{children}</footer>;
}

/* ---------- Card ---------- */
type CardVariant = "ink" | "line" | "orange" | "navy";
export function Card({
  variant = "ink",
  panel,
  row,
  children,
  as: Tag = "section",
}: {
  variant?: CardVariant;
  panel?: boolean;
  row?: boolean;
  children: ReactNode;
  as?: "section" | "div" | "article";
}) {
  const cls = ["card", variant !== "ink" && `card--${variant}`, panel && "card--panel", row && "card--row"]
    .filter(Boolean)
    .join(" ");
  return <Tag className={cls}>{children}</Tag>;
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="card__eyebrow">{children}</p>;
}
export function CardTitle({ size, children }: { size?: "lg" | "md"; children: ReactNode }) {
  return <h2 className={`card__title${size ? ` card__title--${size}` : ""}`}>{children}</h2>;
}
export function CardBody({ children }: { children: ReactNode }) {
  return <p className="card__body">{children}</p>;
}
export function CardLabel({ icon, orange, children }: { icon: IconName; orange?: boolean; children: ReactNode }) {
  return (
    <p className={`card__label${orange ? " card__label--orange" : ""}`}>
      <Icon name={icon} />
      {children}
    </p>
  );
}

export function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="section">
      <p className="section__label">{label}</p>
      {children}
    </section>
  );
}

/* ---------- Pair ---------- */
export function Pair({ items }: { items: { k: string; v: string }[] }) {
  return (
    <div className="pair">
      {items.map((it) => (
        <div className="pair__cell" key={it.k}>
          <p className="pair__k">{it.k}</p>
          <p className="pair__v">{it.v}</p>
        </div>
      ))}
    </div>
  );
}

/* ---------- Rows ---------- */
export function InfoRow({ icon, top, children }: { icon: IconName; top?: boolean; children: ReactNode }) {
  return (
    <div className={`row${top ? " row--top" : ""}`}>
      <Icon name={icon} className="row__icon" />
      <p>{children}</p>
    </div>
  );
}

/** 許可チップ: 「何を、何秒」を承認ボタンの真上に必ず置く */
export function PermitChip({ sensors, seconds, denied }: { sensors: string; seconds: number; denied: string }) {
  return (
    <div className="permit" role="note">
      <Icon name="timer" className="permit__icon" />
      <p>
        <strong>使うセンサー</strong>　{sensors}を <strong>{seconds}秒</strong> だけ。{denied}
      </p>
    </div>
  );
}

/* ---------- Checks ---------- */
export function Checks({ children }: { children: ReactNode }) {
  return <div className="checks">{children}</div>;
}
export function Check({ warn, top, children }: { warn?: boolean; top?: boolean; children: ReactNode }) {
  return (
    <div className={`check${warn ? " check--warn" : ""}${top ? " check--top" : ""}`}>
      <Icon name={warn ? "warn" : "check"} className="check__icon" />
      <p>{children}</p>
    </div>
  );
}

/* ---------- Stat / Counter ---------- */
export function Stat({ label, value, unit = "s", md, children }: { label: string; value: string; unit?: string; md?: boolean; children?: ReactNode }) {
  return (
    <Card>
      <div className="stat">
        <Eyebrow>{label}</Eyebrow>
        {children}
        <p className={`stat__v${md ? " stat__v--md" : ""}`}>
          {value} <span className="stat__unit">{unit}</span>
        </p>
      </div>
    </Card>
  );
}
export function Grid2({ children }: { children: ReactNode }) {
  return <div className="grid2">{children}</div>;
}
export function Counter({ value, of, sub }: { value: number; of: number; sub: string }) {
  return (
    <div className="counter" aria-live="polite">
      <p className="counter__v">
        {value}
        <span className="counter__of"> / {of} s</span>
      </p>
      <p className="counter__sub">{sub}</p>
    </div>
  );
}

/* ---------- Wave ---------- */
export function Wave({ dashed, gapAt }: { dashed?: boolean; gapAt?: number }) {
  const w = 300;
  const h = 44;
  const pts: string[] = [];
  for (let x = 0; x <= w; x += 3) {
    const y = h / 2 - Math.sin((x / w) * Math.PI * 7) * 14;
    pts.push(`${x},${y.toFixed(1)}`);
  }
  const d = `M${pts.join(" L")}`;
  return (
    <svg className={`wave${gapAt !== undefined ? " wave--gap-mark" : ""}`} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden>
      <path d={d} stroke="var(--teal)" strokeWidth={2} fill="none" strokeDasharray={dashed ? "6 5" : undefined} />
      {gapAt !== undefined && (
        <g>
          <rect x={gapAt - 24} y={4} width={48} height={h - 8} rx={6} fill="var(--sand)" stroke="var(--ink)" strokeWidth={1.5} strokeDasharray="4 3" />
          <text x={gapAt} y={h / 2 + 4} textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--ink)">
            欠測
          </text>
        </g>
      )}
    </svg>
  );
}

/* ---------- Buttons ---------- */
type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { secondary?: boolean; sm?: boolean };
export function Button({ secondary, sm, className, ...rest }: BtnProps) {
  const cls = ["btn", secondary && "btn--secondary", sm && "btn--sm", className].filter(Boolean).join(" ");
  return <button type="button" className={cls} {...rest} />;
}

export function Choices<T extends string>({ options, value, onChange }: { options: { v: T; label: string }[]; value: T | null; onChange: (v: T) => void }) {
  return (
    <div className="choices" role="group">
      {options.map((o) => (
        <button key={o.v} type="button" className="choice" aria-pressed={value === o.v} onClick={() => onChange(o.v)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Field(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className="field" rows={3} {...props} />;
}

export function Note({ icon = "warn", children }: { icon?: IconName; children: ReactNode }) {
  return (
    <div className="note">
      <Icon name={icon} className="note__icon" />
      <p>{children}</p>
    </div>
  );
}
export function FootNote({ children }: { children: ReactNode }) {
  return <p className="foot-note">{children}</p>;
}

/* ---------- Timeline / Signature ---------- */
export type TimelineItem = { t: string; k: string; tone?: "orange" | "teal"; body: ReactNode };
export function Timeline({ items }: { items: TimelineItem[] }) {
  return (
    <ol className="timeline" style={{ listStyle: "none", margin: 0 }}>
      {items.map((it, i) => (
        <li className="tl" key={i}>
          <p className="tl__t">{it.t}</p>
          <p className="tl__b">
            <span className={`tl__k${it.tone ? ` tl__k--${it.tone}` : ""}`}>{it.k}</span>　{it.body}
          </p>
        </li>
      ))}
    </ol>
  );
}

export function Signature({ signer, hash, note }: { signer: string; hash: string; note: string }) {
  return (
    <div className="sig">
      <QrMark />
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        <p className="sig__t">署名　{signer}</p>
        <p className="sig__hash">hash {hash}</p>
        <p className="sig__note">{note}</p>
      </div>
    </div>
  );
}
function QrMark() {
  // 見た目だけの QR 風マーク。実物は record-schema.md 3.3 の検証 URL を符号化する
  const cells = [
    [1, 1, 1, 0, 1, 0, 1, 1, 1],
    [1, 0, 1, 0, 0, 1, 1, 0, 1],
    [1, 1, 1, 0, 1, 0, 1, 1, 1],
    [0, 0, 0, 1, 0, 1, 0, 0, 0],
    [1, 0, 1, 0, 1, 1, 0, 1, 0],
    [0, 1, 0, 1, 0, 0, 1, 0, 1],
    [1, 1, 1, 0, 1, 0, 0, 1, 0],
    [1, 0, 1, 0, 0, 1, 1, 0, 1],
    [1, 1, 1, 0, 1, 0, 1, 0, 1],
  ];
  return (
    <svg className="sig__qr" width={56} height={56} viewBox="0 0 9 9" aria-hidden>
      {cells.map((r, y) => r.map((c, x) => (c ? <rect key={`${x}${y}`} x={x} y={y} width={1} height={1} fill="currentColor" /> : null)))}
    </svg>
  );
}

export function LinkRow({ children }: { children: ReactNode }) {
  return <div className="links">{children}</div>;
}
export function Link({ icon, onClick, children }: { icon: IconName; onClick?: () => void; children: ReactNode }) {
  return (
    <button type="button" className="link" onClick={onClick}>
      <Icon name={icon} />
      {children}
    </button>
  );
}

export { Icon };
