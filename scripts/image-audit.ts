// Image-coverage audit CLI (chunk 4.11): fetch the REAL upstream dataset, run
// it through the same adapter that /card uses, and probe every resulting image
// URL — base printings AND alt-art variants. Reports genuine coverage gaps
// (`missing`) separately from host throttling (`throttled`), because they have
// different fixes: a gap is data to chase, throttling is why we front the
// images with a CDN. Writes nothing anywhere.
//
// Run: `npm run image-audit` (Node ≥22.18). Flags:
//   --base <url>          probe a different image host than the adapter's
//                         default (e.g. the old raw.githubusercontent.com, for
//                         a before/after against jsDelivr). The card-id
//                         filename is appended exactly as the adapter builds it.
//   --concurrency <n>     parallel probes (default 4; a full sweep at higher
//                         concurrency makes even jsDelivr burst-throttle).
//   --limit <n>           probe only the first n printings (a fast smoke sample).
//   --retries <n>         transient-failure retries per image (default 4).
//   --max-missing-pct <n> fail the run only if missing% exceeds this (default 5).
//
// Exit code: non-zero when the missing-image RATE exceeds --max-missing-pct
// (a spike — e.g. upstream restructured paths and everything 404s) or when the
// fetch/setup itself fails. A baseline of missing images is EXPECTED and does
// not fail the run: brand-new sets land in the dataset before their art is
// uploaded, and some alt-art variants are never imaged upstream (verified
// 2026-07-08 — same 404s on raw.githubusercontent.com, so not a CDN
// regression). This mirrors the sync pipeline's drop-spike guard: tolerate the
// baseline, alarm on the cliff. Throttling never fails the run.
import { IMAGE_BASE, fetchCards, normalize } from "../src/sync/adapter/digimoncard-app.ts";
import { validateCards } from "../src/sync/validate.ts";
import { auditImages, summarize, type ImageProbe, type ProbeResult } from "./image-coverage.ts";

interface Args {
  base: string;
  concurrency: number;
  retries: number;
  limit: number | null;
  maxMissingPct: number;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    base: IMAGE_BASE,
    concurrency: 4,
    retries: 4,
    limit: null,
    maxMissingPct: 5,
  };
  for (let i = 0; i < argv.length; i++) {
    const value = argv[i + 1];
    if (value === undefined) break; // every flag we know takes an argument
    switch (argv[i]) {
      case "--base":
        args.base = value;
        i++;
        break;
      case "--concurrency":
        args.concurrency = Number(value);
        i++;
        break;
      case "--retries":
        args.retries = Number(value);
        i++;
        break;
      case "--limit":
        args.limit = Number(value);
        i++;
        break;
      case "--max-missing-pct":
        args.maxMissingPct = Number(value);
        i++;
        break;
    }
  }
  return args;
}

/** Rebuild a probe URL against a chosen base, reusing the exact filename the
 * adapter synthesized (`.../<id>.webp` or `.../<id>_P1.webp`). */
function rebase(url: string, base: string): string {
  const file = url.slice(url.lastIndexOf("/") + 1);
  return `${base.replace(/\/$/, "")}/${file}`;
}

const args = parseArgs(process.argv.slice(2));

const raws = await fetchCards().catch((error: unknown) => {
  console.error(`✗ fetch failed: ${String(error)}`);
  process.exit(1);
});

// Same validation gate as the sync pipeline, so we audit exactly the rows that
// would reach D1 — no phantom probes for records the loader would drop.
const { valid } = validateCards(raws.flatMap(normalize));
let probes: ImageProbe[] = valid
  .filter((c) => c.imageUrl)
  .map((c) => ({ cardId: c.cardId, variant: c.variant, url: rebase(c.imageUrl!, args.base) }));
if (args.limit !== null) probes = probes.slice(0, args.limit);

console.log(
  `image audit: ${probes.length} printings against ${args.base}` +
    ` (concurrency ${args.concurrency}, retries ${args.retries})`,
);

let lastLogged = 0;
const results: ProbeResult[] = await auditImages(probes, {
  concurrency: args.concurrency,
  retries: args.retries,
  onProgress: (done, total) => {
    // Progress every ~500 so CI logs stay readable but a hung run is visible.
    if (done - lastLogged >= 500 || done === total) {
      lastLogged = done;
      console.log(`  …${done}/${total}`);
    }
  },
});

const s = summarize(results);
const missingPct = s.total > 0 ? (s.missing.length / s.total) * 100 : 0;
console.log(
  `\nresult: ${s.ok} ok · ${s.missing.length} missing (${missingPct.toFixed(1)}%) · ` +
    `${s.throttled.length} throttled · ${s.errored.length} error (of ${s.total})`,
);

const sample = (rs: ProbeResult[], n = 60): void => {
  for (const r of rs.slice(0, n)) {
    console.log(`    ${r.cardId} (${r.variant}) [${r.httpStatus ?? "throw"}] ${r.url}`);
  }
  if (rs.length > n) console.log(`    …and ${rs.length - n} more`);
};

if (s.missing.length > 0) {
  // A coverage gap to track, not necessarily a failure (see the header note).
  console.log(
    `\n• missing images (no art at the synthesized URL — mostly new sets + un-imaged alt-arts):`,
  );
  sample(s.missing);
}
if (s.errored.length > 0) {
  console.warn(`\n⚠ errored (non-404, non-throttle failures — treat as suspect):`);
  sample(s.errored);
}
if (s.throttled.length > 0) {
  console.warn(
    `\n⚠ throttled: ${s.throttled.length} images 429/403'd after ${args.retries} retries — ` +
      `host rate-limiting, not a data gap. Re-run or lower --concurrency to clear.`,
  );
}

// Fail only on a MISSING SPIKE (e.g. upstream moved every image path), not on
// the expected baseline of un-uploaded art. Throttling/errors never fail.
if (missingPct > args.maxMissingPct) {
  console.error(
    `\n✗ image audit: FAIL — ${missingPct.toFixed(1)}% missing exceeds the ` +
      `${args.maxMissingPct}% ceiling. Likely an upstream path change, not normal churn.`,
  );
  process.exit(1);
}
console.log(
  `\nimage audit: PASS — ${missingPct.toFixed(1)}% missing is within the ${args.maxMissingPct}% ceiling.`,
);
