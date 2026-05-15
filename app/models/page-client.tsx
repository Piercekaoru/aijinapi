"use client";

import { useEffect, useRef } from "react";
import { SiteFooter } from "../components/SiteFooter";
import { SiteHeader } from "../components/SiteHeader";

type ModelsPageClientProps = {
  style: string;
  html: string;
};

const codeSamples = {
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
};

export function ModelsPageClient({ style, html }: ModelsPageClientProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const controller = new AbortController();
    const signal = controller.signal;
    const codeBlock = root.querySelector<HTMLElement>("#codeBlock");
    const codeTabs = Array.from(root.querySelectorAll<HTMLButtonElement>(".code-tab"));
    const filters = Array.from(root.querySelectorAll<HTMLButtonElement>(".filter"));
    const cards = Array.from(root.querySelectorAll<HTMLElement>(".model-card"));

    function renderCode(kind: keyof typeof codeSamples) {
      if (codeBlock) codeBlock.textContent = codeSamples[kind];
      codeTabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.code === kind));
    }

    function applyFilter(kind: string) {
      filters.forEach((button) => button.classList.toggle("active", button.dataset.filter === kind));
      cards.forEach((card) => {
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

    return () => controller.abort();
  }, []);

  return (
    <div>
      <style dangerouslySetInnerHTML={{ __html: style }} />
      <div className="static-page-chrome">
        <SiteHeader active="models" variant="public" />
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
