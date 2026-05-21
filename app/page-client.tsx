"use client";

import { useEffect, useRef } from "react";
import { loadPublicFreeModels, modelDisplayName } from "@/lib/free-models";
import { useI18n } from "@/lib/i18n";
import type { Language } from "@/lib/i18n-core";
import { useDocumentTitle } from "@/lib/use-document-title";
import { SiteFooter } from "./components/SiteFooter";
import { SiteHeader } from "./components/SiteHeader";

type HomePageClientProps = {
  style: string;
  html: Record<Language, string>;
  title: Record<Language, string>;
};

export function HomePageClient({ style, html, title }: HomePageClientProps) {
  const { language } = useI18n();
  const rootRef = useRef<HTMLDivElement>(null);
  useDocumentTitle(title[language]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const controller = new AbortController();
    loadPublicFreeModels(controller.signal)
      .then((catalog) => {
        const models = catalog.fail_closed ? [] : catalog.data;
        const modelText =
          models.length > 0
            ? models.map((model) => modelDisplayName(model.id)).join(language === "zh" ? "、" : ", ")
            : language === "zh"
              ? "当前免费模型池正在同步"
              : "The free model catalog is syncing";
        root.querySelectorAll<HTMLElement>("[data-live-free-models]").forEach((element) => {
          element.textContent = modelText;
        });
        root.querySelectorAll<HTMLElement>("[data-live-free-count]").forEach((element) => {
          element.textContent =
            models.length > 0
              ? language === "zh"
                ? `${models.length} 个实时免费模型`
                : `${models.length} live free models`
              : language === "zh"
                ? "实时免费模型池"
                : "live free model catalog";
        });
      })
      .catch(() => {
        root.querySelectorAll<HTMLElement>("[data-live-free-count]").forEach((element) => {
          element.textContent = language === "zh" ? "实时免费模型池" : "live free model catalog";
        });
      });

    return () => controller.abort();
  }, [language]);

  return (
    <div>
      <style dangerouslySetInnerHTML={{ __html: style }} />
      <div className="static-page-chrome">
        <SiteHeader variant="public" />
      </div>
      <div key={language} ref={rootRef} dangerouslySetInnerHTML={{ __html: html[language] }} />
      <SiteFooter />
      <style jsx>{`
        .static-page-chrome {
          width: min(1220px, calc(100% - 48px));
          margin: 0 auto;
        }

        @media (max-width: 760px) {
          .static-page-chrome {
            width: min(100% - 28px, 1220px);
            overflow: hidden;
          }
        }
      `}</style>
    </div>
  );
}
