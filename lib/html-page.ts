import { readFileSync } from "fs";
import { join } from "path";
import { siteRoutes } from "./site-routes";
import type { Locale } from "./i18n/types";

type RouteKind = "landing" | "login" | "models";

export type StaticHtmlPage = {
  title: string;
  style: string;
  body: string;
};

const htmlFiles: Record<RouteKind, string> = {
  landing: "openachieve-landing",
  login: "openachieve-login",
  models: "openachieve-models",
};

function localeFilename(kind: RouteKind, locale: Locale): string {
  const base = htmlFiles[kind];
  if (locale === "ja") {
    return `${base}-ja.html`;
  }
  return `${base}.html`;
}

const assetReplacements: Record<string, string> = {
  "moycqu29-IMG_4393.JPG": "/images/IMG_4393.JPG",
  "moycqy9a-IMG_4395.JPG": "/images/IMG_4395.JPG",
  "moycqy9d-IMG_4396.JPG": "/images/IMG_4396.JPG",
  "moycqu2b-IMG_4394.JPG": "/images/IMG_4394.JPG",
  "moyi955f-HAh3SWLacAAA6By.jpg": "/images/HAh3SWLacAAA6By.jpg",
  "moyfxjoe-GwvxlZqbIAAqlQB.jpg": "/images/GwvxlZqbIAAqlQB.jpg",
};

function rewriteAssets(html: string) {
  return Object.entries(assetReplacements).reduce(
    (next, [from, to]) => next.replaceAll(from, to),
    html,
  );
}

function stripStaticChrome(html: string, kind: RouteKind) {
  if (kind !== "landing" && kind !== "models") return html;

  return html
    .replace(/<nav class="nav"[\s\S]*?<\/nav>/, "")
    .replace(/<footer class="footer"[\s\S]*?<\/footer>/, "");
}

function rewriteLinks(html: string, kind: RouteKind) {
  let next = html;

  if (kind === "landing") {
    next = next
      .replace('href="#top"', 'href="/"')
      .replaceAll('href="#">登录</a>', `href="${siteRoutes.login.href}">登录</a>`)
      .replaceAll('href="#">注册</a>', `href="${siteRoutes.register.href}">注册</a>`)
      .replaceAll(
        'href="#">立即注册获取 Key</a>',
        `href="${siteRoutes.register.href}">立即注册获取 Key</a>`,
      )
      .replaceAll('href="#models"', `href="${siteRoutes.models.href}"`);
  }

  if (kind === "login") {
    next = next.replaceAll('href="index.html"', 'href="/"');
  }

  if (kind === "models") {
    next = next
      .replace('href="#top"', 'href="/"')
      .replaceAll('href="openachieve-dashboard.html"', 'href="/dashboard"');
  }

  return next;
}

export function getStaticHtmlPage(kind: RouteKind, locale: Locale = "zh"): StaticHtmlPage {
  const filename = localeFilename(kind, locale);
  const raw = readFileSync(join(process.cwd(), filename), "utf8");
  const title = raw.match(/<title>(.*?)<\/title>/s)?.[1] ?? "OpenAchieve";
  const style = raw.match(/<style>(.*?)<\/style>/s)?.[1] ?? "";
  const body = raw.match(/<body>(.*?)<\/body>/s)?.[1] ?? "";
  const bodyWithoutScript = body.replace(/<script>[\s\S]*?<\/script>/g, "");
  const bodyWithoutStaticChrome = stripStaticChrome(bodyWithoutScript, kind);

  return {
    title,
    style,
    body: rewriteLinks(rewriteAssets(bodyWithoutStaticChrome), kind),
  };
}
