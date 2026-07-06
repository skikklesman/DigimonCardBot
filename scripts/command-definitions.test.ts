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

  it.each(["card", "alt"])(
    "defines /%s with a required, autocompleting card-name option",
    (name) => {
      const command = COMMAND_DEFINITIONS.find((c) => c.name === name);
      const option = command?.options?.find((o) => o.name === "card-name");
      expect(option).toMatchObject({
        type: ApplicationCommandOptionType.String,
        required: true,
        autocomplete: true,
      });
    },
  );

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
