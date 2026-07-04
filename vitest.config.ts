// Workers Vitest integration, v0.18+ plugin API (the older
// defineWorkersConfig/"pool" API was removed with Vitest 4 support).
import { defineConfig } from "vitest/config";
import { cloudflareTest } from "@cloudflare/vitest-pool-workers";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.toml" },
    }),
  ],
});
