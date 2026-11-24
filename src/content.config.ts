import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { projectAreas } from './data/projects';

const projects = defineCollection({
  loader: glob({
    pattern: '*.toml',
    base: './src/content/projects',
    generateId: ({ entry }) => entry.slice(0, -'.toml'.length),
  }),
  schema: z.object({
    area: z.enum(projectAreas.map((area) => area.id)),
    description: z.string().min(1).optional(),
    order: z.number().int().positive().optional(),
    note: z.string().min(1).optional(),
    archived: z.boolean().optional(),
  }),
});

export const collections = { projects };
