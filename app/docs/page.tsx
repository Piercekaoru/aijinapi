"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { loadPublicFreeModels, modelDisplayName } from "@/lib/free-models";
import { useI18n } from "@/lib/i18n";
import type { Language } from "@/lib/i18n-core";
import { isMessagesOnlyModel } from "@/lib/model-access";
import { plusMonthlyPriceLabel, plusMonthlyPriceLabelEn } from "@/lib/pricing";
import { SiteFooter } from "../components/SiteFooter";
import { SiteHeader } from "../components/SiteHeader";

const kiloSteps = [
  {
    kicker: "Step 1",
    title: "安装 Kilo Code",
    body: "在 VS Code 的 Extensions 面板搜索 Kilo Code，安装官方扩展。安装完成后，打开 Kilo Settings。",
    image: "/images/docs/kilo-code-install.png",
    alt: "VS Code Extensions 中的 Kilo Code 扩展详情页",
  },
  {
    kicker: "Step 2",
    title: "点击自定义提供商",
    body: "进入 Kilo Code Settings 的 Providers 页面，在热门提供商里找到自定义提供商，点击右侧的连接按钮。",
    image: "/images/docs/kilo-code-custom-provider.png",
    alt: "Kilo Code Providers 页面中的自定义提供商入口",
  },
  {
    kicker: "Step 3",
    title: "填写 OpenAchieve 配置",
    body: "Provider ID 和显示名称都填 openachieve，Base URL 填 https://openachieve.asia/v1，API 密钥填写你在 OpenAchieve 控制台生成的 API Key。",
    image: "/images/docs/kilo-code-provider-form.png",
    alt: "Kilo Code 自定义提供商配置弹窗",
  },
  {
    kicker: "Step 4",
    title: "导入 Free 模型",
    body: "Kilo Code 会从 OpenAchieve 读取模型列表。Free 用户建议先导入当前实时可用的免费模型，然后点击添加模型。",
    image: "/images/docs/kilo-code-import-models.png",
    alt: "Kilo Code 导入 OpenAchieve 模型列表",
  },
  {
    kicker: "Step 5",
    title: "选择模型开始使用",
    body: "确认模型已写入后，在 Kilo Code 右下角模型选择器里选择 openachieve / big-pickle 或其他可用模型即可开始对话。",
    image: "/images/docs/kilo-code-model-list.png",
    alt: "Kilo Code 已连接 OpenAchieve 并选择模型",
  },
];

const kiloStepsEn = [
  {
    kicker: "Step 1",
    title: "Install Kilo Code",
    body: "Search for Kilo Code in the VS Code Extensions panel and install the official extension. Open Kilo Settings after installation.",
    image: "/images/docs/kilo-code-install.png",
    alt: "Kilo Code extension details in VS Code Extensions",
  },
  {
    kicker: "Step 2",
    title: "Choose Custom Provider",
    body: "Open the Providers page in Kilo Code Settings, find the custom provider entry in popular providers, and click Connect.",
    image: "/images/docs/kilo-code-custom-provider.png",
    alt: "Custom provider entry in Kilo Code Providers",
  },
  {
    kicker: "Step 3",
    title: "Fill in OpenAchieve",
    body: "Set Provider ID and display name to openachieve, Base URL to https://openachieve.asia/v1, and API key to the key you generated in OpenAchieve.",
    image: "/images/docs/kilo-code-provider-form.png",
    alt: "Kilo Code custom provider form",
  },
  {
    kicker: "Step 4",
    title: "Import Free Models",
    body: "Kilo Code reads the model list from OpenAchieve. Free users should import the currently available free models first, then add them.",
    image: "/images/docs/kilo-code-import-models.png",
    alt: "Kilo Code importing OpenAchieve models",
  },
  {
    kicker: "Step 5",
    title: "Pick a Model and Start",
    body: "After the models are saved, choose openachieve / big-pickle or another available model from the Kilo Code model picker.",
    image: "/images/docs/kilo-code-model-list.png",
    alt: "Kilo Code connected to OpenAchieve and selecting a model",
  },
];

