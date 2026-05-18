import { NextRequest, NextResponse } from "next/server";

const LEGACY_LOCALES = ["ja", "zh"] as const;

function legacyLocaleRedirect(pathname: string) {
  for (const locale of LEGACY_LOCALES) {
    if (pathname === `/${locale}`) return "/";
    if (pathname.startsWith(`/${locale}/`)) return pathname.slice(locale.length + 1) || "/";
  }

  return null;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const redirectedPath = legacyLocaleRedirect(pathname);

  if (!redirectedPath) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = redirectedPath;
  return NextResponse.redirect(url, 308);
}

export const config = {
  matcher: ["/((?!_next|api|v1|images|favicon.ico|.*\\.\\w+$).*)"],
};
