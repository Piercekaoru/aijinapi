"use client";

import { useEffect, useRef } from "react";
import { loadPublicFreeModels, modelDisplayName } from "@/lib/free-models";
import { useI18n } from "@/lib/i18n";
import type { Language } from "@/lib/i18n-core";
import { SiteFooter } from "../components/SiteFooter";
import { SiteHeader } from "../components/SiteHeader";

type ModelsPageClientProps = {
  style: string;
  html: Record<Language, string>;
  title: Record<Language, string>;
};

const codeSamples: Record<Language, Record<"python" | "js" | "curl", string>> = {
  zh: {
    python: `from openai import OpenAI

client = OpenAI(
    api_key="YOUR_OPENACHIEVE_KEY",
    base_url="https://openachieve.asia/v1"
)

response = client.chat.completions.create(
    model="qwen3.6-plus",
    messages=[
        {"role": "user", "content": "用三句话解释 OpenAchieve 的接入方式"}
    ]
)

print(response.choices[0].message.content)`,
  js: `import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENACHIEVE_KEY,
  baseURL: "https://openachieve.asia/v1"
});

const response = await client.chat.completions.create({
  model: "deepseek-v4-pro",
  messages: [
    { role: "user", content: "生成一个模型选型建议" }
  ]
});

console.log(response.choices[0].message.content);`,
  curl: `curl https://openachieve.asia/v1/chat/completions \\
  -H "Authorization: Bearer YOUR_OPENACHIEVE_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "kimi-k2.6",
    "messages": [
      { "role": "user", "content": "总结这份文档的重点" }
    ]
  }'`,
  },
  en: {
    python: `from openai import OpenAI

client = OpenAI(
    api_key="YOUR_OPENACHIEVE_KEY",
    base_url="https://openachieve.asia/v1"
)

response = client.chat.completions.create(
    model="qwen3.6-plus",
    messages=[
        {"role": "user", "content": "Explain the OpenAchieve integration flow in three sentences"}
    ]
)

print(response.choices[0].message.content)`,
    js: `import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENACHIEVE_KEY,
  baseURL: "https://openachieve.asia/v1"
});

const response = await client.chat.completions.create({
  model: "deepseek-v4-pro",
  messages: [
    { role: "user", content: "Recommend a model for my app" }
  ]
});

console.log(response.choices[0].message.content);`,
    curl: `curl https://openachieve.asia/v1/chat/completions \\
  -H "Authorization: Bearer YOUR_OPENACHIEVE_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "kimi-k2.6",
    "messages": [
      { "role": "user", "content": "Summarize the key points of this document" }
    ]
  }'`,
  },
};

export function ModelsPageClient({ style, html, title }: ModelsPageClientProps) {
  const { language } = useI18n();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.title = title[language];
    const root = rootRef.current;
    if (!root) return;

    const controller = new AbortController();
    const signal = controller.signal;
    const codeBlock = root.querySelector<HTMLElement>("#codeBlock");
    const codeTabs = Array.from(root.querySelectorAll<HTMLButtonElement>(".code-tab"));
    const filters = Array.from(root.querySelectorAll<HTMLButtonElement>(".filter"));
    const cards = () => Array.from(root.querySelectorAll<HTMLElement>(".model-card"));

    function renderCode(kind: keyof (typeof codeSamples)["zh"]) {
      if (codeBlock) codeBlock.textContent = codeSamples[language][kind];
      codeTabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.code === kind));
    }

    function applyFilter(kind: string) {
      filters.forEach((button) => button.classList.toggle("active", button.dataset.filter === kind));
      cards().forEach((card) => {
        const categories = card.dataset.category?.split(" ") ?? [];
        card.hidden = kind !== "all" && !categories.includes(kind);
      });
    }

    codeTabs.forEach((tab) => {
      tab.addEventListener(
        "click",
        () => {
          if (tab.dataset.code === "python" || tab.dataset.code === "js" || tab.dataset.code === "curl") {
            renderCode(tab.dataset.code);
          }
        },
        { signal },
      );
    });
    filters.forEach((button) => {
      button.addEventListener("click", () => applyFilter(button.dataset.filter ?? "all"), { signal });
    });

    renderCode("python");

    loadPublicFreeModels(signal)
      .then((catalog) => {
        const freeModels = catalog.fail_closed ? [] : catalog.data;
        const freeIds = new Set(freeModels.map((model) => model.id));
        const modelText =
          freeModels.length > 0
            ? freeModels.map((model) => modelDisplayName(model.id)).join(language === "zh" ? "、" : ", ")
            : language === "zh"
              ? "当前免费模型池正在同步"
              : "The free model catalog is syncing";

        root.querySelectorAll<HTMLElement>("[data-live-free-count]").forEach((element) => {
          element.textContent =
            freeModels.length > 0
              ? language === "zh"
                ? `${freeModels.length} 个实时免费模型`
                : `${freeModels.length} live free models`
              : language === "zh"
                ? "实时免费模型池"
                : "live free model catalog";
        });
        root.querySelectorAll<HTMLElement>("[data-live-free-models]").forEach((element) => {
          element.textContent = modelText;
        });

        const grid = root.querySelector<HTMLElement>(".model-grid");
        if (!grid) return;

        cards().forEach((card) => {
          const tier = card.querySelector(".model-tier")?.textContent?.trim();
          const id = card.querySelector(".model-id")?.textContent?.trim();
          if (tier === "Free" && id) {
            card.hidden = !freeIds.has(id);
          }
        });

        const existingIds = new Set(
          cards()
            .map((card) => card.querySelector(".model-id")?.textContent?.trim())
            .filter(Boolean),
        );
        freeModels
          .filter((model) => !existingIds.has(model.id))
          .forEach((model) => {
            const card = document.createElement("article");
            card.className = "model-card";
            card.dataset.category = "chat fast";
            card.innerHTML = `<p class="model-tier">Free</p><h3>${escapeHtml(
              modelDisplayName(model.id),
            )}</h3><p class="model-desc">${language === "zh" ? "当前实时同步的免费模型，适合接入验证、轻量实验和非敏感内容探索。" : "A live free model for integration checks, light experiments, and non-sensitive exploration."}</p><code class="model-id">${escapeHtml(
              model.id,
            )}</code>`;
            grid.appendChild(card);
          });
      })
      .catch(() => {
        root.querySelectorAll<HTMLElement>("[data-live-free-count]").forEach((element) => {
          element.textContent = language === "zh" ? "实时免费模型池" : "live free model catalog";
        });
      });

    return () => controller.abort();
  }, [language, title]);

  return (
    <div>
      <style dangerouslySetInnerHTML={{ __html: style }} />
      <div className="static-page-chrome">
        <SiteHeader active="models" variant="public" />
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

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
