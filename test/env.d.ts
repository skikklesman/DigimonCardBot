// Types the `env` object tests receive from `cloudflare:test`. Since pool
// v0.18 that object is typed as the globally-augmentable `Cloudflare.Env`
// (see workers-types); extend it with the Worker's own bindings plus the
// test-only migrations array injected by vitest.config.ts.
import type { D1Migration } from "cloudflare:test";
import type { Env as WorkerEnv } from "../src/index";

declare global {
  namespace Cloudflare {
    interface Env extends WorkerEnv {
      TEST_MIGRATIONS: D1Migration[];
    }
  }
}
