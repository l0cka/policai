/*
 * Inline icons in the Lucide idiom (24px grid, 1.75 stroke, round caps), drawn
 * here rather than pulled from a package so the dashboard keeps its four
 * dependencies. Every icon inherits `currentColor`, so theming is automatic.
 */

type IconProps = { className?: string };

/*
 * `width`/`height` are presentation attributes, so any CSS rule still overrides
 * them. They exist only so an icon dropped into a flex row without a matching
 * size rule takes one em rather than the SVG default of 300x150.
 */
const base = {
  viewBox: '0 0 24 24',
  width: '1em',
  height: '1em',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

export function Sun(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  );
}

export function Monitor(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect width="20" height="14" x="2" y="3" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </svg>
  );
}

export function Moon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    </svg>
  );
}

export function Search(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

export function ArrowUpRight(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M7 17 17 7M7 7h10v10" />
    </svg>
  );
}

export function ArrowRight(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

export function Flag(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V4s-1 1-4 1-5-2-8-2-4 1-4 1Z" />
      <path d="M4 22v-7" />
    </svg>
  );
}

export function CheckCircle(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12.5 2.5 2.5 4.5-5" />
    </svg>
  );
}

export function CircleAlert(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v5M12 16.5h.01" />
    </svg>
  );
}

export function CircleDash(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="9" strokeDasharray="3 3" />
    </svg>
  );
}

/*
 * The radar mark: three sweep arcs opening from a fixed origin, with the
 * returned blip sitting on the outer arc. It reads at 28px in the masthead.
 */
export function RadarMark(props: IconProps) {
  return (
    <svg viewBox="0 0 32 32" width="1em" height="1em" fill="none" aria-hidden="true" {...props}>
      <path
        d="M6 26a14 14 0 0 1 14-14"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.35"
      />
      <path
        d="M6 26a9 9 0 0 1 9-9"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.6"
      />
      <path d="M6 26a4 4 0 0 1 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="6" cy="26" r="2" fill="currentColor" />
      <circle cx="24" cy="8" r="2.75" fill="currentColor" />
    </svg>
  );
}
