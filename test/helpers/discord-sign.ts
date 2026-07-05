// Signs synthetic Discord interactions with the committed TEST-ONLY keypair
// (test/fixtures/discord-test-keypair.json), producing the headers Discord
// would send. Used by integration tests to exercise the live signature check.
import keypair from "../fixtures/discord-test-keypair.json";

let privateKeyPromise: Promise<CryptoKey> | undefined;

function getPrivateKey(): Promise<CryptoKey> {
  privateKeyPromise ??= crypto.subtle.importKey(
    "pkcs8",
    Uint8Array.from(atob(keypair.privateKeyPkcs8Base64), (c) => c.charCodeAt(0)),
    { name: "Ed25519" },
    false,
    ["sign"],
  );
  return privateKeyPromise;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Builds a correctly signed POST /interactions request init for `payload`. */
export async function signedInteraction(payload: unknown): Promise<RequestInit> {
  const body = JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const key = await getPrivateKey();
  const sig = await crypto.subtle.sign("Ed25519", key, new TextEncoder().encode(timestamp + body));
  return {
    method: "POST",
    body,
    headers: {
      "content-type": "application/json",
      "X-Signature-Ed25519": bytesToHex(new Uint8Array(sig)),
      "X-Signature-Timestamp": timestamp,
    },
  };
}
