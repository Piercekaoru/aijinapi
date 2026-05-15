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
  pricing: { key: "pricing", href: "/#pricing", label: "价格套餐" },
  models: { key: "models", href: "/models", label: "支持模型" },
  docs: { key: "docs", href: "/docs", label: "开发文档" },
  account: { key: "account", href: "/account", label: "账号总览" },
  admin: { key: "admin", href: "/admin", label: "管理后台" },
  dashboard: { key: "dashboard", href: "/dashboard", label: "Key 控制台" },
  playground: { key: "playground", href: "/playground", label: "API 调试台" },
  login: { key: "login", href: "/login", label: "登录" },
  register: { key: "register", href: "/login?mode=register", label: "注册" },
  docsBaseUrl: { key: "docsBaseUrl", href: "/docs#base-url", label: "接口地址" },
  docsChat: { key: "docsChat", href: "/docs#chat", label: "聊天补全示例" },
  terms: { key: "terms", href: "/terms", label: "服务条款" },
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
    title: "产品",
    links: [siteRoutes.pricing, siteRoutes.models, siteRoutes.docs, siteRoutes.terms],
  },
  {
    title: "账号",
    links: [siteRoutes.login, siteRoutes.register, siteRoutes.account, siteRoutes.dashboard],
  },
  {
    title: "开发者",
    links: [siteRoutes.playground, siteRoutes.docsBaseUrl, siteRoutes.docsChat],
  },
] as const;