const models = [
  {
    id: "big-pickle",
    title: "Big Pickle",
    description: "Free model entry point for integration checks and light exploration.",
    tag: "Free",
    image: "/images/GrHDjXQXYAACVsc.jpg",
    tone: "light",
  },
  {
    id: "deepseek-v4-flash-free",
    title: "DeepSeek V4 Flash Free",
    description: "Free low-latency reasoning model for frequent Q&A, coding help, and quick experiments.",
    tag: "Free",
    image: "/images/HHZ_hQzbIAEw83V.jpg",
    tone: "dark",
  },
  {
    id: "minimax-m2.5-free",
    title: "MiniMax M2.5 Free",
    description: "Free general chat model for content generation, polishing, and lightweight assistants.",
    tag: "Free",
    image: "/images/HAh3SWLacAAA6By.jpg",
    tone: "light",
  },
  {
    id: "ring-2.6-1t-free",
    title: "Ring 2.6 1T Free",
    description: "Free long-context entry point for document understanding, summaries, and knowledge-base experiments.",
    tag: "Free",
    image: "/images/HG42ZYwa8AAGBEd.jpg",
    tone: "dark",
  },
  {
    id: "nemotron-3-super-free",
    title: "Nemotron 3 Super Free",
    description: "Free trial model for non-sensitive validation and capability exploration.",
    tag: "Free",
    image: "/images/GtH_mkRawAA2bJU.jpg",
    tone: "light",
  },
  {
    id: "glm-5.1",
    title: "GLM-5.1",
    description: "General entry point for Chinese business Q&A, tool use, and stable production workflows.",
    tag: "Plus",
    image: "/images/Gth0fxcawAARQmB.jpg",
    tone: "light",
  },
  {
    id: "glm-5",
    title: "GLM-5",
    description: "Cost-effective choice for knowledge bases, support assistants, and long-text understanding.",
    tag: "Plus",
    image: "/images/GpXqspCbYAI1hx_.jpg",
    tone: "light",
  },
  {
    id: "kimi-k2.5",
    title: "Kimi K2.5",
    description: "Model capability for long context, document summaries, and multi-turn conversations.",
    tag: "Plus",
    image: "/images/GsIHaDsaUAYwOmB.jpg",
    tone: "dark",
  },
  {
    id: "kimi-k2.6",
    title: "Kimi K2.6",
    description: "Stronger text processing and app-assistant capability for complex content workflows.",
    tag: "Plus",
    image: "/images/Gt96vaQXQAIxNcp.jpg",
    tone: "light",
  },
  {
    id: "deepseek-v4-pro",
    title: "DeepSeek V4 Pro",
    description: "Sponsored through the paid Go route and available to both Free and Plus users.",
    tag: "Free",
    image: "/images/GxpsuzYawAQQ2lR.jpg",
    tone: "light",
  },
  {
    id: "deepseek-v4-flash",
    title: "DeepSeek V4 Flash",
    description: "Sponsored through the paid Go route and available to both Free and Plus users.",
    tag: "Free",
    image: "/images/GS8OLQObIAcG_0D.jpg",
    tone: "dark",
  },
  {
    id: "minimax-m3",
    title: "MiniMax M3",
    description: "Free through /v1/messages and excluded from monthly quota accounting.",
    tag: "Free",
    image: "/images/GS8OLQObIAcG_0D.jpg",
    tone: "dark",
  },
  {
    id: "mimo-v2.5",
    title: "MiMo V2.5",
    description: "Balanced model for creation, chat, and lightweight reasoning.",
    tag: "Plus",
    image: "/images/GkYCpj6awAAZSl0.jpg",
    tone: "light",
  },
  {
    id: "mimo-v2.5-pro",
    title: "MiMo V2.5 Pro",
    description: "Stronger generation quality and complex-task handling for production content apps.",
    tag: "Plus",
    image: "/images/GswYqEeaIAA1-SM.jpg",
    tone: "light",
  },
  {
    id: "qwen3.6-plus",
    title: "Qwen3.6 Plus",
    description: "Developer-friendly model for code, tool use, and general agents.",
    tag: "Plus",
    image: "/images/GwvxlZqbIAAqlQB.jpg",
    tone: "light",
  },
  {
    id: "qwen3.5-plus",
    title: "Qwen3.5 Plus",
    description: "Stable general capability for default app usage and everyday requests.",
    tag: "Plus",
    image: "/images/GZCDeteaYAA-phJ.jpg",
    tone: "light",
  },
];

