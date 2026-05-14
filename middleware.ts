import { NextRequest, NextResponse } from "next/server";

const SUPPORTED_LOCALES = ["zh", "ja"] as const;
const DEFAULT_LOCALE = "zh";

function getLocaleFromPath(pathname: string): string | null {
  for (const locale of SUPPORTED_LOCALES) {
    if (pathname === `/${locale}` || pathname.startsWith(`/${locale}/`)) {
      return locale;
    }
  }
  return null;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip internal Next.js paths and static assets
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/images") ||
    pathname.match(/\.\w+$/)
  ) {
    return NextResponse.next();
  }

  const pathLocale = getLocaleFromPath(pathname);

  if (pathLocale) {
    // Already has locale prefix — rewrite to [locale] route
    const pathWithoutLocale = pathname === `/${pathLocale}`
      ? "/"
      : pathname.slice(pathLocale.length + 1);

    const url = request.nextUrl.clone();
    url.pathname = `/${pathLocale}${pathWithoutLocale}`;
    return NextResponse.rewrite(url);
  }

  // No locale — redirect to default locale
  const url = request.nextUrl.clone();
  url.pathname = `/${DEFAULT_LOCALE}${pathname}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next|api|images|favicon.ico|.*\\.\\w+$).*)"],
};
