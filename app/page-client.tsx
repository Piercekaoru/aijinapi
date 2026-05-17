"use client";

import { useEffect, useRef } from "react";
import { loadPublicFreeModels, modelDisplayName } from "@/lib/free-models";
import { SiteFooter } from "./components/SiteFooter";
import { SiteHeader } from "./components/SiteHeader";

type HomePageClientProps = {
  style: string;
  html: string;
};

export function HomePageClient({ style, html }: HomePageClientProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const controller = new AbortController();
    loadPublicFreeModels(controller.signal)
      .then((catalog) => {
        const models = catalog.fail_closed ? [] : catalog.data;
        const modelText =
          models.length > 0
            ? models.map((model) => modelDisplayName(model.id)).join("、")
            : "当前免费模型池正在同步";
        root.querySelectorAll<HTMLElement>("[data-live-free-models]").forEach((element) => {
          element.textContent = modelText;
        });
        root.querySelectorAll<HTMLElement>("[data-live-free-count]").forEach((element) => {
          element.textContent =
            models.length > 0 ? `${models.length} 个实时免费模型` : "实时免费模型池";
        });
      })
      .catch(() => {
        root.querySelectorAll<HTMLElement>("[data-live-free-count]").forEach((element) => {
          element.textContent = "实时免费模型池";
        });
      });

    return () => controller.abort();
  }, []);

  return (
    <div>
      <style dangerouslySetInnerHTML={{ __html: style }} />
      <div className="static-page-chrome">
        <SiteHeader variant="public" />
      </div>
      <div ref={rootRef} dangerouslySetInnerHTML={{ __html: html }} />
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
