// The /banlist command (chunk 4.7): every currently banned or restricted
// card in one public reply (owner call 2026-07-06). No options; one D1
// read over the active version. English values only — regions share one
// unified banned/restricted list as of BT-21 (owner/judge call, ROADMAP
// 4.7); choice-restricted cards get their own section naming conflict
// partners (owner call 2026-07-07, DECISIONS.md).
import type { APIInteractionResponse } from "discord-api-types/v10";
import type { CardRepo } from "../../data/repo.ts";
import type { CommandHandler } from "../router.ts";
import { banlistResponse } from "../embeds.ts";

export function createBanlistCommand(repo: CardRepo): CommandHandler {
  return async (): Promise<APIInteractionResponse> => banlistResponse(await repo.listRestricted());
}
