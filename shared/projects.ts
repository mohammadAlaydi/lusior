/*
 * Shared project data contract — the single source of truth for both the
 * Express backend (which serves it over /api) and the Vite frontend (which
 * uses these types and keeps a copy as an offline fallback).
 *
 * All copy, project names, palettes and media are ORIGINAL placeholders in the
 * spirit of lusion.co's project pages — never lusion's actual content. The
 * SHAPE mirrors the real site's `#project-details` page so the recreation can
 * be pixel/behaviour-faithful (see docs/project-details-spec.md).
 *
 * Pure data + types only — no Node or browser APIs — so it imports cleanly into
 * both runtimes.
 */

/** Per-project colour theme injected into the `--project-details-*` CSS vars. */
export interface ThemePalette {
  /** Solid backdrop of the detail layer (`--project-details-bg`). */
  bg: string;
  /** Secondary/contrast backdrop used for panels and the back-btn flood. */
  bgAlt: string;
  /** Body + title text colour (`--project-details-text`). */
  text: string;
  /** Accent: links, side-list headings, launch flood, preview bar, logo. */
  highlight: string;
  /** Launch/back pill resting background. */
  btnBg: string;
  /** Launch/back pill resting text. */
  btnText: string;
  /** Launch/back pill text once the dot floods it. */
  btnTextHover: string;
  /** Arrow chip background inside the launch pill. */
  iconBg: string;
  /** Arrow glyph colour inside the launch pill. */
  iconColor: string;
}

/**
 * One block in the horizontal media gallery. `panel` is an original themed
 * gradient placeholder so the gallery reads rich without shipping stock art;
 * `image`/`video` point at real assets and can swap a panel out later.
 */
export type MediaItem =
  | {
      kind: 'image';
      src: string;
      /** CSS width of the inline-block item, e.g. "68em". */
      width: string;
      /** CSS height; "fill" stretches to the gallery band height. */
      height: string;
      alt: string;
      caption?: string;
    }
  | {
      kind: 'video';
      src: string;
      poster?: string;
      width: string;
      height: string;
      alt: string;
      caption?: string;
    }
  | {
      kind: 'panel';
      /** Drives the placeholder gradient: accent | dark | light. */
      tone: 'accent' | 'dark' | 'light';
      width: string;
      height: string;
      /** Big faint label drawn into the panel (original wordmark feel). */
      label?: string;
      caption?: string;
    }
  | {
      kind: 'text';
      text: string;
      width: string;
    };

/** A titled group in the right-hand meta column (Services, Credits, …). */
export interface SideListGroup {
  title: string;
  items: string[];
  /** When true each item renders as an external link. */
  asLinks?: boolean;
}

/** Lightweight project entry used for the home grid + /api/projects list. */
export interface ProjectSummary {
  slug: string;
  title: string;
  /** Bullet-separated discipline line, e.g. "Concept • Web • 3D". */
  category: string;
  /** Accent hex used by the home tile + as a fast theme preview. */
  accent: string;
  thumb: string;
  thumbVideo?: string;
}

/** Full case-study payload for /api/projects/:slug and the detail layer. */
export interface ProjectDetail extends ProjectSummary {
  year: string;
  /** One <p> per entry. */
  description: string[];
  sideLists: SideListGroup[];
  launchUrl?: string;
  launchLabel?: string;
  theme: ThemePalette;
  media: MediaItem[];
  /** Slug of the project the "next project" advance navigates to. */
  nextSlug: string;
}

/** Standard API envelope shared by every endpoint. */
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

const FEATURED = (n: number): { jpg: string; mp4: string } => ({
  jpg: `/featured/p${n}.jpg`,
  mp4: `/featured/p${n}.mp4`,
});

/**
 * Six original placeholder case studies, chained in a ring for the
 * "next project" advance. Palettes are deliberately distinct so the
 * theme-injection is obvious between projects.
 */
