// Workers Vitest integration, v0.18+ plugin API (the older
// defineWorkersConfig/"pool" API was removed with Vitest 4 support).
import { defineConfig } from "vitest/config";
import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
// Test-only keypair (see the fixture's `note`). The Worker under test trusts
// this public key, so tests holding the private half can sign synthetic
// Discord interactions.
import testKeypair from "./test/fixtures/discord-test-keypair.json";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.toml" },
      miniflare: {
        bindings: {
          DISCORD_PUBLIC_KEY: testKeypair.publicKeyHex,
        },
      },
    }),
  ],
  test: {
    deps: {
      optimizer: {
        // discord-api-types is CommonJS; the workerd pool needs it
        // pre-bundled to ESM or its enum objects import as undefined.
        ssr: { enabled: true, include: ["discord-api-types/v10"] },
      },
    },
  },
});
