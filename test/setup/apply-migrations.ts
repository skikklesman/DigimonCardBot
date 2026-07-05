// Runs inside workerd before each test file: applies the D1 migrations
// (read in vitest.config.ts, passed in as the TEST_MIGRATIONS binding) so
// every test sees the schema-complete, meta-seeded database.
import { applyD1Migrations, env } from "cloudflare:test";

await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
