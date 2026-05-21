export type Language = "zh" | "en";

export const defaultLanguage: Language = "zh";
export const supportedLanguages: Language[] = ["zh", "en"];
export const languageStorageKey = "openachieve_language";

type DictionaryValue = string | DictionaryMap;

interface DictionaryMap {
  [key: string]: DictionaryValue;
}

const dictionaries: Record<Language, DictionaryMap> = {
  zh: {
    language: {
      label: "语言",
      zh: "中文",
      en: "English",
      zhDesc: "中文界面",
      enDesc: "英文界面",
    },
    routes: {
      pricing: "价格套餐",
      models: "支持模型",
      docs: "开发文档",
      account: "账号总览",
      admin: "管理后台",
      dashboard: "Key 控制台",
      playground: "API 调试台",
      login: "登录",
      register: "注册",
      docsBaseUrl: "接口地址",
      docsChat: "聊天补全示例",
      terms: "服务条款",
    },
    header: {
      openMenu: "打开菜单",
      closeMenu: "关闭菜单",
      siteNav: "站点导航",
      mobileNav: "移动端导航",
      accountOverview: "账号总览",
      keyConsole: "Key 控制台",
      logout: "退出",
    },
    footer: {
      tagline: "面向国内开发者的 OpenAI-compatible API 中转服务。",
      sitemap: "页脚站点地图",
      product: "产品",
      account: "账号",
      developer: "开发者",
    },
    announcement: {
      close: "关闭弹窗",
      pill: "Free Models",
      eyebrow: "OpenAchieve Free",
      title: "当前可用免费模型",
      current: "当前 Free 可用：",
      syncing: "当前免费模型池正在同步",
      body: "Free 用户每月 500 次请求额度，可调用实时同步的免费模型池。免费模型适合接入验证、轻量实验和非敏感内容探索。",
      list: "免费模型列表",
      unavailable: "暂时不可用",
      syncingShort: "正在同步",
      closeAction: "关闭",
      closeToday: "今日不再显示",
    },
  },
  en: {
    language: {
      label: "Language",
      zh: "Chinese",
      en: "English",
      zhDesc: "Chinese UI",
      enDesc: "English UI",
    },
    routes: {
      pricing: "Pricing",
      models: "Models",
      docs: "Docs",
      account: "Account",
      admin: "Admin",
      dashboard: "Key Console",
      playground: "Playground",
      login: "Log in",
      register: "Sign up",
      docsBaseUrl: "Base URL",
      docsChat: "Chat example",
      terms: "Terms",
    },
    header: {
      openMenu: "Open menu",
      closeMenu: "Close menu",
      siteNav: "Site navigation",
      mobileNav: "Mobile navigation",
      accountOverview: "Account",
      keyConsole: "Key console",
      logout: "Log out",
    },
    footer: {
      tagline: "An OpenAI-compatible API relay for developers who need a simpler model gateway.",
      sitemap: "Footer sitemap",
      product: "Product",
      account: "Account",
      developer: "Developers",
    },
    announcement: {
      close: "Close modal",
      pill: "Free Models",
      eyebrow: "OpenAchieve Free",
      title: "Currently Available Free Models",
      current: "Available for Free users: ",
      syncing: "The free model catalog is syncing",
      body: "Free users get 500 requests per month and can use the live free model catalog. Free models are best for integration checks, light experiments, and non-sensitive content.",
      list: "Free model list",
      unavailable: "Temporarily unavailable",
      syncingShort: "Syncing",
      closeAction: "Close",
      closeToday: "Hide for today",
    },
  },
};

export function isLanguage(value: string | null | undefined): value is Language {
  return value === "zh" || value === "en";
}

export function getTranslation(language: Language, key: string): string {
  const value = key.split(".").reduce<DictionaryValue | undefined>((current, segment) => {
    if (!current || typeof current === "string") return undefined;
    return current[segment];
  }, dictionaries[language]);

  if (typeof value === "string") return value;
  if (language !== defaultLanguage) return getTranslation(defaultLanguage, key);
  return key;
}
