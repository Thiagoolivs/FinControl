import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/constants";

// Checagem otimista: sem cookie, redireciona antes de renderizar.
// A validação de verdade (sessão no banco + TOTP) fica em lib/auth/dal.ts.
export function proxy(request: NextRequest) {
  if (request.cookies.has(SESSION_COOKIE)) return NextResponse.next();
  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  matcher: ["/((?!login|api/health|api/cron|_next/static|_next/image|favicon.ico).*)"],
};
