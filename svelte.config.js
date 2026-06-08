import adapter from '@sveltejs/adapter-vercel';

/** @type {import('@sveltejs/kit').Config} */
const config = {
    kit: {
        // adapter-vercel is required for Vercel Cron Jobs (see vercel.json `crons`)
        // to be wired up at build time. See https://svelte.dev/docs/kit/adapter-vercel.
        adapter: adapter(),
    },
};

export default config;
