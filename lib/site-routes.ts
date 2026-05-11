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
  | "docsChat";

export type SiteNavItem = {
  key: SiteRouteKey;
  href: string;
  label: string;
};

export const siteRoutes = {
  pricing: { key: "pricing", href: "/#pricing", label: "价格套餐" },
  models: { key: "models", href: "/models", label: "支持模型" },
  docs: { key: "docs", href: "/docs", label: "开发文档" },
  account: { key: "account", href: "/account", label: "账号总览" },
  dashboard: { key: "dashboard", href: "/dashboard", label: "Key 控制台" },
  playground: { key: "playground", href: "/playground", label: "API 调试台" },
  login: { key: "login", href: "/login", label: "登录" },
  register: { key: "register", href: "/login?mode=register", label: "注册" },
  docsBaseUrl: { key: "docsBaseUrl", href: "/docs#base-url", label: "Base URL" },
  docsChat: { key: "docsChat", href: "/docs#chat", label: "聊天补全示例" },
} as const satisfies Record<SiteRouteKey, SiteNavItem>;

export const publicNavItems = [
  siteRoutes.pricing,
  siteRoutes.models,
  siteRoutes.docs,
] as const;

export const workspaceNavItems = [
  siteRoutes.account,
  siteRoutes.dashboard,
  siteRoutes.playground,
  siteRoutes.docs,
] as const;

export const footerGroups = [
  {
    title: "产品",
    links: [siteRoutes.pricing, siteRoutes.models, siteRoutes.docs],
  },
  {
    title: "账号",
    links: [
      siteRoutes.login,
      siteRoutes.register,
      siteRoutes.account,
      siteRoutes.dashboard,
    ],
  },
  {
    title: "开发者",
    links: [siteRoutes.playground, siteRoutes.docsBaseUrl, siteRoutes.docsChat],
  },
] as const;
