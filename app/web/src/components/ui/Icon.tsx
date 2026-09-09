import type { SVGProps } from "react";

export type IconName =
  | "target"
  | "timer"
  | "check"
  | "box-check"
  | "warn"
  | "bulb"
  | "shield-x"
  | "ribbon"
  | "list"
  | "stop"
  | "arrow"
  | "gear";

type Props = SVGProps<SVGSVGElement> & { name: IconName; size?: number };

/** 線画アイコン。色は currentColor、太さは 1.8。アートボードの線画と同じ密度 */
export function Icon({ name, size = 18, ...rest }: Props) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    ...rest,
  };
  switch (name) {
    case "target":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8" />
          <circle cx="12" cy="12" r="2.5" />
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
        </svg>
      );
    case "timer":
      return (
        <svg {...common}>
          <circle cx="12" cy="13" r="8" />
          <path d="M12 9v4l2.5 2M9 2h6" />
        </svg>
      );
    case "check":
      return (
        <svg {...common}>
          <path d="M5 12.5l4.5 4.5L19 7" />
        </svg>
      );
    case "box-check":
      return (
        <svg {...common}>
          <rect x="4" y="4" width="16" height="16" rx="3" />
          <path d="M8 12.5l2.8 2.8L16.5 9" />
        </svg>
      );
    case "warn":
      return (
        <svg {...common}>
          <path d="M12 3.5L2.5 20h19L12 3.5z" />
          <path d="M12 10v4.5M12 17.5h.01" />
        </svg>
      );
    case "bulb":
      return (
        <svg {...common}>
          <path d="M9 18h6M10 21h4" />
          <path d="M8 13.5A6 6 0 1 1 16 13.5c-.8.8-1.3 1.7-1.5 2.5h-5c-.2-.8-.7-1.7-1.5-2.5z" />
        </svg>
      );
    case "shield-x":
      return (
        <svg {...common}>
          <path d="M12 3l7 3v5c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V6l7-3z" />
          <path d="M9.5 9.5l5 5M14.5 9.5l-5 5" />
        </svg>
      );
    case "ribbon":
      return (
        <svg {...common}>
          <circle cx="12" cy="9" r="5.5" />
          <path d="M8.5 13.5L7 21l5-2.5L17 21l-1.5-7.5" />
        </svg>
      );
    case "list":
      return (
        <svg {...common}>
          <rect x="4" y="3.5" width="16" height="17" rx="2.5" />
          <path d="M8 8.5h8M8 12h8M8 15.5h5" />
        </svg>
      );
    case "stop":
      return (
        <svg {...common}>
          <rect x="6" y="6" width="12" height="12" rx="2" />
        </svg>
      );
    case "arrow":
      return (
        <svg {...common}>
          <path d="M4 12h15M14 6l6 6-6 6" />
        </svg>
      );
    case "gear":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3" />
          <path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8" />
        </svg>
      );
  }
}
