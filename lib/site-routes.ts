import type { Locale } from "./i18n/types";
import { DEFAULT_LOCALE } from "./i18n/types";
import { t } from "./i18n/dict";

export type SiteRouteKey =
  | "pricing"
  | "models"
  | "docs"
  | "account"
  | "dashboard"
  | "playground"
  | "login"
  | "register"
  | "docsBaseUrl"
  | "docsChat"
  | "terms";

export type SiteNavItem = {
  key: SiteRouteKey;
  href: string;
  label: string;
};

const routeLabelKeys: Record<SiteRouteKey, string> = {
  pricing: "route.pricing",
  models: "route.models",
  docs: "route.docs",
  account: "route.account",
  dashboard: "route.dashboard",
  playground: "route.playground",
  login: "route.login",
  register: "route.register",
  docsBaseUrl: "route.docsBaseUrl",
  docsChat: "route.docsChat",
  terms: "route.terms",
};

const routeHrefs: Record<SiteRouteKey, string> = {
  pricing: "/#pricing",
  models: "/models",
  docs: "/docs",
  account: "/account",
  dashboard: "/dashboard",
  playground: "/playground",
  login: "/login",
  register: "/login?mode=register",
  docsBaseUrl: "/docs#base-url",
  docsChat: "/docs#chat",
  terms: "/terms",
};

export function siteRoutesFor(locale: Locale): Record<SiteRouteKey, SiteNavItem> {
  const prefix = locale === DEFAULT_LOCALE ? "" : `/${locale}`;
  const result = {} as Record<SiteRouteKey, SiteNavItem>;

  for (const key of Object.keys(routeHrefs) as SiteRouteKey[]) {
    const href = routeHrefs[key].startsWith("/#")
      ? `${prefix}${routeHrefs[key]}`
      : `${prefix}${routeHrefs[key]}`;
    result[key] = {
      key,
      href,
      label: t(locale, routeLabelKeys[key]),
    };
  }

  return result;
}

export const siteRoutes = siteRoutesFor(DEFAULT_LOCALE);

export function publicNavItemsFor(locale: Locale) {
  const r = siteRoutesFor(locale);
  return [r.pricing, r.models, r.docs] as const;
}

export function workspaceNavItemsFor(locale: Locale) {
  const r = siteRoutesFor(locale);
  return [r.account, r.dashboard, r.playground, r.docs] as const;
}

export function footerGroupsFor(locale: Locale) {
  const r = siteRoutesFor(locale);
  return [
    {
      title: t(locale, "footer.product"),
      links: [r.pricing, r.models, r.docs, r.terms],
    },
    {
      title: t(locale, "footer.account"),
      links: [r.login, r.register, r.account, r.dashboard],
    },
    {
      title: t(locale, "footer.developer"),
      links: [r.playground, r.docsBaseUrl, r.docsChat],
    },
  ] as const;
}

export const publicNavItems = publicNavItemsFor(DEFAULT_LOCALE);
export const workspaceNavItems = workspaceNavItemsFor(DEFAULT_LOCALE);
export const footerGroups = footerGroupsFor(DEFAULT_LOCALE);
