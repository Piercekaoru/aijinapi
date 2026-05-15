"use client";

import Image from "next/image";
import { SiteFooter } from "../components/SiteFooter";
import { SiteHeader } from "../components/SiteHeader";
import { useLocale } from "@/lib/i18n/context";

const models = [
  {
    id: "big-pickle",
    title: "Big Pickle",
    description: "Free 用户专属入口，适合验证接入链路和轻量探索。",
    tag: "Free",
    image: "/images/GrHDjXQXYAACVsc.jpg",
    tone: "light",
  },
  {
    id: "glm-5.1",
    title: "GLM-5.1",
    description: "中文业务问答、工具调用和稳定生产场景的通用入口。",
    tag: "Plus",
    image: "/images/Gth0fxcawAARQmB.jpg",
    tone: "light",
  },
  {
    id: "glm-5",
    title: "GLM-5",
    description: "适合知识库、客服助手和长文本理解的高性价比选择。",
    tag: "Plus",
    image: "/images/GpXqspCbYAI1hx_.jpg",
    tone: "light",
  },
  {
    id: "kimi-k2.5",
    title: "Kimi K2.5",
    description: "面向长上下文、文档总结和多轮对话的模型能力。",
    tag: "Plus",
    image: "/images/HG42ZYwa8AAGBEd.jpg",
    tone: "dark",
  },
  {
    id: "kimi-k2.6",
    title: "Kimi K2.6",
    description: "更强的文本处理与应用助手能力，适合复杂内容工作流。",
    tag: "Plus",
    image: "/images/Gt96vaQXQAIxNcp.jpg",
    tone: "light",
  },
  {
    id: "deepseek-v4-pro",
    title: "DeepSeek V4 Pro",
    description: "适合推理、代码辅助和高质量生成任务的专业模型。",
    tag: "Plus",
    image: "/images/GxpsuzYawAQQ2lR.jpg",
    tone: "light",
  },
  {
    id: "deepseek-v4-flash",
    title: "DeepSeek V4 Flash",
    description: "低延迟响应和成本敏感场景，用于高频产品调用。",
    tag: "Plus",
    image: "/images/HHZ_hQzbIAEw83V.jpg",
    tone: "dark",
  },
  {
    id: "mimo-v2.5",
    title: "MiMo V2.5",
    description: "创作、对话和轻量推理任务的平衡型模型入口。",
    tag: "Plus",
    image: "/images/HAh3SWLacAAA6By.jpg",
    tone: "light",
  },
  {
    id: "mimo-v2.5-pro",
    title: "MiMo V2.5 Pro",
    description: "更强生成质量与复杂任务处理，适合生产型内容应用。",
    tag: "Plus",
    image: "/images/GswYqEeaIAA1-SM.jpg",
    tone: "light",
  },
  {
    id: "qwen3.6-plus",
    title: "Qwen3.6 Plus",
    description: "开发者生态友好，适合代码、工具调用和通用智能体。",
    tag: "Plus",
    image: "/images/GwvxlZqbIAAqlQB.jpg",
    tone: "light",
  },
  {
    id: "qwen3.5-plus",
    title: "Qwen3.5 Plus",
    description: "稳定通用能力，适合作为应用默认模型和日常请求入口。",
    tag: "Plus",
    image: "/images/Gth0fxcawAARQmB.jpg",
    tone: "light",
  },
];

