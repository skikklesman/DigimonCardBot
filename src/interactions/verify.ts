// Discord interaction signature verification (HANDOFF §6.1) — the security
// boundary. Pure: no I/O beyond WebCrypto; the caller passes header values and
// the raw request body.
//
// Discord signs `timestamp + rawBody` with the app's Ed25519 key and sends:
//   X-Signature-Ed25519   — 64-byte signature, hex-encoded
//   X-Signature-Timestamp — unix-seconds string
// Any verification failure must result in a 401 from the endpoint: Discord
// probes with deliberately invalid signatures when the Interactions Endpoint
// URL is saved, and saving fails unless those probes are rejected.

const ED25519_PUBLIC_KEY_BYTES = 32;
const ED25519_SIGNATURE_BYTES = 64;
const HEX_RE = /^[0-9a-f]+$/i;

function hexToBytes(hex: string, expectedLength: number): Uint8Array | null {
  if (hex.length !== expectedLength * 2 || !HEX_RE.test(hex)) return null;
  const bytes = new Uint8Array(expectedLength);
  for (let i = 0; i < expectedLength; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Returns true only if `signatureHex` is a valid Ed25519 signature over
 * `timestamp + rawBody` for the given public key. Never throws: malformed or
 * missing inputs return false.
 */
export async function verifyDiscordSignature(
  publicKeyHex: string,
  signatureHex: string | null,
  timestamp: string | null,
  rawBody: string,
): Promise<boolean> {
  if (!signatureHex || !timestamp) return false;

  const publicKey = hexToBytes(publicKeyHex, ED25519_PUBLIC_KEY_BYTES);
  const signature = hexToBytes(signatureHex, ED25519_SIGNATURE_BYTES);
  if (!publicKey || !signature) return false;

  try {
    const key = await crypto.subtle.importKey("raw", publicKey, { name: "Ed25519" }, false, [
      "verify",
    ]);
    const message = new TextEncoder().encode(timestamp + rawBody);
    return await crypto.subtle.verify("Ed25519", key, signature, message);
  } catch {
    // Unsupported algorithm, bad key material, etc. — treat as unverified.
    return false;
  }
}
