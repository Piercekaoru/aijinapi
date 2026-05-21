export type SiteRouteKey =
  | "pricing"
  | "models"
  | "docs"
  | "account"
  | "admin"
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

export const siteRoutes: Record<SiteRouteKey, SiteNavItem> = {
  pricing: { key: "pricing", href: "/#pricing", label: "Pricing" },
  models: { key: "models", href: "/models", label: "Models" },
  docs: { key: "docs", href: "/docs", label: "Docs" },
  account: { key: "account", href: "/account", label: "Account" },
  admin: { key: "admin", href: "/admin", label: "Admin" },
  dashboard: { key: "dashboard", href: "/dashboard", label: "Key Console" },
  playground: { key: "playground", href: "/playground", label: "Playground" },
  login: { key: "login", href: "/login", label: "Log in" },
  register: { key: "register", href: "/login?mode=register", label: "Sign up" },
  docsBaseUrl: { key: "docsBaseUrl", href: "/docs#base-url", label: "Base URL" },
  docsChat: { key: "docsChat", href: "/docs#chat", label: "Chat example" },
  terms: { key: "terms", href: "/terms", label: "Terms" },
};

export const publicNavItems = [siteRoutes.pricing, siteRoutes.models, siteRoutes.docs] as const;

export const workspaceNavItems = [
  siteRoutes.account,
  siteRoutes.dashboard,
  siteRoutes.playground,
  siteRoutes.docs,
] as const;

export const footerGroups = [
  {
    title: "Product",
    titleKey: "product",
    links: [siteRoutes.pricing, siteRoutes.models, siteRoutes.docs, siteRoutes.terms],
  },
  {
    title: "Account",
    titleKey: "account",
    links: [siteRoutes.login, siteRoutes.register, siteRoutes.account, siteRoutes.dashboard],
  },
  {
    title: "Developers",
    titleKey: "developer",
    links: [siteRoutes.playground, siteRoutes.docsBaseUrl, siteRoutes.docsChat],
  },
] as const;
