import * as Alchemy from 'alchemy';
import * as Cloudflare from 'alchemy/Cloudflare';
import * as Effect from 'effect/Effect';

export default Alchemy.Stack(
  'FenforceCloudflareFront',
  {
    providers: Cloudflare.providers(),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const site = yield* Cloudflare.Website.StaticSite('Frontend', {
      command: 'bun run build',
      outdir: '../../packages/twenty-front/build-convex',
      main: './src/index.ts',
      compatibility: { date: '2026-09-28' },
      assets: {
        notFoundHandling: 'single-page-application',
        runWorkerFirst: true,
      },
    });

    return { url: site.url };
  }),
);
