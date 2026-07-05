// Security-boundary tests (TESTING.md §2): real keys, real WebCrypto, no
// mocks. Running under the Workers pool also proves workerd itself supports
// Ed25519 — a drift-prone fact we'd rather catch here than in production.
import { beforeAll, describe, expect, it } from "vitest";
import { verifyDiscordSignature } from "./verify";

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

const TIMESTAMP = "1751600000";
const BODY = JSON.stringify({ type: 1 });

let publicKeyHex: string;
let privateKey: CryptoKey;

async function sign(timestamp: string, body: string, key: CryptoKey = privateKey) {
  const sig = await crypto.subtle.sign("Ed25519", key, new TextEncoder().encode(timestamp + body));
  return bytesToHex(new Uint8Array(sig));
}

beforeAll(async () => {
  const pair = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, [
    "sign",
    "verify",
  ])) as CryptoKeyPair;
  privateKey = pair.privateKey;
  // exportKey's return type is a union with JsonWebKey; "raw" always yields
  // an ArrayBuffer, so narrow it.
  const raw = (await crypto.subtle.exportKey("raw", pair.publicKey)) as ArrayBuffer;
  publicKeyHex = bytesToHex(new Uint8Array(raw));
});

describe("verifyDiscordSignature", () => {
  it("accepts a valid signature", async () => {
    const sig = await sign(TIMESTAMP, BODY);
    await expect(verifyDiscordSignature(publicKeyHex, sig, TIMESTAMP, BODY)).resolves.toBe(true);
  });

  it("rejects a signature over a different (tampered) body", async () => {
    const sig = await sign(TIMESTAMP, BODY);
    const tampered = JSON.stringify({ type: 2 });
    await expect(verifyDiscordSignature(publicKeyHex, sig, TIMESTAMP, tampered)).resolves.toBe(
      false,
    );
  });

  it("rejects a tampered timestamp", async () => {
    const sig = await sign(TIMESTAMP, BODY);
    await expect(verifyDiscordSignature(publicKeyHex, sig, "1751699999", BODY)).resolves.toBe(
      false,
    );
  });

  it("rejects a corrupted signature (single flipped byte)", async () => {
    const sig = await sign(TIMESTAMP, BODY);
    const firstByte = parseInt(sig.slice(0, 2), 16);
    const flipped = ((firstByte ^ 0xff) as number).toString(16).padStart(2, "0") + sig.slice(2);
    await expect(verifyDiscordSignature(publicKeyHex, flipped, TIMESTAMP, BODY)).resolves.toBe(
      false,
    );
  });

  it("rejects a signature from a different keypair", async () => {
    const other = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, [
      "sign",
      "verify",
    ])) as CryptoKeyPair;
    const sig = await sign(TIMESTAMP, BODY, other.privateKey);
    await expect(verifyDiscordSignature(publicKeyHex, sig, TIMESTAMP, BODY)).resolves.toBe(false);
  });

  it("rejects a missing signature header", async () => {
    await expect(verifyDiscordSignature(publicKeyHex, null, TIMESTAMP, BODY)).resolves.toBe(false);
  });

  it("rejects a missing timestamp header", async () => {
    const sig = await sign(TIMESTAMP, BODY);
    await expect(verifyDiscordSignature(publicKeyHex, sig, null, BODY)).resolves.toBe(false);
  });

  it("rejects a non-hex signature of the right length", async () => {
    await expect(
      verifyDiscordSignature(publicKeyHex, "zz".repeat(64), TIMESTAMP, BODY),
    ).resolves.toBe(false);
  });

  it("rejects a wrong-length signature", async () => {
    const sig = await sign(TIMESTAMP, BODY);
    await expect(verifyDiscordSignature(publicKeyHex, sig.slice(2), TIMESTAMP, BODY)).resolves.toBe(
      false,
    );
  });

  it("rejects a malformed public key", async () => {
    const sig = await sign(TIMESTAMP, BODY);
    await expect(verifyDiscordSignature("deadbeef", sig, TIMESTAMP, BODY)).resolves.toBe(false);
  });
});
