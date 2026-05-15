import type { SVGProps } from "react";

interface OwlProps extends SVGProps<SVGSVGElement> {
  /** Trigger a brief "blink" — the closed (winking) eye opens momentarily.
   *  Toggle by changing this number; each new value triggers one animation. */
  blinkKey?: number;
}

/**
 * Cartoon owl mascot with one eye permanently winking.
 * When `blinkKey` changes, the closed eye briefly opens (CSS animation).
 */
export function Owl({ blinkKey = 0, ...svgProps }: OwlProps) {
  return (
    <svg viewBox="0 0 1024 1024" {...svgProps}>
      {/* Soft drop shadow */}
      <ellipse cx="512" cy="912" rx="280" ry="22" fill="#000000" opacity="0.18" />

      {/* Body + ears silhouette */}
      <path
        d="M 270 310 L 232 132 L 386 286 Q 448 270 512 270 Q 576 270 638 286 L 792 132 L 754 310 C 836 358, 836 460, 836 542 C 836 728, 720 838, 600 872 C 540 886, 484 886, 424 872 C 304 838, 188 728, 188 542 C 188 460, 188 358, 270 310 Z"
        fill="#7a4a2a"
        stroke="#2a1810"
        strokeWidth="22"
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {/* Upper highlight */}
      <ellipse cx="512" cy="430" rx="270" ry="150" fill="#9c6336" opacity="0.55" />

      {/* Face disc */}
      <ellipse
        cx="512"
        cy="556"
        rx="262"
        ry="232"
        fill="#dcb886"
        stroke="#3a2415"
        strokeWidth="14"
      />

      {/* Inner-face lighter highlight */}
      <ellipse cx="512" cy="500" rx="220" ry="120" fill="#ecd2a8" opacity="0.55" />

      {/* V-shaped brow */}
      <path d="M 470 396 L 512 460 L 462 412 Z" fill="#3a2415" />
      <path d="M 554 396 L 512 460 L 562 412 Z" fill="#3a2415" />

      {/* Left eye (always open) */}
      <circle cx="408" cy="544" r="78" fill="#ffffff" />
      <circle
        cx="408"
        cy="544"
        r="78"
        fill="none"
        stroke="#3a2415"
        strokeWidth="12"
      />
      <circle cx="408" cy="544" r="60" fill="#f5c542" />
      <circle cx="408" cy="552" r="34" fill="#0a0606" />
      <circle cx="426" cy="532" r="12" fill="#ffffff" />

      {/* Right eye — wink default; flips open during blink animation */}
      <g key={`right-eye-${blinkKey}`} className="owl-right-eye">
        <g className="owl-eye-closed">
          <path
            d="M 538 538 C 580 580, 652 580, 694 538 C 660 568, 580 576, 538 562 Z"
            fill="#3a2415"
          />
        </g>
        <g className="owl-eye-open">
          <circle cx="616" cy="544" r="78" fill="#ffffff" />
          <circle
            cx="616"
            cy="544"
            r="78"
            fill="none"
            stroke="#3a2415"
            strokeWidth="12"
          />
          <circle cx="616" cy="544" r="60" fill="#f5c542" />
          <circle cx="616" cy="552" r="34" fill="#0a0606" />
          <circle cx="634" cy="532" r="12" fill="#ffffff" />
        </g>
      </g>

      {/* Beak */}
      <path
        d="M 482 600 L 542 600 L 512 668 Z"
        fill="#c47538"
        stroke="#5a2e15"
        strokeWidth="6"
        strokeLinejoin="round"
      />
      <path
        d="M 496 612 L 504 612 L 506 632 L 498 632 Z"
        fill="#f0c188"
      />
    </svg>
  );
}
