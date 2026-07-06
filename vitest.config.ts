// Workers Vitest integration, v0.18+ plugin API (the older
// defineWorkersConfig/"pool" API was removed with Vitest 4 support).
import { defineConfig } from "vitest/config";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
// Test-only keypair (see the fixture's `note`). The Worker under test trusts
// this public key, so tests holding the private half can sign synthetic
// Discord interactions.
import testKeypair from "./test/fixtures/discord-test-keypair.json";

// Migrations are read here in Node and handed to the workerd side as a
// binding; test/setup/apply-migrations.ts applies them to the local D1
// before each test file runs. Relative path: vitest resolves this config
// from the project root, so cwd is the repo root (avoids needing
// @types/node for path helpers).
const migrations = await readD1Migrations("migrations");

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.toml" },
      miniflare: {
        bindings: {
          DISCORD_PUBLIC_KEY: testKeypair.publicKeyHex,
          TEST_MIGRATIONS: migrations,
          // Test-only bearer token for the /admin/resync auth tests.
          RESYNC_TOKEN: "test-resync-token",
        },
      },
    }),
  ],
  test: {
    setupFiles: ["./test/setup/apply-migrations.ts"],
    deps: {
      optimizer: {
        // discord-api-types is CommonJS; the workerd pool needs it
        // pre-bundled to ESM or its enum objects import as undefined.
        ssr: { enabled: true, include: ["discord-api-types/v10"] },
      },
    },
  },
});