const freeModelMetadata: Record<
  string,
  {
    description: string;
    image: string;
    tone: string;
  }
> = {
  "big-pickle": {
    description: "Free model entry point for integration checks and light exploration.",
    image: "/images/GrHDjXQXYAACVsc.jpg",
    tone: "light",
  },
  "deepseek-v4-flash-free": {
    description: "Free low-latency reasoning model for frequent Q&A, coding help, and quick experiments.",
    image: "/images/HHZ_hQzbIAEw83V.jpg",
    tone: "dark",
  },
  "deepseek-v4-flash": {
    description: "Sponsored through the paid Go route and available to both Free and Plus users.",
    image: "/images/GS8OLQObIAcG_0D.jpg",
    tone: "dark",
  },
  "deepseek-v4-pro": {
    description: "Sponsored through the paid Go route and available to both Free and Plus users.",
    image: "/images/GxpsuzYawAQQ2lR.jpg",
    tone: "light",
  },
  "minimax-m3": {
    description: "额外免费开放模型，需走 /v1/messages，且不计入月度额度。",
    image: "/images/GS8OLQObIAcG_0D.jpg",
    tone: "dark",
  },
  "minimax-m2.5-free": {
    description: "Free general chat model for content generation, polishing, and lightweight assistants.",
    image: "/images/HAh3SWLacAAA6By.jpg",
    tone: "light",
  },
  "ring-2.6-1t-free": {
    description: "Free long-context entry point for document understanding, summaries, and knowledge-base experiments.",
    image: "/images/HG42ZYwa8AAGBEd.jpg",
    tone: "dark",
  },
  "nemotron-3-super-free": {
    description: "Free trial model for non-sensitive validation and capability exploration.",
    image: "/images/GtH_mkRawAA2bJU.jpg",
    tone: "light",
  },
};

const descriptionEn: Record<string, string> = {
  "big-pickle": "Free model entry point for integration checks and light exploration.",
  "deepseek-v4-flash-free": "Free low-latency reasoning model for frequent Q&A, coding help, and quick experiments.",
  "minimax-m2.5-free": "Free general chat model for content generation, polishing, and lightweight assistants.",
  "ring-2.6-1t-free": "Free long-context entry point for document understanding, summaries, and knowledge-base experiments.",
  "nemotron-3-super-free": "Free trial model for non-sensitive validation and capability exploration.",
  "glm-5.1": "General entry point for Chinese business Q&A, tool use, and stable production workflows.",
  "glm-5": "Cost-effective choice for knowledge bases, support assistants, and long-text understanding.",
  "kimi-k2.5": "Model capability for long context, document summaries, and multi-turn conversations.",
  "kimi-k2.6": "Stronger text processing and app-assistant capability for complex content workflows.",
  "deepseek-v4-pro": "Sponsored through the paid Go route and available to both Free and Plus users.",
  "deepseek-v4-flash": "Sponsored through the paid Go route and available to both Free and Plus users.",
  "minimax-m3": "Additional free model available through /v1/messages and excluded from monthly quota accounting.",
  "mimo-v2.5": "Balanced model for creation, chat, and lightweight reasoning.",
  "mimo-v2.5-pro": "Stronger generation quality and complex-task handling for production content apps.",
  "qwen3.6-plus": "Developer-friendly model for code, tool use, and general agents.",
  "qwen3.5-plus": "Stable general capability for default app usage and everyday requests.",
};

