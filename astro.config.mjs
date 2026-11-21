import { defineConfig } from 'astro/config';

// GitHub Pages serves the site under /<repo>/, Vercel at the root.
// Set BASE_PATH=/somethings-on-the-wall when building for GitHub Pages.
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  trailingSlash: 'ignore',
  build: { format: 'directory' },
  devToolbar: { enabled: false },
});
