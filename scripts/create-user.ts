// Cria o usuário e já ativa o TOTP, sem tela de cadastro na web.
// Uso local:   npm run user:create
// Produção:    railway run npm run user:create  (usa DATABASE_URL e AUTH_SECRET do serviço)
import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import QRCode from "qrcode";
import { z } from "zod";
import { TOTP_KEY_PURPOSE } from "@/lib/auth/constants";
import { encryptSecret } from "@/lib/auth/crypto";
import { hashPassword, MIN_PASSWORD_LENGTH } from "@/lib/auth/password";
import { createTotpSecret, matchTotpStep, totpUri } from "@/lib/auth/totp";
import { db } from "@/lib/db";
import { serverEnv } from "@/lib/env";

try {
  process.loadEnvFile();
} catch {
  // variáveis já no ambiente
}

let muted = false;
const output = new Writable({
  write(chunk: Buffer, encoding: BufferEncoding, callback: () => void) {
    if (!muted) stdout.write(chunk, encoding);
    callback();
  },
});
const rl = createInterface({ input: stdin, output, terminal: true });

async function ask(question: string, hidden = false): Promise<string> {
  stdout.write(question);
  muted = hidden;
  const answer = await rl.question("");
  muted = false;
  if (hidden) stdout.write("\n");
  return answer.trim();
}

function fail(message: string): never {
  console.error(`\n✗ ${message}`);
  process.exit(1);
}

async function main(): Promise<void> {
  const env = serverEnv();

  const email = z.email().safeParse((await ask("E-mail: ")).toLowerCase());
  if (!email.success) fail("E-mail inválido.");
  if (await db().user.findUnique({ where: { email: email.data } })) fail("Já existe usuário com esse e-mail.");

  const password = await ask(`Senha (mínimo ${MIN_PASSWORD_LENGTH} caracteres): `, true);
  if (password.length < MIN_PASSWORD_LENGTH) fail("Senha curta demais.");
  if ((await ask("Repita a senha: ", true)) !== password) fail("As senhas não conferem.");

  const secret = createTotpSecret();
  const uri = totpUri(secret, email.data);
  stdout.write("\nEscaneie no app autenticador (1Password, Google Authenticator, Authy…):\n\n");
  stdout.write(await QRCode.toString(uri, { type: "terminal", small: true }));
  stdout.write(`\nOu digite a chave manualmente: ${secret}\n\n`);

  let step: number | null = null;
  for (let attempt = 1; attempt <= 3 && step === null; attempt++) {
    step = matchTotpStep(secret, await ask("Código de 6 dígitos para confirmar: "));
    if (step === null) stdout.write("Código inválido.\n");
  }
  if (step === null) fail("2FA não confirmado. Nada foi gravado.");

  await db().user.create({
    data: {
      email: email.data,
      passwordHash: await hashPassword(password),
      totpSecretEnc: encryptSecret(secret, env.AUTH_SECRET, TOTP_KEY_PURPOSE),
      totpEnabledAt: new Date(),
      // O código usado aqui não serve para o primeiro login.
      totpLastStep: step,
    },
  });
  stdout.write(`\n✓ Usuário ${email.data} criado com 2FA ativo.\n`);
}

main()
  .catch((error: unknown) => fail(error instanceof Error ? error.message : String(error)))
  .finally(async () => {
    rl.close();
    await db().$disconnect();
  });
