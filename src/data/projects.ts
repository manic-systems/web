import type { CollectionEntry } from 'astro:content';

export const projectAreas = [
  { id: 'nix', title: 'Nix', detail: 'Evaluation / builds / deployment' },
  { id: 'systems', title: 'Systems', detail: 'Boot / services / infrastructure' },
  { id: 'shell', title: 'Shell', detail: 'Completions / interfaces / utilities' },
  { id: 'libraries', title: 'Libraries', detail: 'Parsing / WebAssembly' },
] as const;

export type ProjectGroup = (typeof projectAreas)[number] & {
  projects: CollectionEntry<'projects'>[];
};