export const PROJECTS: ProjectDetail[] = [
  {
    slug: 'aurora-bloom',
    title: 'Aurora Bloom',
    category: 'Concept • Web • Design • 3D',
    accent: '#2b3afb',
    thumb: FEATURED(1).jpg,
    thumbVideo: FEATURED(1).mp4,
    year: '2025',
    description: [
      'Aurora Bloom is a living brand world where a single seed of light unfolds into an interactive bloom. We built the full WebGL system — from the procedural petals to the cursor-reactive caustics — so the surface always feels one gesture away from blooming again.',
      'The result is a launch experience that rewards curiosity: every scroll re-seeds the field, and no two visits draw the same garden.',
    ],
    sideLists: [
      { title: 'Services', items: ['Creative Direction', 'WebGL Engineering', 'Art Direction', 'Motion Design'] },
      { title: 'Credits', items: ['Design — Studio Northwind', 'Build — Northwind Engineering', 'Sound — Field Recordings'] },
    ],
    launchUrl: 'https://example.com/aurora-bloom',
    launchLabel: 'Launch website',
    theme: {
      bg: '#070a23',
      bgAlt: '#0e1340',
      text: '#eef0ff',
      highlight: '#5d6bff',
      btnBg: '#ffffff',
      btnText: '#070a23',
      btnTextHover: '#ffffff',
      iconBg: '#ffffff',
      iconColor: '#070a23',
    },
    media: [
      { kind: 'image', src: FEATURED(1).jpg, width: '64em', height: 'fill', alt: 'Aurora Bloom opening frame' },
      { kind: 'text', text: 'A seed of light, scattered across a dark field, waiting for the first gesture.', width: '26em' },
      { kind: 'panel', tone: 'accent', width: '40em', height: 'fill', label: 'BLOOM' },
      { kind: 'video', src: FEATURED(1).mp4, poster: FEATURED(1).jpg, width: '72em', height: 'fill', alt: 'Aurora Bloom motion study' },
      { kind: 'panel', tone: 'dark', width: '34em', height: 'fill', label: 'CAUSTICS' },
      { kind: 'image', src: FEATURED(4).jpg, width: '50em', height: 'fill', alt: 'Aurora Bloom detail', caption: 'Cursor-reactive caustics' },
    ],
    nextSlug: 'meridian',
  },
  {
    slug: 'meridian',
    title: 'Meridian',
    category: 'Web • Design • Development • Immersive',
    accent: '#8832f7',
    thumb: FEATURED(2).jpg,
    thumbVideo: FEATURED(2).mp4,
    year: '2025',
    description: [
      'Meridian maps an entire product line onto a single rotating horizon. As you travel along it, chapters of the story rise into view and dissolve behind you — a continuous immersive scroll with no visible seams.',
      'We engineered the timeline so every transition is reversible and frame-perfect, giving the brand a flagship they can keep extending.',
    ],
    sideLists: [
      { title: 'Services', items: ['Experience Design', 'Front-end Engineering', 'Immersive 3D', 'Performance'] },
      { title: 'Credits', items: ['Design — Studio Northwind', 'Engineering — Northwind Labs'] },
    ],
    launchUrl: 'https://example.com/meridian',
    launchLabel: 'Launch website',
    theme: {
      bg: '#150a26',
      bgAlt: '#241046',
      text: '#f4ecff',
      highlight: '#a567ff',
      btnBg: '#ffffff',
      btnText: '#150a26',
      btnTextHover: '#ffffff',
      iconBg: '#ffffff',
      iconColor: '#150a26',
    },
    media: [
      { kind: 'panel', tone: 'accent', width: '46em', height: 'fill', label: 'MERIDIAN' },
      { kind: 'image', src: FEATURED(2).jpg, width: '70em', height: 'fill', alt: 'Meridian horizon' },
      { kind: 'text', text: 'One horizon, infinitely long. Every product is a place you travel to.', width: '24em' },
      { kind: 'video', src: FEATURED(2).mp4, poster: FEATURED(2).jpg, width: '74em', height: 'fill', alt: 'Meridian travel sequence' },
      { kind: 'panel', tone: 'light', width: '36em', height: 'fill', label: 'CHAPTERS' },
    ],
    nextSlug: 'continuum',
  },
  {
    slug: 'continuum',
    title: 'Continuum',
    category: '3D • WebGL • Development',
    accent: '#ff4c41',
    thumb: FEATURED(3).jpg,
    thumbVideo: FEATURED(3).mp4,
    year: '2024',
    description: [
      'Continuum is a real-time WebGL installation that turns a data feed into a molten, ever-shifting sculpture. Visitors steer the flow with their cursor, heating and cooling the surface until it settles into a shape that is theirs alone.',
      'Behind the spectacle sits a tuned particle solver that holds sixty frames a second on a mid-range laptop.',
    ],
    sideLists: [
      { title: 'Services', items: ['Real-time Graphics', 'Shader Development', 'Interaction Design'] },
      { title: 'Credits', items: ['Concept — Studio Northwind', 'Shaders — Northwind Labs', 'Data — Open Signals'] },
    ],
    launchUrl: 'https://example.com/continuum',
    launchLabel: 'Launch website',
    theme: {
      bg: '#1c0907',
      bgAlt: '#3a120d',
      text: '#fff0ec',
      highlight: '#ff6a5f',
      btnBg: '#ffffff',
      btnText: '#1c0907',
      btnTextHover: '#ffffff',
      iconBg: '#ffffff',
      iconColor: '#1c0907',
    },
    media: [
      { kind: 'video', src: FEATURED(3).mp4, poster: FEATURED(3).jpg, width: '74em', height: 'fill', alt: 'Continuum molten surface' },
      { kind: 'panel', tone: 'accent', width: '38em', height: 'fill', label: 'FLOW' },
      { kind: 'text', text: 'Heat it, cool it, let it settle. The sculpture you leave behind is yours.', width: '25em' },
      { kind: 'image', src: FEATURED(3).jpg, width: '60em', height: 'fill', alt: 'Continuum still' },
      { kind: 'panel', tone: 'dark', width: '32em', height: 'fill', label: '60 FPS' },
    ],
    nextSlug: 'halcyon',
  },
  {
    slug: 'halcyon',
    title: 'Halcyon',
    category: 'Web • Design • Motion',
    accent: '#14b8a6',
    thumb: FEATURED(4).jpg,
    thumbVideo: FEATURED(4).mp4,
    year: '2024',
    description: [
      'Halcyon is a calm, weightless product tour built around slow parallax and a palette of sea glass. We paced every reveal to the breath, so the whole page feels like it is exhaling as you scroll.',
      'It is proof that immersive does not have to mean loud.',
    ],
    sideLists: [
      { title: 'Services', items: ['Art Direction', 'Front-end Engineering', 'Motion Design'] },
      { title: 'Credits', items: ['Design — Studio Northwind', 'Build — Northwind Engineering'] },
    ],
    launchUrl: 'https://example.com/halcyon',
    launchLabel: 'Launch website',
    theme: {
      bg: '#04161a',
      bgAlt: '#082a30',
      text: '#e9fbf8',
      highlight: '#2fd9c4',
      btnBg: '#ffffff',
      btnText: '#04161a',
      btnTextHover: '#ffffff',
      iconBg: '#ffffff',
      iconColor: '#04161a',
    },
    media: [
      { kind: 'image', src: FEATURED(4).jpg, width: '66em', height: 'fill', alt: 'Halcyon hero' },
      { kind: 'panel', tone: 'accent', width: '42em', height: 'fill', label: 'BREATHE' },
      { kind: 'text', text: 'Paced to the breath — every reveal an exhale.', width: '22em' },
      { kind: 'video', src: FEATURED(4).mp4, poster: FEATURED(4).jpg, width: '70em', height: 'fill', alt: 'Halcyon parallax' },
      { kind: 'panel', tone: 'light', width: '34em', height: 'fill', label: 'SEA GLASS' },
    ],
    nextSlug: 'lumen-field',
  },
  {
    slug: 'lumen-field',
    title: 'Lumen Field',
    category: 'Film • 3D • Animation',
    accent: '#f59e0b',
    thumb: FEATURED(5).jpg,
    thumbVideo: FEATURED(5).mp4,
    year: '2024',
    description: [
      'Lumen Field is a title sequence for a festival that does not exist yet. We grew a field of light-stalks in 3D, lit them like a late-summer dusk, and choreographed the camera to drift through them in a single unbroken take.',
      'Rendered original, scored original, the piece is a sandbox for a look we keep coming back to.',
    ],
    sideLists: [
      { title: 'Services', items: ['Direction', '3D Animation', 'Look Development', 'Compositing'] },
      { title: 'Credits', items: ['Direction — Studio Northwind', 'Animation — Northwind Labs', 'Score — Field Recordings'] },
    ],
    launchUrl: 'https://example.com/lumen-field',
    launchLabel: 'Watch the film',
    theme: {
      bg: '#1c1206',
      bgAlt: '#3a2710',
      text: '#fff4e2',
      highlight: '#ffb13d',
      btnBg: '#ffffff',
      btnText: '#1c1206',
      btnTextHover: '#ffffff',
      iconBg: '#ffffff',
      iconColor: '#1c1206',
    },
    media: [
      { kind: 'panel', tone: 'accent', width: '48em', height: 'fill', label: 'LUMEN' },
      { kind: 'video', src: FEATURED(5).mp4, poster: FEATURED(5).jpg, width: '76em', height: 'fill', alt: 'Lumen Field drift' },
      { kind: 'text', text: 'A single unbroken take through a field of light-stalks at dusk.', width: '26em' },
      { kind: 'image', src: FEATURED(5).jpg, width: '62em', height: 'fill', alt: 'Lumen Field still' },
      { kind: 'panel', tone: 'dark', width: '30em', height: 'fill', label: 'DUSK' },
    ],
    nextSlug: 'northwind',
  },
  {
    slug: 'northwind',
    title: 'Northwind',
    category: 'Web • Development • Brand',
    accent: '#3ddc84',
    thumb: FEATURED(6).jpg,
    thumbVideo: FEATURED(6).mp4,
    year: '2023',
    description: [
      'Northwind is our own studio site — the one you are inside a recreation of right now. It is where we test the techniques before they reach client work: the persistent canvas, the scene morphs, the sound design.',
      'Consider it a living changelog of everything we are curious about.',
    ],
    sideLists: [
      { title: 'Services', items: ['Everything, eventually'] },
      { title: 'Links', items: ['Instagram', 'Twitter / X', 'LinkedIn', 'GitHub'], asLinks: true },
    ],
    launchUrl: '/',
    launchLabel: 'Visit the studio',
    theme: {
      bg: '#06160e',
      bgAlt: '#0c2c1c',
      text: '#e8fff1',
      highlight: '#5bf2a0',
      btnBg: '#ffffff',
      btnText: '#06160e',
      btnTextHover: '#06160e',
      iconBg: '#ffffff',
      iconColor: '#06160e',
    },
    media: [
      { kind: 'image', src: FEATURED(6).jpg, width: '68em', height: 'fill', alt: 'Northwind studio' },
      { kind: 'text', text: 'A living changelog of everything we are curious about.', width: '24em' },
      { kind: 'panel', tone: 'accent', width: '40em', height: 'fill', label: 'NORTHWIND' },
      { kind: 'video', src: FEATURED(6).mp4, poster: FEATURED(6).jpg, width: '72em', height: 'fill', alt: 'Northwind reel' },
      { kind: 'panel', tone: 'light', width: '34em', height: 'fill', label: 'STUDIO' },
    ],
    nextSlug: 'aurora-bloom',
  },
];

/** Look up one project by slug. */
export function findProject(slug: string): ProjectDetail | undefined {
  return PROJECTS.find((p) => p.slug === slug);
}

/** Summary list for the home grid + /api/projects. */
export function projectSummaries(): ProjectSummary[] {
  return PROJECTS.map(({ slug, title, category, accent, thumb, thumbVideo }) => ({
    slug,
    title,
    category,
    accent,
    thumb,
    thumbVideo,
  }));
}
