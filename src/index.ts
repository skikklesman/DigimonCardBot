// Worker entry point. Stays thin: verify → route → respond (TECH-DESIGN §3.5).
// Chunk 0.1 placeholder — the signed interactions endpoint lands in chunk 0.4.

export default {
  async fetch(_request: Request): Promise<Response> {
    return new Response("digimon-tcg-bot: scaffolding up", { status: 200 });
  },
} satisfies ExportedHandler;
