import { hash, verify } from "@node-rs/argon2";

// Argon2id (padrão da lib) com os parâmetros mínimos da OWASP.
const OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1 };

export const MIN_PASSWORD_LENGTH = 12;

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

let dummyHash: Promise<string> | undefined;

/** Gasta o mesmo tempo de uma verificação real quando o e-mail não existe. */
export async function burnPasswordCheck(password: string): Promise<void> {
  dummyHash ??= hashPassword("fincontrol-usuario-inexistente");
  await verifyPassword(await dummyHash, password);
}