const docsCopy: Record<Language, Record<string, string>> = {
  zh: {
    introLabel: "开发文档",
    introTitle: "开发文档",
    introBody: "大多数模型继续走 OpenAI-compatible 接口；MiniMax M3 通过 Anthropic-compatible /v1/messages 接入，Free/Plus 权限由 OpenAchieve 自动处理。",
    baseLabel: "接口地址",
    baseBody: "聊天补全继续使用这个 base URL；MiniMax M3 仍使用同一域名，但需请求 /v1/messages。",
    authLabel: "认证",
    authTitle: "认证方式",
    authBody: "API Key 在注册或控制台生成，数据库只保存哈希；额度按账号套餐统一计算。",
    chatLabel: "聊天补全示例",
    chatTitle: "聊天补全",
    samplePrompt: "介绍一下 OpenAchieve",
    messagesLabel: "MiniMax M3 示例",
    messagesTitle: "Anthropic Messages",
    messagesPrompt: "用三句话介绍 MiniMax M3 在 OpenAchieve 的调用方式",
    messagesBody: "MiniMax M3 需调用 /v1/messages，使用 Anthropic Messages 格式；该模型免费开放，且不计入月度额度。",
    kiloTitle: "Kilo Code 接入教程",
    kiloBody: "Kilo Code 支持 OpenAI-compatible 自定义提供商。按下面 5 步配置后，就能在 VS Code 里直接使用 OpenAchieve 模型。",
    configQuick: "Kilo Code 配置速查",
    freeImport: "Free 用户推荐先导入：",
    freeUnavailable: "当前免费模型池暂不可用",
    freeSyncing: "正在同步免费模型池",
    modelsLabel: "支持模型",
    modelsTitle: "支持模型",
    modelsBody: `Free 可调用实时同步的免费模型池，以及赞助开放的 DeepSeek V4 Flash、DeepSeek V4 Pro；MiniMax M3 通过 /v1/messages 免费开放且不计入月度额度。Plus 为 ${plusMonthlyPriceLabel}、1500 次/月，并额外开放完整 Plus 模型池。`,
    privacy: "免费模型可能用于服务改进或试用目的，请避免提交个人、商业机密或其他敏感信息。",
    liveFreeDescription: "当前实时同步的免费模型，适合接入验证和轻量实验。",
  },
  en: {
    introLabel: "Docs",
    introTitle: "Developer Docs",
    introBody: "Most models use the OpenAI-compatible API, while MiniMax M3 is exposed through Anthropic-compatible /v1/messages. OpenAchieve handles Free/Plus permissions automatically.",
    baseLabel: "Endpoint",
    baseBody: "Use this base URL for chat completions. MiniMax M3 stays on the same domain but requires /v1/messages.",
    authLabel: "Auth",
    authTitle: "Authentication",
    authBody: "API keys are created during sign-up or in the console. Only hashes are stored, and quota is calculated at account-plan level.",
    chatLabel: "Chat completion example",
    chatTitle: "Chat Completions",
    samplePrompt: "Introduce OpenAchieve",
    messagesLabel: "MiniMax M3 example",
    messagesTitle: "Anthropic Messages",
    messagesPrompt: "Explain how to call MiniMax M3 on OpenAchieve in three sentences",
    messagesBody: "MiniMax M3 must be sent to /v1/messages using the Anthropic Messages shape. It is free to use and does not count against monthly quota.",
    kiloTitle: "Kilo Code Setup",
    kiloBody: "Kilo Code supports OpenAI-compatible custom providers. Configure the five steps below to use OpenAchieve models directly in VS Code.",
    configQuick: "Kilo Code quick config",
    freeImport: "Free users should import first:",
    freeUnavailable: "The free model catalog is temporarily unavailable",
    freeSyncing: "Syncing the free model catalog",
    modelsLabel: "Supported Models",
    modelsTitle: "Supported Models",
    modelsBody: `Free users can call the live free model catalog plus sponsored DeepSeek V4 Flash and DeepSeek V4 Pro. MiniMax M3 is additionally available through /v1/messages for free and does not count against monthly quota. Plus is ${plusMonthlyPriceLabelEn} with 1,500 requests/month and the full Plus model pool.`,
    privacy: "Free models may be used for service improvement or trial purposes. Avoid personal, business-confidential, or sensitive content.",
    liveFreeDescription: "A live free model for integration checks and light experiments.",
  },
};

function docsT(language: Language, key: string) {
  return docsCopy[language][key] ?? key;
}

