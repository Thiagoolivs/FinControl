import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { Eyebrow } from "@/components/ui/text";
import { TOTP_KEY_PURPOSE } from "@/lib/auth/constants";
import { decryptSecret, encryptSecret } from "@/lib/auth/crypto";
import { readSession } from "@/lib/auth/session";
import { createTotpSecret, totpUri } from "@/lib/auth/totp";
import { db } from "@/lib/db";
import { serverEnv } from "@/lib/env";
import { TotpForm } from "../totp-form";

/** Primeiro login: senha já conferida, falta cadastrar o app autenticador. */
export default async function ConfigureTwoFactorPage() {
  const session = await readSession();
  if (session.status === "authenticated") redirect("/");
  if (session.status === "none") redirect("/login");

  const { AUTH_SECRET } = serverEnv();
  // Gera o segredo uma vez e reaproveita até a confirmação: recarregar não invalida um QR já escaneado.
  await db().user.updateMany({
    where: { id: session.userId, totpEnabledAt: null, totpSecretEnc: null },
    data: { totpSecretEnc: encryptSecret(createTotpSecret(), AUTH_SECRET, TOTP_KEY_PURPOSE) },
  });
  const user = await db().user.findUnique({
    where: { id: session.userId },
    select: { username: true, email: true, totpEnabledAt: true, totpSecretEnc: true },
  });
  if (!user?.totpSecretEnc) redirect("/login");
  if (user.totpEnabledAt) redirect("/login/2fa");

  const secret = decryptSecret(user.totpSecretEnc, AUTH_SECRET, TOTP_KEY_PURPOSE);
  const uri = totpUri(secret, user.username ?? user.email ?? "conta");
  const qr = await QRCode.toDataURL(uri, { margin: 1, width: 440, color: { dark: "#0a0a0bff", light: "#ffffffff" } });
  const groupedSecret = secret.match(/.{1,4}/g)?.join(" ") ?? secret;

  return (
    <main className="mx-auto flex w-full max-w-[420px] flex-1 flex-col justify-center gap-8 px-5 py-16">
      <header className="flex flex-col gap-2">
        <Eyebrow>FinControl</Eyebrow>
        <h1 className="m-0 text-[34px] font-light leading-10 tracking-[-0.03em]">Ative o 2FA</h1>
        <p className="m-0 text-[15px] leading-[21px] text-text-secondary">
          Adicione esta conta a um app autenticador e digite o código de 6 dígitos que ele mostrar. Só precisa fazer isso uma vez.
        </p>
      </header>

      <div className="flex flex-col gap-4">
        <a
          href={uri}
          className="flex h-[50px] items-center justify-center rounded-button bg-text-primary/10 text-[16px] font-medium text-text-primary no-underline"
        >
          Abrir no app autenticador
        </a>
        <div className="self-center rounded-card bg-white p-3">
          <Image src={qr} alt="QR code para cadastrar o FinControl no app autenticador" width={200} height={200} unoptimized />
        </div>
        <div className="flex flex-col gap-1.5">
          <Eyebrow>Ou digite a chave</Eyebrow>
          <code className="select-all break-words font-mono text-[15px] tracking-wide">{groupedSecret}</code>
        </div>
      </div>

      <TotpForm />

      <Link href="/login" className="flex min-h-11 items-center self-start text-[15px] text-accent">
        Voltar
      </Link>
    </main>
  );
}
