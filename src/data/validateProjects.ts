/**
 * Dev-only consistency checks for the project data. Adding a project touches
 * both shared/projects.ts AND the hand-written tile markup in index.html (see
 * docs/ADDING-CONTENT.md) — this module catches the drift that ritual invites:
 * duplicate slugs, a broken next-project ring, and grid tiles that don't match
 * the data. Loaded from main.ts behind `import.meta.env.DEV`, so it is
 * tree-shaken out of production builds entirely.
 */
import { PROJECTS } from '../../shared/projects';

/** Log every inconsistency between the data set and the home-grid DOM. */
export function validateProjectData(): void {
  const issues: string[] = [];
  const slugs = new Set<string>();

  for (const project of PROJECTS) {
    if (slugs.has(project.slug)) {
      issues.push(`duplicate slug "${project.slug}" in shared/projects.ts`);
    }
    slugs.add(project.slug);
  }

  for (const project of PROJECTS) {
    if (!slugs.has(project.nextSlug)) {
      issues.push(`"${project.slug}" has nextSlug "${project.nextSlug}" which does not exist`);
    }
  }

  // The next-project ring must visit every project exactly once — a mis-wired
  // nextSlug (the classic miss when appending a project) shows up here.
  if (PROJECTS.length > 0) {
    const visited = new Set<string>();
    let cursor = PROJECTS[0].slug;
    while (!visited.has(cursor) && slugs.has(cursor)) {
      visited.add(cursor);
      cursor = PROJECTS.find((p) => p.slug === cursor)?.nextSlug ?? '';
    }
    if (visited.size !== PROJECTS.length) {
      const missing = [...slugs].filter((slug) => !visited.has(slug));
      issues.push(`next-project ring skips: ${missing.join(', ')}`);
    }
  }

  // Home grid tiles are hand-written in index.html — they must mirror the data.
  const tiles = Array.from(
    document.querySelectorAll<HTMLElement>('#featured-grid .project-item[data-slug]'),
  );
  const tileSlugs = new Set(tiles.map((tile) => tile.dataset.slug ?? ''));
  for (const slug of slugs) {
    if (!tileSlugs.has(slug)) {
      issues.push(`project "${slug}" has no tile in index.html #featured-grid`);
    }
  }
  for (const slug of tileSlugs) {
    if (!slugs.has(slug)) {
      issues.push(`tile "${slug}" in index.html has no entry in shared/projects.ts`);
    }
  }

  for (const issue of issues) {
    console.warn(`[projects-data] ${issue}`);
  }
}
