import type { CollectionEntry } from 'astro:content';

export const projectAreas = [
  { id: 'nix', title: 'Nix' },
  { id: 'systems', title: 'Systems' },
  { id: 'shell', title: 'Shell' },
  { id: 'libraries', title: 'Libraries' },
  { id: 'other', title: 'Other' },
] as const;

export type ProjectGroup = (typeof projectAreas)[number] & {
  projects: CollectionEntry<'projects'>[];
};
