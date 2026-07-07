// The /release command (chunk 4.9): the old bot's "Upcoming Releases"
// forward look — every known future set with its EN date. No options, no
// I/O: the list derives entirely from the curated data/releases.ts, so
// there is no second dataset to babysit (owner requirement, DECISIONS.md
// 2026-07-07). The set-lookup behavior this name used to carry lives on
// as /set.
import type { APIInteractionResponse } from "discord-api-types/v10";
import { RELEASES } from "../../data/releases.ts";
import type { CommandHandler } from "../router.ts";
import { upcomingReleasesResponse } from "../embeds.ts";

export function createReleaseCommand(): CommandHandler {
  return (): Promise<APIInteractionResponse> =>
    Promise.resolve(upcomingReleasesResponse(RELEASES, new Date()));
}
