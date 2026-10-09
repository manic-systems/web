import { defineCollection } from 'astro:content';
import { file } from 'astro/loaders';
import { z } from 'astro/zod';
import { projectAreas } from './data/projects';

// Descriptions summarize public READMEs; IDs are the exact GitHub repository names.
// Explicit order preserves the curated index independently of loader iteration order.
// Maintain entries in src/content/projects.json; add areas in src/data/projects.ts.
// Notes are optional, and navigation counts and the total derive from the collection.
const projects = defineCollection({
  loader: file('src/content/projects.json'),
  schema: z.object({
    id: z.string().min(1),
    area: z.enum(projectAreas.map((area) => area.id)),
    description: z.string().min(1),
    order: z.number().int().positive(),
    note: z.string().min(1).optional(),
  }),
});

export const collections = { projects };
