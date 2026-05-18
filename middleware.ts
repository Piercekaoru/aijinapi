import { NextRequest, NextResponse } from "next/server";

const LEGACY_LOCALES = ["ja", "zh"] as const;
const PROXIED_API_PREFIXES = ["/api/backend", "/v1"] as const;

function legacyLocaleRedirect(pathname: string) {
  for (const locale of LEGACY_LOCALES) {
    if (pathname === `/${locale}`) return "/";
    if (pathname.startsWith(`/${locale}/`)) return pathname.slice(locale.length + 1) || "/";
  }

  return null;
}

function proxiedApiPath(pathname: string) {
  return PROXIED_API_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function firstForwardedIp(value: string | null) {
  return value
    ?.split(",")
    .map((part) => part.trim())
    .find(Boolean);
}

function clientIpFromHeaders(headers: Headers) {
  return (
    firstForwardedIp(headers.get("cf-connecting-ip")) ??
    firstForwardedIp(headers.get("x-real-ip")) ??
    firstForwardedIp(headers.get("x-forwarded-for"))
  );
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (proxiedApiPath(pathname)) {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.delete("x-openachieve-client-ip");

    const clientIp = clientIpFromHeaders(request.headers);
    if (clientIp) {
      requestHeaders.set("x-openachieve-client-ip", clientIp);
    }

    return NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
  }

  const redirectedPath = legacyLocaleRedirect(pathname);

  if (!redirectedPath) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = redirectedPath;
  return NextResponse.redirect(url, 308);
}

export const config = {
  matcher: ["/api/backend/:path*", "/v1/:path*", "/((?!_next|api|v1|images|favicon.ico|.*\\.\\w+$).*)"],
};
