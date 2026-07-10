// Command-definition contract tests (chunk 2.4): Discord validates these
// lazily and cryptically at registration time — catch the rules here.
import { describe, expect, it } from "vitest";
import { ApplicationCommandOptionType } from "discord-api-types/v10";
import { COMMAND_DEFINITIONS } from "./command-definitions.ts";

// Discord's naming rule for commands and options.
const NAME_PATTERN = /^[-_a-z0-9]{1,32}$/;

describe("command definitions", () => {
  it("uses valid names and descriptions throughout", () => {
    for (const command of COMMAND_DEFINITIONS) {
      expect(command.name).toMatch(NAME_PATTERN);
      expect(command.description.length).toBeGreaterThan(0);
      expect(command.description.length).toBeLessThanOrEqual(100);
      for (const option of command.options ?? []) {
        expect(option.name).toMatch(NAME_PATTERN);
        expect(option.description.length).toBeLessThanOrEqual(100);
      }
    }
  });

  it("defines /card with a required autocompleting card-name and an optional autocompleting alt option (chunk 4.12)", () => {
    const command = COMMAND_DEFINITIONS.find((c) => c.name === "card");
    expect(command?.options?.find((o) => o.name === "card-name")).toMatchObject({
      type: ApplicationCommandOptionType.String,
      required: true,
      autocomplete: true,
    });
    // The alt printing selector is optional but still autocompletes.
    expect(command?.options?.find((o) => o.name === "alt")).toMatchObject({
      type: ApplicationCommandOptionType.String,
      required: false,
      autocomplete: true,
    });
  });

  it("no longer defines a standalone /alt command (folded into /card, chunk 4.12)", () => {
    expect(COMMAND_DEFINITIONS.find((c) => c.name === "alt")).toBeUndefined();
  });

  it("defines /set with a required, autocompleting set option", () => {
    const command = COMMAND_DEFINITIONS.find((c) => c.name === "set");
    const option = command?.options?.find((o) => o.name === "set");
    expect(option).toMatchObject({
      type: ApplicationCommandOptionType.String,
      required: true,
      autocomplete: true,
    });
  });

  it.each(["release", "banlist"])("defines /%s with no options (takes no input)", (name) => {
    const command = COMMAND_DEFINITIONS.find((c) => c.name === name);
    expect(command).toBeDefined();
    expect(command && "options" in command && command.options).toBeFalsy();
  });

  it("never combines autocomplete with static choices (Discord rejects it)", () => {
    for (const command of COMMAND_DEFINITIONS) {
      for (const option of command.options ?? []) {
        if ("autocomplete" in option && option.autocomplete) {
          expect("choices" in option && option.choices).toBeFalsy();
        }
      }
    }
  });
});
