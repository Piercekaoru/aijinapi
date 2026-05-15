"use client";

import Image from "next/image";
import { SiteFooter } from "../components/SiteFooter";
import { SiteHeader } from "../components/SiteHeader";

const freeModelIds = [
  "big-pickle",
  "deepseek-v4-flash-free",
  "minimax-m2.5-free",
  "ring-2.6-1t-free",
  "nemotron-3-super-free",
];

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
    body: "Kilo Code 会从 OpenAchieve 读取模型列表。Free 用户建议先全选 5 个免费模型，然后点击添加模型。",
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

const models = [
  {
    id: "big-pickle",
    title: "Big Pickle",
    description: "免费模型入口，适合验证接入链路和轻量探索。",
    tag: "Free",
    image: "/images/GrHDjXQXYAACVsc.jpg",
    tone: "light",
  },
  {
    id: "deepseek-v4-flash-free",
    title: "DeepSeek V4 Flash Free",
    description: "免费低延迟推理模型，适合高频问答、代码辅助和快速实验。",
    tag: "Free",
    image: "/images/HHZ_hQzbIAEw83V.jpg",
    tone: "dark",
  },
  {
    id: "minimax-m2.5-free",
    title: "MiniMax M2.5 Free",
    description: "免费通用对话模型，适合内容生成、润色和轻量业务助手。",
    tag: "Free",
    image: "/images/HAh3SWLacAAA6By.jpg",
    tone: "light",
  },
  {
    id: "ring-2.6-1t-free",
    title: "Ring 2.6 1T Free",
    description: "免费长上下文入口，适合文档理解、摘要和知识库实验。",
    tag: "Free",
    image: "/images/HG42ZYwa8AAGBEd.jpg",
    tone: "dark",
  },
  {
    id: "nemotron-3-super-free",
    title: "Nemotron 3 Super Free",
    description: "免费试用型模型，适合非敏感内容验证和能力探索。",
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
  return (
    <main className="docs-page">
      <section className="docs-shell">
        <SiteHeader active="docs" variant="public" />

        <section className="intro">
          <div>
            <p>开发文档</p>
            <h1>开发文档</h1>
          </div>
          <span>只需接入统一 OpenAI-compatible 接口；Free/Plus 权限由 OpenAchieve 自动处理。</span>
        </section>

        <div className="docs-grid">
          <section className="panel" id="base-url">
            <p>接口地址</p>
            <h2>Base URL</h2>
            <pre>https://openachieve.asia/v1</pre>
            <span>所有请求发送到此接口即可，无需关注后端架构。</span>
          </section>

          <section className="panel" id="auth">
            <p>认证</p>
            <h2>认证方式</h2>
            <pre>{`Authorization: Bearer openachieve_xxxxxxxxxxxxxxxx`}</pre>
            <span>API Key 在注册或控制台生成，数据库只保存哈希；额度按账号套餐统一计算。</span>
          </section>

          <section className="panel wide" id="chat">
            <p>聊天补全示例</p>
            <h2>聊天补全</h2>
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
        </div>

        <section className="kilo-guide" id="kilo-code">
          <div className="section-head">
            <p>Kilo Code</p>
            <h2>Kilo Code 接入教程</h2>
            <span>
              Kilo Code 支持 OpenAI-compatible 自定义提供商。按下面 5 步配置后，就能在 VS Code 里直接使用 OpenAchieve 模型。
            </span>
          </div>

          <div className="config-strip" aria-label="Kilo Code 配置速查">
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
            <span>Free 用户推荐先导入：</span>
            {freeModelIds.map((id) => (
              <code key={id}>{id}</code>
            ))}
          </div>

          <div className="kilo-steps">
            {kiloSteps.map((step, index) => (
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
            <p>支持模型</p>
            <h2>支持模型</h2>
            <span>Free 可调用 5 个免费模型；Plus 为 $13/月、1500 次/月，并额外开放完整 Plus 模型池。</span>
            <span>免费模型可能用于服务改进或试用目的，请避免提交个人、商业机密或其他敏感信息。</span>
          </div>
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
