import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from "node:crypto";

const FORMAT_VERSION = "v1";

// Uma chave por finalidade, derivada de AUTH_SECRET: vazar uma não compromete as outras.
function deriveKey(masterSecret: string, purpose: string): Buffer {
  return Buffer.from(hkdfSync("sha256", masterSecret, "fincontrol", purpose, 32));
}

/** AES-256-GCM. Saída: "v1.<iv>.<tag>.<ciphertext>" em base64url. */
export function encryptSecret(plaintext: string, masterSecret: string, purpose: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(masterSecret, purpose), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [FORMAT_VERSION, iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptSecret(payload: string, masterSecret: string, purpose: string): string {
  const [version, iv, tag, ciphertext] = payload.split(".");
  if (version !== FORMAT_VERSION || !iv || !tag || !ciphertext) {
    throw new Error("Segredo cifrado em formato inválido");
  }
  const decipher = createDecipheriv("aes-256-gcm", deriveKey(masterSecret, purpose), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}