export default function DocsPage() {
  const { t } = useLocale();

  return (
    <main className="docs-page">
      <section className="docs-shell">
        <SiteHeader active="docs" variant="public" />

        <section className="intro">
          <div>
            <p>{t("docs.label")}</p>
            <h1>{t("docs.title")}</h1>
          </div>
          <span>{t("docs.subtitle")}</span>
        </section>

        <div className="docs-grid">
          <section className="panel" id="base-url">
            <p>{t("route.docsBaseUrl")}</p>
            <h2>{t("docs.baseURL")}</h2>
            <pre>https://openachieve.asia/v1</pre>
            <span>{t("docs.baseURLDesc")}</span>
          </section>

          <section className="panel" id="auth">
            <p>{t("docs.authLabel")}</p>
            <h2>{t("docs.auth")}</h2>
            <pre>{`Authorization: Bearer openachieve_xxxxxxxxxxxxxxxx`}</pre>
            <span>{t("docs.authDesc")}</span>
          </section>

          <section className="panel wide" id="chat">
            <p>{t("route.docsChat")}</p>
            <h2>{t("docs.chat")}</h2>
            <pre>{`curl https://openachieve.asia/v1/chat/completions \\
  -H "Authorization: Bearer openachieve_xxxxxxxxxxxxxxxx" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "qwen3.6-plus",
    "messages": [
      { "role": "user", "content": "介绍一下 OpenAchieve" }
    ]
  }'`}</pre>
          </section>

          <section className="panel wide" id="models">
            <p>{t("docs.models")}</p>
            <h2>{t("docs.models")}</h2>
            <span>{t("docs.modelsDesc")}</span>
            <div className="model-card-grid">
              {models.map((model) => (
                <article className={`model-card ${model.tone === "dark" ? "dark" : ""}`} key={model.id}>
                  <div className="model-copy">
                    <span className="model-tag">{model.tag}</span>
                    <h3>{model.title}</h3>
                    <p>{model.description}</p>
                    <code className="model-id">{model.id}</code>
                  </div>
                  <Image className="model-art" src={model.image} alt="" width={220} height={230} />
                </article>
              ))}
            </div>
          </section>
        </div>
      </section>
      <SiteFooter />

      <style jsx>{`
        .docs-page {
          min-height: 100vh;
          padding: 0 38px 72px;
          overflow-x: hidden;
          color: #141413;
          background:
            radial-gradient(circle at 18% 12%, rgba(201, 100, 66, 0.1), transparent 28rem),
            linear-gradient(135deg, #f5f4ed 0%, #eee9dc 100%);
          font-family: -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Noto Sans SC",
            "Microsoft YaHei", system-ui, sans-serif;
        }

        .docs-shell {
          width: min(1160px, 100%);
          margin: 0 auto;
          min-width: 0;
        }
        .intro {
          display: grid;
          grid-template-columns: minmax(0, 0.9fr) minmax(300px, 0.48fr);
          gap: 36px;
          align-items: end;
          margin-bottom: 28px;
          border-top: 1px solid #e8e6dc;
          border-bottom: 1px solid #e8e6dc;
          padding: 56px 0 46px;
        }

        .intro p,
        .panel p {
          margin: 0 0 8px;
          color: #c96442;
          font-size: 12px;
          font-weight: 800;
          letter-spacing: 0.12px;
          text-transform: uppercase;
        }

        h1,
        h2 {
          margin: 0;
          letter-spacing: 0;
        }

        h1 {
          max-width: 720px;
          font-family: "Iowan Old Style", "Yu Mincho", "Hiragino Mincho ProN", Georgia, serif;
          font-size: clamp(64px, 9vw, 118px);
          font-weight: 500;
          line-height: 0.96;
        }

        h2 {
          font-size: 23px;
        }

        .intro span,
        .panel span {
          display: block;
          color: #5e5d59;
          line-height: 1.72;
        }

        .intro span {
          max-width: 420px;
          margin: 0 0 10px;
          font-size: 18px;
        }

        .panel span {
          margin-top: 12px;
        }

        .docs-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 16px;
          margin-top: 22px;
        }

        .panel {
          border: 1px solid #f0eee6;
          border-radius: 12px;
          padding: 22px;
          background: rgba(250, 249, 245, 0.76);
          box-shadow:
            0 0 0 1px rgba(209, 207, 197, 0.42),
            0 4px 24px rgba(20, 20, 19, 0.05);
        }

        .wide {
          grid-column: 1 / -1;
        }

        pre {
          overflow: auto;
          margin: 16px 0 0;
          border: 1px solid rgba(23, 23, 21, 0.1);
          border-radius: 8px;
          padding: 16px;
          background: #181816;
          color: #fff8e8;
          font-size: 13px;
          line-height: 1.7;
          white-space: pre-wrap;
          overflow-wrap: anywhere;
          word-break: break-word;
        }

        code {
          font-family: "SFMono-Regular", Consolas, monospace;
        }

        .model-card-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 14px;
          margin-top: 18px;
        }

        .model-card {
          position: relative;
          min-height: 238px;
          overflow: hidden;
          border: 1px solid rgba(23, 23, 21, 0.12);
          border-radius: 16px;
          padding: 24px;
          background:
            linear-gradient(135deg, rgba(255, 255, 255, 0.9), rgba(251, 247, 237, 0.78)),
            #f8f5eb;
          box-shadow: 0 18px 48px rgba(48, 39, 23, 0.08);
        }

        .model-card.dark {
          border-color: rgba(255, 255, 255, 0.16);
          color: #f8f5eb;
          background:
            linear-gradient(135deg, rgba(20, 20, 19, 0.98), rgba(20, 20, 19, 0.86)),
            #151515;
          box-shadow: 0 18px 48px rgba(20, 20, 19, 0.18);
        }

        .model-copy {
          position: relative;
          z-index: 2;
          display: grid;
          max-width: 74%;
          min-height: 190px;
          align-content: start;
        }

        .model-tag {
          width: fit-content;
          margin-bottom: 20px;
          color: rgba(23, 23, 21, 0.55);
          font-size: 11px;
          font-weight: 900;
          letter-spacing: 0;
          text-transform: uppercase;
        }

        .model-card.dark .model-tag {
          color: rgba(248, 245, 235, 0.62);
        }

        h3 {
          margin: 0;
          font-family: "Iowan Old Style", "Yu Mincho", "Hiragino Mincho ProN", Georgia, serif;
          font-size: clamp(28px, 4vw, 42px);
          font-weight: 500;
          line-height: 1;
          letter-spacing: 0;
        }

        .model-card p {
          margin: 16px 0 0;
          color: rgba(23, 23, 21, 0.66);
          font-size: 15px;
          line-height: 1.72;
        }

        .model-card.dark p {
          color: rgba(248, 245, 235, 0.66);
        }

        .model-id {
          width: fit-content;
          margin-top: auto;
          border: 1px solid rgba(23, 23, 21, 0.12);
          border-radius: 8px;
          padding: 8px 10px;
          background: rgba(255, 255, 255, 0.7);
          color: #171715;
          font-size: 12px;
        }

        .model-card.dark .model-id {
          border-color: rgba(248, 245, 235, 0.16);
          background: rgba(255, 255, 255, 0.08);
          color: #f8f5eb;
        }

        :global(.model-art) {
          position: absolute;
          right: -18px;
          bottom: -42px;
          z-index: 1;
          width: min(46%, 210px);
          height: 230px;
          object-fit: cover;
          object-position: 50% 18%;
          border-radius: 22px;
          opacity: 0.34;
          transform: rotate(6deg);
          filter: saturate(0.92) contrast(1.02);
          box-shadow: 0 0 0 1px rgba(23, 23, 21, 0.12);
        }

        .model-card.dark :global(.model-art) {
          opacity: 0.42;
          box-shadow: 0 0 0 1px rgba(248, 245, 235, 0.12);
        }

        @media (max-width: 760px) {
          .docs-page {
            padding: 0 14px 48px;
            overflow-x: hidden;
          }

          .docs-shell {
            min-width: 0;
          }

          .intro,
          .docs-grid {
            display: grid;
            grid-template-columns: 1fr;
          }

          .intro {
            gap: 18px;
            padding: 38px 0 34px;
          }

          h1 {
            font-size: clamp(40px, 13vw, 58px);
            line-height: 1.04;
          }

          .panel {
            padding: 16px;
            min-width: 0;
            overflow-wrap: anywhere;
          }

          pre {
            max-width: 100%;
            white-space: pre-wrap;
            overflow-wrap: anywhere;
            word-break: break-word;
            font-size: 12px;
            padding: 14px;
          }

          .model-card-grid {
            grid-template-columns: 1fr;
          }

          .model-copy {
            max-width: 100%;
          }

          :global(.model-art) {
            display: none;
          }

          nav {
            flex-wrap: wrap;
          }
        }

        @media (max-width: 460px) {
          .docs-page {
            padding: 0 14px 42px;
          }

          .model-card {
            min-height: auto;
            padding: 18px;
          }

          .model-copy {
            min-height: auto;
          }

          .model-id {
            max-width: 100%;
            overflow-wrap: anywhere;
          }
        }
      `}</style>
    </main>
  );
}
