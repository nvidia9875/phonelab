/**
 * テーマのイラスト（線画）。アイデアシートの「振り子 T = 1.42 s」と同じタッチ。
 * 紺の線、青緑は測定の軌跡、橙は変えるもの。viewBox は 120×90 で統一。
 */
const S = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
const TEAL = "var(--teal)";
const ORANGE = "var(--orange)";

function Frame({ children, muted }: { children: React.ReactNode; muted?: boolean }) {
  return (
    <svg className={`theme-art${muted ? " theme-art--muted" : ""}`} viewBox="0 0 120 90" aria-hidden>
      {children}
    </svg>
  );
}

export function ThemeArt({ id, muted }: { id: string; muted?: boolean }) {
  switch (id) {
    case "energy":
      return (
        <Frame muted={muted}>
          <path {...S} d="M20 12h80" />
          <circle cx="60" cy="12" r="3" fill="currentColor" />
          <path {...S} d="M60 12 L34 50" strokeDasharray="3 4" opacity="0.5" />
          <rect {...S} x="26" y="48" width="14" height="18" rx="3" opacity="0.5" />
          <path {...S} d="M60 12 L60 60" />
          <rect {...S} x="52" y="58" width="16" height="22" rx="4" fill="var(--card)" />
          <path {...S} d="M18 70 V50" stroke={ORANGE} />
          <path {...S} d="M14 54 l4 -4 4 4" stroke={ORANGE} />
          <path {...S} d="M74 74 h26" stroke={TEAL} />
          <path {...S} d="M94 70 l6 4 -6 4" stroke={TEAL} />
          <text x="78" y="66" fontSize="9" fontWeight="700" fill={TEAL} fontFamily="var(--font-head)">v</text>
        </Frame>
      );
    case "sound":
      return (
        <Frame muted={muted}>
          <rect {...S} x="22" y="44" width="68" height="34" rx="4" />
          <ellipse {...S} cx="56" cy="58" rx="14" ry="5" />
          <path {...S} d="M16 52 H96" stroke={ORANGE} />
          <path {...S} d="M24 30 q5 -10 10 0 t10 0 t10 0 t10 0 t10 0" stroke={TEAL} />
          <path {...S} d="M102 40 q6 6 0 12 M108 34 q10 12 0 24" stroke={TEAL} />
        </Frame>
      );
    case "pendulum":
      return (
        <Frame muted={muted}>
          <path {...S} d="M20 14h80" />
          <circle cx="60" cy="14" r="3" fill="currentColor" />
          <path {...S} d="M60 14 L78 58" />
          <rect {...S} x="70" y="56" width="16" height="24" rx="4" fill="var(--card)" />
          <path {...S} d="M34 66 Q60 84 88 66" stroke={TEAL} strokeDasharray="4 4" />
          <text x="26" y="34" fontSize="9" fontWeight="700" fill={TEAL} fontFamily="var(--font-head)">T = 1.42 s</text>
        </Frame>
      );
    case "freefall":
      return (
        <Frame muted={muted}>
          <rect {...S} x="18" y="20" width="18" height="34" rx="4" />
          <circle {...S} cx="27" cy="30" r="3" />
          <path {...S} d="M27 40 v6" stroke={TEAL} />
          <circle {...S} cx="70" cy="22" r="6" stroke={ORANGE} />
          <rect {...S} x="90" y="16" width="12" height="10" rx="2" stroke={ORANGE} />
          <path {...S} d="M70 32 v26 M96 30 v28" strokeDasharray="3 4" />
          <path {...S} d="M56 74 h52" />
          <path {...S} d="M60 70 q8 -6 16 0 q8 6 16 0 q8 -6 16 0" stroke={TEAL} />
        </Frame>
      );
    case "bottle":
      return (
        <Frame muted={muted}>
          <path {...S} d="M52 12h16v10q10 6 10 18v30q0 8 -8 8H50q-8 0 -8 -8V40q0 -12 10 -18z" />
          <path {...S} d="M42 52h36" stroke={ORANGE} />
          <path d="M43 53h34v20q0 5 -5 5H48q-5 0 -5 -5z" fill={ORANGE} opacity="0.25" />
          <path {...S} d="M22 22 q6 -6 12 0 M18 32 q10 -8 20 0" stroke={TEAL} />
          <path {...S} d="M92 30 q6 4 0 8 M98 24 q10 8 0 16" stroke={TEAL} />
        </Frame>
      );
    case "beat":
      return (
        <Frame muted={muted}>
          <rect {...S} x="14" y="24" width="20" height="36" rx="4" />
          <circle {...S} cx="24" cy="46" r="5" />
          <rect {...S} x="86" y="24" width="20" height="36" rx="4" />
          <circle {...S} cx="96" cy="46" r="5" />
          <path {...S} d="M42 42 q6 -18 12 0 t12 0 t12 0 t12 0" stroke={TEAL} />
          <path {...S} d="M42 42 q9 -30 18 0 t18 0 t18 0" stroke={ORANGE} opacity="0.7" />
        </Frame>
      );
    case "echo":
      return (
        <Frame muted={muted}>
          <path {...S} d="M100 12v66" strokeWidth="3" />
          <path {...S} d="M100 20l6 -4 M100 34l6 -4 M100 48l6 -4 M100 62l6 -4" />
          <rect {...S} x="18" y="34" width="14" height="24" rx="3" />
          <path {...S} d="M40 46h44" stroke={TEAL} strokeDasharray="4 4" />
          <path {...S} d="M78 42l6 4 -6 4 M46 42l-6 4 6 4" stroke={TEAL} />
          <path {...S} d="M20 20 q6 -6 12 0" stroke={ORANGE} />
        </Frame>
      );
    case "coin_slip":
      return (
        <Frame muted={muted}>
          <path {...S} d="M14 72 L100 72 L100 30 Z" />
          <ellipse {...S} cx="64" cy="49" rx="9" ry="4" transform="rotate(-26 64 49)" stroke={ORANGE} />
          <path {...S} d="M52 56 l-10 6" stroke={TEAL} />
          <path {...S} d="M76 72 a24 24 0 0 0 -4 -11" stroke={TEAL} />
          <text x="60" y="82" fontSize="8" fontWeight="700" fill={TEAL} fontFamily="var(--font-head)">θ</text>
        </Frame>
      );
    case "jump":
      return (
        <Frame muted={muted}>
          <circle {...S} cx="60" cy="18" r="7" />
          <path {...S} d="M60 25v20 M60 32l-12 8 M60 32l12 8 M60 45l-9 16 M60 45l9 16" />
          <rect {...S} x="52" y="34" width="6" height="8" rx="1" stroke={ORANGE} />
          <path {...S} d="M20 78h80" />
          <path {...S} d="M28 74 q32 -34 64 0" stroke={TEAL} strokeDasharray="4 4" />
        </Frame>
      );
    case "elevator":
      return (
        <Frame muted={muted}>
          <rect {...S} x="30" y="10" width="60" height="70" rx="4" />
          <path {...S} d="M60 10v70" />
          <path {...S} d="M100 40l0 -18 M96 26l4 -4 4 4" stroke={TEAL} />
          <circle {...S} cx="46" cy="44" r="5" />
          <path {...S} d="M46 49v14 M40 60l6 -6 6 6" />
        </Frame>
      );
    case "spin":
      return (
        <Frame muted={muted}>
          <ellipse {...S} cx="60" cy="32" rx="26" ry="8" />
          <path {...S} d="M60 40v24 M40 74h40 M60 64v10" />
          <path {...S} d="M28 32 a32 12 0 0 1 20 -10" stroke={TEAL} />
          <path {...S} d="M48 22l-4 6 6 1" stroke={TEAL} />
          <path {...S} d="M92 32 a32 12 0 0 1 -20 10" stroke={TEAL} opacity="0.5" />
        </Frame>
      );
    case "pulse":
      return (
        <Frame muted={muted}>
          <rect {...S} x="44" y="18" width="32" height="56" rx="6" />
          <circle {...S} cx="60" cy="28" r="4" stroke={ORANGE} />
          <path {...S} d="M18 60h12l5 -14 6 26 6 -18 4 6h10" stroke={TEAL} />
          <path {...S} d="M84 30 q10 -12 14 0 q-4 10 -14 14 q-10 -4 -14 -14 q4 -12 14 0z" stroke={ORANGE} transform="translate(8 -8) scale(0.7)" />
        </Frame>
      );
    default:
      return (
        <Frame muted={muted}>
          <circle {...S} cx="60" cy="45" r="22" />
        </Frame>
      );
  }
}
