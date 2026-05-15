import type { SVGProps } from "react";

const base = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function IconPlus(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...p}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function IconSettings(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...p}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.11-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06A2 2 0 1 1 4.14 16.92l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.65 8.85a1.7 1.7 0 0 0-.34-1.87l-.06-.06A2 2 0 1 1 7.08 4.09l.06.06a1.7 1.7 0 0 0 1.87.34h.05A1.7 1.7 0 0 0 10.07 3V2.93a2 2 0 1 1 4 0V3a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.05c.27.65.9 1.06 1.56 1.07H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1.06z" />
    </svg>
  );
}

export function IconFolder(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...p}>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </svg>
  );
}

export function IconTrash(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...p}>
      <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
    </svg>
  );
}

export function IconRefresh(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...p}>
      <path d="M3 12a9 9 0 0 1 15.5-6.36L21 8M21 3v5h-5M21 12a9 9 0 0 1-15.5 6.36L3 16M3 21v-5h5" />
    </svg>
  );
}

export function IconCamera(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...p}>
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}

export function IconChevronRight(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...p}>
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}

export function IconArrowLeft(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...p}>
      <path d="M19 12H5M12 19l-7-7 7-7" />
    </svg>
  );
}

export function IconX(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...p}>
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}

export function IconPause(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...p}>
      <path d="M10 5v14M14 5v14" />
    </svg>
  );
}

export function IconPlay(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...p} fill="currentColor" stroke="none">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

export function IconCheck(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...p}>
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

export function IconDownload(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...p}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
    </svg>
  );
}

export function IconLogo(p: SVGProps<SVGSVGElement>) {
  return (
    <svg width="28" height="28" viewBox="0 0 1024 1024" {...p}>
      <defs>
        <linearGradient id="logoBg" x1="20%" y1="0%" x2="80%" y2="100%">
          <stop offset="0%" stopColor="#4f6cff" />
          <stop offset="55%" stopColor="#6a5cf5" />
          <stop offset="100%" stopColor="#9047e3" />
        </linearGradient>
      </defs>
      <rect x="100" y="100" width="824" height="824" rx="184" fill="url(#logoBg)" />
      <rect x="252" y="346" width="520" height="338" rx="44" fill="#fff" opacity="0.95" />
      <rect x="296" y="402" width="180" height="22" rx="11" fill="#4f6cff" />
      <rect x="296" y="448" width="380" height="14" rx="7" fill="#1c1c1e" opacity="0.2" />
      <rect x="296" y="478" width="320" height="14" rx="7" fill="#1c1c1e" opacity="0.2" />
      <circle cx="724" cy="358" r="58" fill="#fff" />
      <circle cx="724" cy="358" r="36" fill="#ff453a" />
    </svg>
  );
}
