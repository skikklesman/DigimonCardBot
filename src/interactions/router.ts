// Interaction router (HANDOFF §6.4): branch on interaction type, dispatch
// commands and autocomplete by name, and message components by custom_id
// namespace. Two hard rules (TECH-DESIGN §4):
// nothing thrown by a handler may escape — a user must never see Discord's
// "application did not respond" — and autocomplete always answers
// synchronously, degrading to an empty choice list, never an error.
import {
  InteractionResponseType,
  InteractionType,
  MessageFlags,
  type APIApplicationCommandAutocompleteInteraction,
  type APIApplicationCommandInteraction,
  type APIApplicationCommandOptionChoice,
  type APIInteractionResponse,
  type APIMessageComponentInteraction,
} from "discord-api-types/v10";

/** A slash-command handler: full interaction in, complete response out.
 * Handlers close over their dependencies (repo etc.) at registry
 * construction, keeping them pure functions of the interaction. */
export type CommandHandler = (
  interaction: APIApplicationCommandInteraction,
) => Promise<APIInteractionResponse>;

/** An autocomplete handler returns bare choices; the router wraps them. */
export type AutocompleteHandler = (
  interaction: APIApplicationCommandAutocompleteInteraction,
) => Promise<APIApplicationCommandOptionChoice[]>;

/** A message-component handler (button/select click): full interaction in,
 * complete response out. Total, like CommandHandler — nothing it throws may
 * reach the user. Keyed in the registry by the custom_id NAMESPACE (the
 * segment before the first ':'), so one handler owns a whole feature's
 * components. State rides in the custom_id, not on any stored message. */
export type ComponentHandler = (
  interaction: APIMessageComponentInteraction,
) => Promise<APIInteractionResponse>;

export interface HandlerRegistry {
  commands: Readonly<Record<string, CommandHandler>>;
  autocomplete: Readonly<Record<string, AutocompleteHandler>>;
  components: Readonly<Record<string, ComponentHandler>>;
}

/** Discord caps autocomplete responses at 25 choices; enforce centrally. */
const MAX_CHOICES = 25;

function ephemeral(content: string): APIInteractionResponse {
  return {
    type: InteractionResponseType.ChannelMessageWithSource,
    data: { content, flags: MessageFlags.Ephemeral },
  };
}

const UNKNOWN_COMMAND = ephemeral("I don't know that command. It may still be rolling out.");
const HANDLER_ERROR = ephemeral("Something went wrong looking that up. Please try again.");

function choices(list: APIApplicationCommandOptionChoice[]): APIInteractionResponse {
  return {
    type: InteractionResponseType.ApplicationCommandAutocompleteResult,
    data: { choices: list.slice(0, MAX_CHOICES) },
  };
}

/**
 * Route a verified, parsed interaction to a response. Total: every input —
 * including malformed bodies and interaction types we never registered
 * for — produces a polite response object, never a throw.
 */
export async function route(
  interaction: unknown,
  registry: HandlerRegistry,
): Promise<APIInteractionResponse> {
  const type =
    typeof interaction === "object" && interaction !== null && "type" in interaction
      ? (interaction as { type: unknown }).type
      : undefined;

  if (type === InteractionType.Ping) {
    return { type: InteractionResponseType.Pong };
  }

  if (type === InteractionType.ApplicationCommand) {
    const command = interaction as APIApplicationCommandInteraction;
    const handler = registry.commands[command.data?.name ?? ""];
    if (!handler) return UNKNOWN_COMMAND;
    try {
      return await handler(command);
    } catch (error) {
      console.error(`command /${command.data.name} failed: ${String(error)}`);
      return HANDLER_ERROR;
    }
  }

  if (type === InteractionType.ApplicationCommandAutocomplete) {
    const query = interaction as APIApplicationCommandAutocompleteInteraction;
    const handler = registry.autocomplete[query.data?.name ?? ""];
    if (!handler) return choices([]);
    try {
      return choices(await handler(query));
    } catch (error) {
      // Empty list, not an error: autocomplete cannot be deferred and has
      // no user-visible error channel (HANDOFF §6.4).
      console.error(`autocomplete /${query.data.name} failed: ${String(error)}`);
      return choices([]);
    }
  }

  if (type === InteractionType.MessageComponent) {
    const component = interaction as APIMessageComponentInteraction;
    // Dispatch on the custom_id namespace: `namespace:action:arg…`. An
    // unregistered namespace (or a stale button whose feature was retired)
    // gets the same polite note as any unknown interaction. custom_id must be
    // a string before we split it — a malformed body could carry any type,
    // and this parse sits OUTSIDE the try below, so a `.split` on a non-string
    // would escape route()'s never-throw contract.
    const customId = component.data?.custom_id;
    const namespace = typeof customId === "string" ? (customId.split(":")[0] ?? "") : "";
    const handler = registry.components[namespace];
    if (!handler) return ephemeral("I can't handle that kind of interaction.");
    try {
      return await handler(component);
    } catch (error) {
      console.error(`component ${component.data.custom_id} failed: ${String(error)}`);
      return HANDLER_ERROR;
    }
  }

  // Modals, future interaction types, malformed bodies: we register none of
  // them, so a polite ephemeral note is always safe.
  return ephemeral("I can't handle that kind of interaction.");
}
