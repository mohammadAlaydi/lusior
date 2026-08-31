/*
 * Shared project data contract — the versioned portfolio CMS consumed by the
 * Express API and the Vite fallback. Case-study media uses only reviewed,
 * public-safe captures under `public/media`.
 */

export interface ThemePalette {
  bg: string;
  bgAlt: string;
  text: string;
  highlight: string;
  btnBg: string;
  btnText: string;
  btnTextHover: string;
  iconBg: string;
  iconColor: string;
}

export type MediaItem =
  | {
      kind: 'image';
      src: string;
      width: string;
      height: string;
      alt: string;
      caption?: string;
      fit?: 'cover' | 'contain';
    }
  | {
      kind: 'video';
      src: string;
      poster?: string;
      width: string;
      height: string;
      alt: string;
      caption?: string;
      fit?: 'cover' | 'contain';
    }
  | {
      kind: 'panel';
      tone: 'accent' | 'dark' | 'light';
      width: string;
      height: string;
      label?: string;
      caption?: string;
    }
  | { kind: 'text'; text: string; width: string };

export interface SideListGroup {
  title: string;
  items: string[];
  asLinks?: boolean;
}

export interface ProjectSummary {
  slug: string;
  title: string;
  category: string;
  accent: string;
  thumb: string;
  thumbVideo?: string;
}

export interface ProjectLaunch {
  label: string;
  url: string;
}

