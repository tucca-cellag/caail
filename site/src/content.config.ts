import { defineCollection } from 'astro:content';
import { docsSchema } from '@astrojs/starlight/schema';
import { caailDocsLoader } from './content/loaders/caail-docs-loader.ts';

export const collections = {
	docs: defineCollection({ loader: caailDocsLoader(), schema: docsSchema() }),
};