export default function DocsPage() {
  const { language } = useI18n();
  const [freeModelIds, setFreeModelIds] = useState<string[]>([]);
  const [freeCatalogLoaded, setFreeCatalogLoaded] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    loadPublicFreeModels(controller.signal)
      .then((catalog) => {
        setFreeModelIds(catalog.fail_closed ? [] : catalog.data.map((model) => model.id));
      })
      .catch(() => setFreeModelIds([]))
      .finally(() => setFreeCatalogLoaded(true));

    return () => controller.abort();
  }, []);

  const renderedModels = useMemo(() => {
    const liveFreeModels = freeModelIds.map((id, index) => {
      const metadata = freeModelMetadata[id] ?? {
        description: docsT(language, "liveFreeDescription"),
        image: "/images/GrHDjXQXYAACVsc.jpg",
        tone: index % 2 === 0 ? "light" : "dark",
      };

      return {
        id,
        title: modelDisplayName(id),
        description: language === "en" ? descriptionEn[id] ?? docsT(language, "liveFreeDescription") : metadata.description,
        tag: "Free",
        image: metadata.image,
        tone: metadata.tone,
      };
    });
    const plusModels = models
      .filter((model) => model.tag === "Plus")
      .map((model) => ({
        ...model,
        description: language === "en" ? descriptionEn[model.id] ?? model.description : model.description,
      }));

    return [...liveFreeModels, ...plusModels];
  }, [freeModelIds, language]);

  const kiloImportModelIds = useMemo(
    () => freeModelIds.filter((id) => !isMessagesOnlyModel(id)),
    [freeModelIds],
  );

  const activeKiloSteps = language === "en" ? kiloStepsEn : kiloSteps;
  const t = (key: string) =>
    docsT(language, key).replace(plusMonthlyPriceLabel, language === "en" ? plusMonthlyPriceLabelEn : plusMonthlyPriceLabel);

  return (
    <main className="docs-page">
      <section className="docs-shell">
        <SiteHeader active="docs" variant="public" />

        <section className="intro">
          <div>
            <p>{t("introLabel")}</p>
            <h1>{t("introTitle")}</h1>
          </div>
          <span>{t("introBody")}</span>
        </section>

        <div className="docs-grid">
          <section className="panel" id="base-url">
            <p>{t("baseLabel")}</p>
            <h2>Base URL</h2>
            <pre>https://openachieve.asia/v1</pre>
            <span>{t("baseBody")}</span>
          </section>

          <section className="panel" id="auth">
            <p>{t("authLabel")}</p>
            <h2>{t("authTitle")}</h2>
            <pre>{`Authorization: Bearer openachieve_xxxxxxxxxxxxxxxx`}</pre>
            <span>{t("authBody")}</span>
          </section>

          <section className="panel wide" id="chat">
            <p>{t("chatLabel")}</p>
            <h2>{t("chatTitle")}</h2>
            <pre>{`curl https://openachieve.asia/v1/chat/completions \\
  -H "Authorization: Bearer openachieve_xxxxxxxxxxxxxxxx" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "qwen3.6-plus",
    "messages": [
      { "role": "user", "content": "${t("samplePrompt")}" }
    ]
  }'`}</pre>
          </section>

          <section className="panel wide" id="messages">
            <p>{t("messagesLabel")}</p>
            <h2>{t("messagesTitle")}</h2>
            <pre>{`curl https://openachieve.asia/v1/messages \\
  -H "Authorization: Bearer openachieve_xxxxxxxxxxxxxxxx" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "minimax-m3",
    "max_tokens": 512,
    "messages": [
      {
        "role": "user",
        "content": [
          { "type": "text", "text": "${t("messagesPrompt")}" }
        ]
      }
    ]
  }'`}</pre>
            <span>{t("messagesBody")}</span>
          </section>
        </div>

        <section className="kilo-guide" id="kilo-code">
          <div className="section-head">
            <p>Kilo Code</p>
            <h2>{t("kiloTitle")}</h2>
            <span>{t("kiloBody")}</span>
          </div>

          <div className="config-strip" aria-label={t("configQuick")}>
            <div>
              <span>Provider ID</span>
              <code>openachieve</code>
            </div>
            <div>
              <span>Base URL</span>
              <code>https://openachieve.asia/v1</code>
            </div>
            <div>
              <span>API Key</span>
              <code>openachieve_xxx</code>
            </div>
          </div>

          <div className="free-model-strip">
            <span>{t("freeImport")}</span>
            {kiloImportModelIds.length > 0 ? (
              kiloImportModelIds.map((id) => <code key={id}>{id}</code>)
            ) : (
              <code>{freeCatalogLoaded ? t("freeUnavailable") : t("freeSyncing")}</code>
            )}
          </div>

          <div className="kilo-steps">
            {activeKiloSteps.map((step, index) => (
              <article className="kilo-step" key={step.title}>
                <div className="step-copy">
                  <p>{step.kicker}</p>
                  <h3>{step.title}</h3>
                  <span>{step.body}</span>
                </div>
                <figure>
                  <Image
                    src={step.image}
                    alt={step.alt}
                    width={1400}
                    height={834}
                    priority={index === 0}
                  />
                </figure>
              </article>
            ))}
          </div>
        </section>

        <section className="model-section" id="models">
          <div className="section-head">
            <p>{t("modelsLabel")}</p>
            <h2>{t("modelsTitle")}</h2>
            <span>{t("modelsBody")}</span>
            <span>{t("privacy")}</span>
          </div>
          <div className="model-card-grid">
            {renderedModels.map((model) => (
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
          width: min(1360px, 100%);
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
        .panel p,
        .section-head p,
        .step-copy p {
          margin: 0 0 8px;
          color: #c96442;
          font-size: 12px;
          font-weight: 800;
          letter-spacing: 0.12px;
          text-transform: uppercase;
        }

        h1,
        h2,
        h3 {
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
          font-size: 26px;
        }

        h3 {
          font-size: 22px;
        }

        .intro span,
        .panel span,
        .section-head span,
        .step-copy span {
          display: block;
          color: #5e5d59;
          line-height: 1.72;
        }

        .docs-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 18px;
        }

        .panel {
          min-width: 0;
          border: 1px solid #d8d5ca;
          border-radius: 8px;
          padding: 24px;
          background: rgba(250, 249, 245, 0.78);
          box-shadow: 0 18px 50px rgba(20, 20, 19, 0.07);
        }

        .panel.wide {
          grid-column: 1 / -1;
        }

        pre,
        code {
          font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
          letter-spacing: 0;
        }

        pre {
          max-width: 100%;
          margin: 18px 0 0;
          overflow-x: auto;
          border-radius: 8px;
          padding: 18px;
          color: #f5f4ed;
          background: #141413;
          font-size: 13px;
          line-height: 1.7;
          white-space: pre;
        }

        .kilo-guide,
        .model-section {
          margin-top: 24px;
          border-top: 1px solid #dfdacf;
          padding-top: 36px;
        }

        .section-head {
          display: grid;
          gap: 8px;
          max-width: 760px;
          margin-bottom: 22px;
        }

        .config-strip,
        .free-model-strip {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          align-items: center;
          margin-bottom: 14px;
        }

        .config-strip div,
        .free-model-strip code {
          border: 1px solid #d8d5ca;
          border-radius: 8px;
          background: rgba(250, 249, 245, 0.82);
        }

        .config-strip div {
          display: grid;
          gap: 6px;
          min-width: min(100%, 240px);
          padding: 13px 14px;
        }

        .config-strip span,
        .free-model-strip span {
          color: #6a6861;
          font-size: 12px;
          font-weight: 800;
        }

        .config-strip code,
        .free-model-strip code {
          color: #141413;
          font-size: 13px;
          overflow-wrap: anywhere;
        }

        .free-model-strip code {
          padding: 8px 10px;
        }

        .kilo-steps {
          display: grid;
          gap: 18px;
          margin-top: 22px;
        }

        .kilo-step {
          display: grid;
          grid-template-columns: minmax(220px, 0.36fr) minmax(0, 0.64fr);
          gap: 18px;
          align-items: center;
          border: 1px solid #d8d5ca;
          border-radius: 8px;
          padding: 18px;
          background: rgba(250, 249, 245, 0.74);
          box-shadow: 0 18px 50px rgba(20, 20, 19, 0.06);
        }

        .step-copy {
          display: grid;
          gap: 10px;
        }

        figure {
          min-width: 0;
          margin: 0;
          overflow: hidden;
          border: 1px solid rgba(20, 20, 19, 0.12);
          border-radius: 8px;
          background: #141413;
        }

        figure :global(img) {
          display: block;
          width: 100%;
          height: auto;
        }

        .model-card-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 18px;
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
          font-size: 22px;
        }

        .model-card h3 {
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

          .kilo-step {
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