export interface ProjectDetail extends ProjectSummary {
  year: string;
  description: string[];
  sideLists: SideListGroup[];
  launches: ProjectLaunch[];
  theme: ThemePalette;
  media: MediaItem[];
  nextSlug: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

const lightButton = (bg: string, bgAlt: string, text: string, highlight: string): ThemePalette => ({
  bg,
  bgAlt,
  text,
  highlight,
  btnBg: '#ffffff',
  btnText: bg,
  btnTextHover: '#ffffff',
  iconBg: '#ffffff',
  iconColor: bg,
});

/** Factual Reevez product stories, chained in featured-grid order. */
export const PROJECTS: ProjectDetail[] = [
  {
    slug: 'magic-stamp',
    title: 'Magic Stamp',
    category: 'Product • Mobile • Loyalty',
    accent: '#e85d3f',
    thumb: '/media/magic-stamp/thumb.jpg',
    thumbVideo: '/media/magic-stamp/loop.mp4',
    year: '2026',
    description: [
      'Magic Stamp brings a familiar loyalty ritual into a digital product: customers collect stamps while merchants run the programme from connected tools. We designed and engineered the product story across web, portals, mobile apps, and the services that connect them.',
      'The work spans the original Magic Stamp platform and its Stampi product lineage, with interfaces built for the people collecting rewards and the teams operating the programme.',
    ],
    sideLists: [
      {
        title: 'Scope',
        items: ['Product Design', 'Web Experience', 'Mobile Applications', 'Merchant Tools'],
      },
      {
        title: 'Platform',
        items: ['Customer loyalty', 'Merchant operations', 'Connected services'],
      },
    ],
    launches: [
      { label: 'Visit Magic Stamp', url: 'https://magicstamp.com' },
      {
        label: 'Google Play',
        url: 'https://play.google.com/store/apps/details?id=com.parktechnology.purse',
      },
      {
        label: 'App Store',
        url: 'https://apps.apple.com/us/app/magic-stamp/id1419555996',
      },
    ],
    theme: lightButton('#22110f', '#3b1d19', '#fff3ee', '#ff8a6c'),
    media: [
      {
        kind: 'image',
        src: '/media/magic-stamp/thumb.jpg',
        width: '64em',
        height: 'fill',
        alt: 'Magic Stamp public website on a desktop browser',
        caption: 'Captured from the live Magic Stamp product website',
      },
      {
        kind: 'video',
        src: '/media/magic-stamp/loop.mp4',
        poster: '/media/magic-stamp/poster.jpg',
        width: '64em',
        height: 'fill',
        alt: 'Screen recording of the live Magic Stamp website',
        caption: 'A real product walkthrough, recorded from the live site',
      },
      {
        kind: 'image',
        src: '/media/magic-stamp/phone-login.jpg',
        width: '28em',
        height: 'fill',
        alt: 'Stampi mobile application login screen running in an Android emulator',
        caption: 'The connected mobile experience running in the Android emulator',
        fit: 'contain',
      },
      {
        kind: 'image',
        src: '/media/magic-stamp/official-play-1.jpg',
        width: '28em',
        height: 'fill',
        alt: 'Magic Stamp rewards introduction shown in the official Google Play listing',
        caption: 'First-party product artwork from the official Magic Stamp Google Play listing',
        fit: 'contain',
      },
      {
        kind: 'image',
        src: '/media/magic-stamp/official-play-2.jpg',
        width: '28em',
        height: 'fill',
        alt: 'Magic Stamp card collection shown in the official Google Play listing',
        fit: 'contain',
      },
      {
        kind: 'image',
        src: '/media/magic-stamp/official-play-3.jpg',
        width: '28em',
        height: 'fill',
        alt: 'Magic Stamp digital loyalty card shown in the official Google Play listing',
        fit: 'contain',
      },
      {
        kind: 'image',
        src: '/media/magic-stamp/official-play-4.jpg',
        width: '28em',
        height: 'fill',
        alt: 'Magic Stamp nearby loyalty map shown in the official Google Play listing',
        fit: 'contain',
      },
      {
        kind: 'text',
        text: 'One loyalty journey, shown through the actual web and mobile product surfaces.',
        width: '29em',
      },
    ],
    nextSlug: 'rahmet-ihsan',
  },
  {
    slug: 'rahmet-ihsan',
    title: 'Rahmet Ihsan',
    category: 'Web • Payments • Impact',
    accent: '#5fbf8b',
    thumb: '/media/rahmet-ihsan/thumb.jpg',
    thumbVideo: '/media/rahmet-ihsan/loop.mp4',
    year: '2026',
    description: [
      'Rahmet Ihsan is an Arabic-first giving platform where campaigns, donations, and organisation tools meet in one web experience. We worked across the public donation journey and the supporting surfaces needed to manage the platform.',
      'The experience keeps its focus on clarity and trust: campaigns are easy to understand, contribution paths stay direct, and Arabic right-to-left interfaces are treated as a first-class product surface.',
    ],
    sideLists: [
      {
        title: 'Scope',
        items: ['Product Design', 'Donation Experience', 'Campaign Pages', 'Platform Interfaces'],
      },
      { title: 'Platform', items: ['Arabic-first web', 'Donations', 'Organisation tools'] },
    ],
    launches: [{ label: 'Visit Rahmet Ihsan', url: 'https://rahmetihsan.com' }],
    theme: lightButton('#071b13', '#103424', '#effff5', '#78d9a3'),
    media: [
      {
        kind: 'image',
        src: '/media/rahmet-ihsan/thumb.jpg',
        width: '66em',
        height: 'fill',
        alt: 'Rahmet Ihsan Arabic home page in a desktop browser',
        caption: 'Captured from the live Arabic-first giving platform',
      },
      {
        kind: 'video',
        src: '/media/rahmet-ihsan/loop.mp4',
        poster: '/media/rahmet-ihsan/poster.jpg',
        width: '66em',
        height: 'fill',
        alt: 'Screen recording of the live Rahmet Ihsan website',
        caption: 'A real walkthrough of the live donation experience',
      },
      {
        kind: 'image',
        src: '/media/rahmet-ihsan/still-projects.jpg',
        width: '58em',
        height: 'fill',
        alt: 'Rahmet Ihsan projects page showing live campaign cards',
        caption: 'The live projects and campaigns surface',
      },
      { kind: 'text', text: 'Giving flows designed to keep the next step clear.', width: '25em' },
    ],
    nextSlug: 'envaglo',
  },
  {
    slug: 'envaglo',
    title: 'Envaglo',
    category: 'SaaS • Analytics • ERP',
    accent: '#f16332',
    thumb: '/media/envaglo/thumb.jpg',
    thumbVideo: '/media/envaglo/loop.mp4',
    year: '2026',
    description: [
      'Envaglo is a multi-tenant ERP and commerce platform for operating stores, orders, point of sale, and business reporting. We shaped a system where operational work and decision-making sit alongside each other rather than in separate products.',
      'The platform includes storefront and administration surfaces, with Arabic-first interfaces and dashboards that bring live business activity into a single working environment.',
    ],
    sideLists: [
      {
        title: 'Scope',
        items: ['Product Design', 'ERP Interfaces', 'Commerce Flows', 'Business Intelligence'],
      },
      { title: 'Platform', items: ['Multi-tenant SaaS', 'POS', 'Storefronts', 'Analytics'] },
    ],
    launches: [
      { label: 'Open Envaglo ERP', url: 'https://stage.envaglo.com/login' },
      { label: 'View VIPCO Store', url: 'https://stage.envaglo.com/s/vipco/ar' },
    ],
    theme: lightButton('#17102b', '#2b1d4c', '#f8f4ff', '#f68a64'),
    media: [
      {
        kind: 'image',
        src: '/media/envaglo/thumb.jpg',
        width: '68em',
        height: 'fill',
        alt: 'Envaglo authenticated ERP module home in a desktop browser',
        caption: 'Captured from the authenticated Envaglo staging ERP',
      },
      {
        kind: 'video',
        src: '/media/envaglo/loop.mp4',
        poster: '/media/envaglo/poster.jpg',
        width: '68em',
        height: 'fill',
        alt: 'Screen recording moving through Envaglo ERP modules and analytics',
        caption: 'A real authenticated walkthrough of the staging ERP',
      },
      {
        kind: 'image',
        src: '/media/envaglo/still-accounting.jpg',
        width: '62em',
        height: 'fill',
        alt: 'Envaglo accounting dashboard with aggregate financial charts',
        caption: 'Accounting analytics captured from the authenticated staging ERP',
      },
      {
        kind: 'image',
        src: '/media/envaglo/still-inventory.jpg',
        width: '62em',
        height: 'fill',
        alt: 'Envaglo inventory analytics dashboard with aggregate stock charts',
        caption: 'Inventory analytics captured from the authenticated staging ERP',
      },
      {
        kind: 'image',
        src: '/media/envaglo/still-marketing.jpg',
        width: '58em',
        height: 'fill',
        alt: 'Envaglo live marketing website on a desktop browser',
        caption: 'The live product story behind the operating platform',
      },
      {
        kind: 'video',
        src: '/media/envaglo/storefront-loop.mp4',
        poster: '/media/envaglo/storefront-poster.jpg',
        width: '68em',
        height: 'fill',
        alt: 'Screen recording scrolling through an Envaglo-powered Arabic ecommerce storefront',
        caption: 'The real VIP ecommerce storefront running on Envaglo staging',
      },
      {
        kind: 'image',
        src: '/media/envaglo/still-storefront.jpg',
        width: '58em',
        height: 'fill',
        alt: 'Envaglo-powered VIP ecommerce storefront in Arabic',
        caption: 'Captured directly from the working storefront on Envaglo staging',
      },
      {
        kind: 'text',
        text: 'Store operations, commerce, and reporting in one product environment.',
        width: '28em',
      },
    ],
    nextSlug: 'mawared',
  },
  {
    slug: 'mawared',
    title: 'Mawared',
    category: 'Platform • Workforce • Mobile',
    accent: '#c99b52',
    thumb: '/media/mawared/thumb.jpg',
    thumbVideo: '/media/mawared/loop.mp4',
    year: '2026',
    description: [
      'Mawared is a Saudi workforce and recruitment platform that connects its public site, administrator workspace, and Android application. We designed the system as a coherent set of tools for discovering, managing, and progressing workforce services.',
      'The product gives the public and operations teams distinct experiences while keeping the platform’s visual language consistent across web and mobile.',
    ],
    sideLists: [
      {
        title: 'Scope',
        items: ['Product Design', 'Website', 'Admin Workspace', 'Android Application'],
      },
      { title: 'Platform', items: ['Recruitment', 'Workforce services', 'Web and mobile'] },
    ],
    launches: [{ label: 'Visit Mawared', url: 'https://mawared.sa' }],
    theme: lightButton('#17120b', '#2e2416', '#fff8ea', '#e4bc76'),
    media: [
      {
        kind: 'image',
        src: '/media/mawared/thumb.jpg',
        width: '62em',
        height: 'fill',
        alt: 'Mawared native Android onboarding screens captured from an emulator',
        caption: 'The real native app running in an Android emulator',
      },
      {
        kind: 'video',
        src: '/media/mawared/loop.mp4',
        poster: '/media/mawared/poster.jpg',
        width: '64em',
        height: 'fill',
        alt: 'Screen recording of the Mawared native Android onboarding flow',
        caption: 'A real emulator recording of the native onboarding flow',
      },
      {
        kind: 'image',
        src: '/media/mawared/phone-1.jpg',
        width: '28em',
        height: 'fill',
        alt: 'First Mawared onboarding screen captured from the Android emulator',
        fit: 'contain',
      },
      {
        kind: 'image',
        src: '/media/mawared/phone-2.jpg',
        width: '28em',
        height: 'fill',
        alt: 'Second Mawared onboarding screen captured from the Android emulator',
        fit: 'contain',
      },
      {
        kind: 'image',
        src: '/media/mawared/phone-3.jpg',
        width: '28em',
        height: 'fill',
        alt: 'Third Mawared onboarding screen captured from the Android emulator',
        fit: 'contain',
      },
      {
        kind: 'text',
        text: 'A connected experience for public services, operations, and mobile access.',
        width: '28em',
      },
    ],
    nextSlug: 'mywill',
  },
  {
    slug: 'mywill',
    title: 'MyWill',
    category: 'App • Legal Tech • Security',
    accent: '#9b6ef3',
    thumb: '/media/mywill/thumb.jpg',
    thumbVideo: '/media/mywill/loop.mp4',
    year: '2026',
    description: [
      'MyWill is a digital will-writing product built around a guided mobile experience, electronic signatures, and a supporting administration dashboard. We made a difficult personal process feel structured, understandable, and calm without stripping away its seriousness.',
      'The Flutter application and its connected services guide people through each step, while the team has dedicated tools for administering the platform.',
    ],
    sideLists: [
      {
        title: 'Scope',
        items: ['Product Design', 'Flutter Application', 'Guided Forms', 'Admin Dashboard'],
      },
      { title: 'Platform', items: ['Digital wills', 'Electronic signatures', 'Mobile and web'] },
    ],
    launches: [
      {
        label: 'Google Play',
        url: 'https://play.google.com/store/apps/details?id=com.bashsquare.my_will',
      },
      {
        label: 'App Store',
        url: 'https://apps.apple.com/us/app/mywill-digital-legacy/id6771635405',
      },
    ],
    theme: lightButton('#17102a', '#2a1d48', '#f8f4ff', '#b795ff'),
    media: [
      {
        kind: 'image',
        src: '/media/mywill/thumb.jpg',
        width: '62em',
        height: 'fill',
        alt: 'MyWill native Android home and will-builder screens captured from an emulator',
        caption: 'The real native app running in an Android emulator',
      },
      {
        kind: 'video',
        src: '/media/mywill/loop.mp4',
        poster: '/media/mywill/poster.jpg',
        width: '64em',
        height: 'fill',
        alt: 'Screen recording of the MyWill native Android home and will-builder flow',
        caption: 'A real emulator walkthrough from home into the guided builder',
      },
      {
        kind: 'image',
        src: '/media/mywill/phone-home.jpg',
        width: '28em',
        height: 'fill',
        alt: 'MyWill home screen captured from the Android emulator',
        fit: 'contain',
      },
      {
        kind: 'image',
        src: '/media/mywill/phone-builder.jpg',
        width: '28em',
        height: 'fill',
        alt: 'MyWill guided will-builder screen captured from the Android emulator',
        fit: 'contain',
      },
      {
        kind: 'image',
        src: '/media/mywill/official-play-1.jpg',
        width: '28em',
        height: 'fill',
        alt: 'Official MyWill Google Play artwork introducing the digital will product',
        caption: 'First-party artwork from the published MyWill Google Play listing',
        fit: 'contain',
      },
      {
        kind: 'image',
        src: '/media/mywill/official-play-2.jpg',
        width: '28em',
        height: 'fill',
        alt: 'Official MyWill Google Play artwork about sharing a will with trusted contacts',
        fit: 'contain',
      },
      {
        kind: 'image',
        src: '/media/mywill/official-play-3.jpg',
        width: '28em',
        height: 'fill',
        alt: 'Official MyWill Google Play screen for organizing and updating wills',
        fit: 'contain',
      },
      {
        kind: 'image',
        src: '/media/mywill/official-play-4.jpg',
        width: '28em',
        height: 'fill',
        alt: 'Official MyWill Google Play screen for finding and booking legal experts',
        fit: 'contain',
      },
      {
        kind: 'image',
        src: '/media/mywill/official-play-5.jpg',
        width: '28em',
        height: 'fill',
        alt: 'Official MyWill Google Play screen for securely managing documents',
        fit: 'contain',
      },
      {
        kind: 'image',
        src: '/media/mywill/official-play-6.jpg',
        width: '28em',
        height: 'fill',
        alt: 'Official MyWill Google Play artwork showing the lawyer dashboard',
        fit: 'contain',
      },
      {
        kind: 'image',
        src: '/media/mywill/official-play-7.jpg',
        width: '28em',
        height: 'fill',
        alt: 'Official MyWill Google Play screen for managing appointment availability',
        fit: 'contain',
      },
      {
        kind: 'text',
        text: 'A guided experience for one of life’s most important documents.',
        width: '27em',
      },
    ],
    nextSlug: 'paligram',
  },
  {
    slug: 'paligram',
    title: 'Paligram',
    category: 'Messaging • Social • Mobile',
    accent: '#efbd32',
    thumb: '/media/paligram/thumb.jpg',
    thumbVideo: '/media/paligram/loop.mp4',
    year: '2026',
    description: [
      'Paligram is a published mobile messaging and social-discovery product that brings chats, profiles, live maps, events, and interest-based groups into a single experience.',
      'Personalized chat colours and profile tools give the app a distinct social layer while the interface keeps discovery, conversation, and event participation close at hand.',
    ],
    sideLists: [
      {
        title: 'Scope',
        items: ['Product Design', 'Mobile Experience', 'Messaging', 'Social Discovery'],
      },
      { title: 'Platform', items: ['Chats', 'Groups', 'Events', 'Live map'] },
    ],
    launches: [
      {
        label: 'Google Play',
        url: 'https://play.google.com/store/apps/details?id=com.messaging.enigma',
      },
      {
        label: 'App Store',
        url: 'https://apps.apple.com/us/app/paligram/id6702027385',
      },
    ],
    theme: lightButton('#17130a', '#33280f', '#fffaf0', '#f4c542'),
    media: [
      {
        kind: 'image',
        src: '/media/paligram/thumb.jpg',
        width: '68em',
        height: 'fill',
        alt: 'Paligram messaging, chat-colour, and profile screens from the official listing',
        caption: 'Composed exclusively from first-party Google Play listing screenshots',
      },
      {
        kind: 'video',
        src: '/media/paligram/loop.mp4',
        poster: '/media/paligram/poster.jpg',
        width: '68em',
        height: 'fill',
        alt: 'Motion montage of official Paligram Google Play screenshots',
        caption: 'A motion edit built only from the published app’s official screenshots',
      },
      {
        kind: 'image',
        src: '/media/paligram/native-login-brand.jpg',
        width: '52em',
        height: 'fill',
        alt: 'Paligram welcome screen running in an Android emulator',
        caption: 'A privacy-safe crop of the real local development APK in the emulator',
        fit: 'contain',
      },
      {
        kind: 'image',
        src: '/media/paligram/official-play-1.jpg',
        width: '28em',
        height: 'fill',
        alt: 'Official Paligram Google Play discovery feed artwork',
        fit: 'contain',
      },
      {
        kind: 'image',
        src: '/media/paligram/official-play-2.jpg',
        width: '28em',
        height: 'fill',
        alt: 'Official Paligram Google Play Smart Chats artwork',
        fit: 'contain',
      },
      {
        kind: 'image',
        src: '/media/paligram/official-play-3.jpg',
        width: '28em',
        height: 'fill',
        alt: 'Official Paligram Google Play chat-colour customization screen',
        fit: 'contain',
      },
      {
        kind: 'image',
        src: '/media/paligram/official-play-4.jpg',
        width: '28em',
        height: 'fill',
        alt: 'Official Paligram Google Play Live Map screen',
        fit: 'contain',
      },
      {
        kind: 'image',
        src: '/media/paligram/official-play-5.jpg',
        width: '28em',
        height: 'fill',
        alt: 'Official Paligram Google Play profile-management screen',
        fit: 'contain',
      },
      {
        kind: 'image',
        src: '/media/paligram/official-play-6.jpg',
        width: '28em',
        height: 'fill',
        alt: 'Official Paligram Google Play event-details screen',
        fit: 'contain',
      },
      {
        kind: 'image',
        src: '/media/paligram/official-play-7.jpg',
        width: '28em',
        height: 'fill',
        alt: 'Official Paligram Google Play group-discovery screen',
        fit: 'contain',
      },
      {
        kind: 'text',
        text: 'Messaging, discovery, and shared experiences in one mobile product.',
        width: '28em',
      },
    ],
    nextSlug: 'reevez',
  },
  {
    slug: 'reevez',
    title: 'Reevez',
    category: 'Studio • AI • Automation',
    accent: '#62d8ff',
    thumb: '/media/reevez/thumb.jpg',
    thumbVideo: '/media/reevez/loop.mp4',
    year: '2026',
    description: [
      'Reevez is our own studio platform for building AI-enabled workflows, dashboards, and digital products. It is where we put our product practice to work on the systems that help teams research, decide, and move work forward.',
      'The studio site and seeded dashboard demo make the work tangible: automation design, clear operational interfaces, and AI teammates built around real working contexts.',
    ],
    sideLists: [
      {
        title: 'Scope',
        items: ['AI Workflows', 'Product Design', 'Dashboards', 'Automation Systems'],
      },
      { title: 'Studio tools', items: ['Hermes', 'Qeed', 'Atelier'] },
    ],
    launches: [{ label: 'Visit the studio', url: 'https://reevez.com' }],
    theme: lightButton('#07151e', '#102a38', '#effbff', '#77ddff'),
    media: [
      {
        kind: 'image',
        src: '/media/reevez/thumb.jpg',
        width: '68em',
        height: 'fill',
        alt: 'Reevez seeded dashboard demo overview in a desktop browser',
        caption: 'Captured from the public dashboard demo with seeded example data',
      },
      {
        kind: 'video',
        src: '/media/reevez/loop.mp4',
        poster: '/media/reevez/poster.jpg',
        width: '68em',
        height: 'fill',
        alt: 'Screen recording moving through the Reevez public dashboard demo',
        caption: 'A real walkthrough of overview, revenue, cash-flow, and pipeline screens',
      },
      {
        kind: 'image',
        src: '/media/reevez/still-revenue.jpg',
        width: '62em',
        height: 'fill',
        alt: 'Reevez revenue analytics screen with seeded example data',
      },
      {
        kind: 'image',
        src: '/media/reevez/still-cash-flow.jpg',
        width: '62em',
        height: 'fill',
        alt: 'Reevez cash-flow analytics screen with seeded example data',
      },
      {
        kind: 'image',
        src: '/media/reevez/still-sales-pipeline.jpg',
        width: '62em',
        height: 'fill',
        alt: 'Reevez sales-pipeline screen with seeded example data',
      },
      {
        kind: 'text',
        text: 'AI workflows and product systems designed around how teams actually work.',
        width: '29em',
      },
    ],
    nextSlug: 'magic-stamp',
  },
];

export function findProject(slug: string): ProjectDetail | undefined {
  return PROJECTS.find((project) => project.slug === slug);
}

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
