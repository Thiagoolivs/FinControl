import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/constants";

// Checagem otimista: sem cookie, redireciona antes de renderizar.
// A validação de verdade (sessão no banco + TOTP) fica em lib/auth/dal.ts.
export function proxy(request: NextRequest) {
  if (request.cookies.has(SESSION_COOKIE)) return NextResponse.next();
  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  // Fora da checagem: login, rotas com segredo próprio, estáticos e o que o navegador busca para instalar o app.
  matcher: [
    "/((?!login|api/health|api/cron|_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png|manifest.webmanifest|sw.js|offline.html|icons/).*)",
  ],
};
