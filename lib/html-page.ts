import { readFileSync } from "fs";
import { join } from "path";
import type { Language } from "./i18n-core";
import { pricingTemplateValues, pricingTemplateValuesEn } from "./pricing";
import { siteRoutes } from "./site-routes";

type RouteKind = "landing" | "login" | "models";

export type StaticHtmlPage = {
  title: Record<Language, string>;
  style: string;
  body: Record<Language, string>;
};

const htmlFiles: Record<RouteKind, string> = {
  landing: "openachieve-landing.html",
  login: "openachieve-login.html",
  models: "openachieve-models.html",
};

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

function applyPricingTemplates(html: string, language: Language) {
  const values = language === "en" ? pricingTemplateValuesEn : pricingTemplateValues;
  return Object.entries(values).reduce(
    (next, [token, value]) => next.replaceAll(token, value),
    html,
  );
}

export function getStaticHtmlPage(kind: RouteKind): StaticHtmlPage {
  const raw = readFileSync(join(process.cwd(), htmlFiles[kind]), "utf8");
  const title = raw.match(/<title>(.*?)<\/title>/s)?.[1] ?? "OpenAchieve";
  const style = raw.match(/<style>(.*?)<\/style>/s)?.[1] ?? "";
  const body = raw.match(/<body>(.*?)<\/body>/s)?.[1] ?? "";
  const bodyWithoutScript = body.replace(/<script>[\s\S]*?<\/script>/g, "");
  const bodyWithoutStaticChrome = stripStaticChrome(bodyWithoutScript, kind);

  const preparedBody = rewriteLinks(rewriteAssets(bodyWithoutStaticChrome), kind);
  const zhBody = applyPricingTemplates(preparedBody, "zh");
  const enBody = applyPricingTemplates(translateStaticHtml(kind, preparedBody), "en");

  return {
    title: {
      zh: title,
      en: translateStaticTitle(kind, title),
    },
    style,
    body: {
      zh: zhBody,
      en: enBody,
    },
  };
}

function translateStaticTitle(kind: RouteKind, title: string) {
  if (kind === "landing") return "OpenAchieve - OpenAI-compatible AI API relay";
  if (kind === "login") return "OpenAchieve Log in / Sign up";
  if (kind === "models") return "OpenAchieve Models - Model docs and integration guide";
  return title;
}

function translateStaticHtml(kind: RouteKind, html: string) {
  const replacements: Record<RouteKind, Array<[string, string]>> = {
    landing: [
      ["面向国内开发者的 AI API 中转服务。", "OpenAI-compatible AI API relay for developers."],
      [
        "OpenAchieve 支持人民币直接充值，支付宝/微信即充即用。无需外卡、无需魔法，兼容 OpenAI 请求格式，一行代码把应用切到可用模型池。",
        "OpenAchieve gives you one OpenAI-compatible endpoint for free and Plus model pools, with simple local payment and no foreign-card setup.",
      ],
      ["立即注册获取 Key", "Create an API key"],
      ["查看接入方式", "View integration"],
      ["<b>核心优势：</b>", "<b>Core benefit:</b>"],
      ["享约", "includes about"],
      ["等值 API 调用额度", "of API-call value"],
      ["比官方直购节省近", "saving nearly"],
      ["Plus 超值", "Plus value"],
      ["接口格式", "API format"],
      ["到账状态", "Provisioning"],
      ["Plus {{PLUS_MONTHLY_PRICE}}，享 {{PLUS_VALUE_PLUS}} 等值调用额 — 比直购省近 {{PLUS_SAVINGS_PERCENT}}。", "Plus {{PLUS_MONTHLY_PRICE}} includes about {{PLUS_VALUE_PLUS}} of call value, saving nearly {{PLUS_SAVINGS_PERCENT}} versus buying upstream directly."],
      ["单一接口接入全部模型。Free 每月 500 次试手，Plus 每月 1500 次 — 同等额度官方直购需 $60+。", "Use every model through one endpoint. Free includes 500 requests per month; Plus includes 1,500 requests per month, while comparable upstream usage can cost $60+."],
      ["免费试用", "Free Trial"],
      ["500 次/月 · <span data-live-free-count>实时免费模型池</span>", "500 requests/month · <span data-live-free-count>live free model catalog</span>"],
      ["注册即送 500 次月度请求额度", "500 monthly requests after sign-up"],
      ["兼容 OpenAI Chat Completions", "OpenAI Chat Completions compatible"],
      ["可调用实时同步的免费模型池", "Access to the live free model catalog"],
      ["免费模型请避免提交敏感信息", "Avoid sensitive content on free models"],
      ["Plus 会员", "Plus"],
      ["1500 次/月 · Plus 模型池", "1,500 requests/month · Plus model pool"],
      ["≈ $60 等值额度 · 省 78%", "About $60 of value · save 78%"],
      ["开放 Kimi、GLM、Qwen、DeepSeek、MiMo", "Unlock Kimi, GLM, Qwen, DeepSeek, and MiMo"],
      ["实时到账，余额清晰可查", "Fast activation and clear usage tracking"],
      ["Plus 请求由 OpenAchieve 自动分配模型通道", "OpenAchieve routes Plus requests automatically"],
      ["大客户定制", "Enterprise"],
      ["联系客服", "Contact us"],
      ["更高额度 · 按需定制", "Higher limits · custom terms"],
      ["注册默认 Free，每月 500 次", "Free by default, 500 requests/month"],
      ["大额请求配额，按月灵活配置", "Larger monthly request quota"],
      ["支持支付宝 / 微信支付", "Supports Alipay / WeChat Pay"],
      ["Plus {{PLUS_MONTHLY_PRICE}} vs 官方直购：同样额度能省多少？", "Plus {{PLUS_MONTHLY_PRICE}} vs direct upstream purchase"],
      ["以 DeepSeek V4 Pro 为例，1500 次/月调用在官方渠道约 $60/月 — 在 OpenAchieve 仅 $13。", "For example, 1,500 monthly DeepSeek V4 Pro calls can cost about $60 upstream; OpenAchieve Plus is about $13."],
      ["官方直购", "Direct upstream"],
      ["需要外币信用卡", "Foreign-card payment required"],
      ["各模型单独接入", "Separate integrations per model"],
      ["无统一额度管理", "No unified quota view"],
      ["客服响应慢", "Slower support"],
      ["支付宝 / 微信支付", "Alipay / WeChat Pay"],
      ["单一接口接入 10+ 模型", "One endpoint for 10+ models"],
      ["统一额度面板", "Unified quota dashboard"],
      ["中文客服优先", "Chinese support priority"],
      ["省 78%", "Save 78%"],
      ["主流国产模型，统一接入方式。", "Mainstream models through one integration."],
      ["Free 开放实时同步的免费模型池，并额外赞助开放 DeepSeek V4 Flash；Plus 开放国产主流模型，后端自动分配模型通道。", "Free users can use the live free model catalog plus sponsored DeepSeek V4 Flash. Plus unlocks the full paid model pool with automatic backend routing."],
      ["免费模型池", "Free model catalog"],
      ["当前免费模型池实时更新", "The free catalog updates live"],
      ["长文本、通用对话、应用助手", "long context, chat, app assistants"],
      ["中文任务、工具调用、业务问答", "Chinese tasks, tool use, business Q&A"],
      ["创作、对话和高阶推理场景", "creation, chat, advanced reasoning"],
      ["开发者生态、代码与通用推理", "developer ecosystem, code, reasoning"],
      ["V4 Flash 免费开放 · Pro 属于 Plus 推理模型", "V4 Flash is free · Pro is a Plus reasoning model"],
      ["套餐额度", "Plan quota"],
      ["Free 500 次/月 · Plus 1500 次/月", "Free 500/month · Plus 1,500/month"],
      ["复用 SDK，仅替换 base_url 与 API Key", "Reuse your SDK; replace only base_url and API key"],
      ["三步拿到 Key，把请求切到 OpenAchieve。", "Get a key and switch requests in three steps."],
      ["流程尽量短：注册即获 Free Key；需要更多模型时升级至 Plus。", "The flow stays short: sign up for a Free key, then upgrade to Plus when you need more models."],
      ["注册", "Sign up"],
      ["创建 OpenAchieve 账号，进入控制台准备管理项目 Key。", "Create an OpenAchieve account and manage project keys in the console."],
      ["选择套餐", "Choose a plan"],
      ["Free 可用实时同步的免费模型池；Plus {{PLUS_MONTHLY_PRICE_TEXT}}，开放主流模型池。", "Free includes the live free model catalog; Plus {{PLUS_MONTHLY_PRICE_TEXT}} unlocks the mainstream model pool."],
      ["获取 Key", "Get a key"],
      ["复制 API Key，替换 base_url 后继续使用原有 OpenAI 格式代码。", "Copy your API key, replace base_url, and keep using OpenAI-style code."],
      ["生成一个接入说明", "Generate an integration note"],
      ["服务状态", "Service status"],
      ["开发文档", "Docs"],
      ["联系我们", "Contact"],
    ],
    login: [
      ["OpenAchieve 产品介绍", "OpenAchieve product introduction"],
      ["OpenAchieve 首页", "OpenAchieve home"],
      ["登录你的模型控制台。", "Log in to your model console."],
      ["无需外卡、无需魔法。人民币充值后，用 OpenAI-compatible 接口接入 Kimi、GLM、Qwen、DeepSeek 等模型。", "Use one OpenAI-compatible API for Kimi, GLM, Qwen, DeepSeek, and more without foreign-card setup."],
      ["支付宝 / 微信充值", "Alipay / WeChat Pay"],
      ["余额实时到账，适合国内开发者日常调试。", "Fast activation for everyday developer workflows."],
      ["一行 base_url 切换", "Switch with one base_url"],
      ["保留现有 OpenAI SDK 调用方式。", "Keep your existing OpenAI SDK calls."],
      ["统一模型广场", "Unified model catalog"],
      ["按场景选择通用、推理、长文本与低延迟模型。", "Choose chat, reasoning, long-context, and low-latency models by scenario."],
      ["登录注册表单", "Login and sign-up form"],
      ["欢迎回来", "Welcome back"],
      ["登录后管理余额、API Key、调用记录和文档。", "Log in to manage quota, API keys, usage history, and docs."],
      ["登录注册切换", "Login and sign-up switcher"],
      [">登录<", ">Log in<"],
      [">注册<", ">Sign up<"],
      ["邮箱", "Email"],
      ["密码", "Password"],
      ["输入密码", "Enter password"],
      ["显示密码", "Show password"],
      ["隐藏密码", "Hide password"],
      ["记住我", "Remember me"],
      ["忘记密码？", "Forgot password?"],
      ["重新发送验证邮件", "Resend verification email"],
      ["输入注册邮箱，我们会发送一封密码重置邮件。", "Enter your email and we will send a password reset link."],
      ["发送重置邮件", "Send reset email"],
      ["返回登录", "Back to login"],
      ["请设置新的登录密码。提交成功后，需要使用新密码重新登录。", "Set a new password. After updating, log in again with the new password."],
      ["新密码", "New password"],
      ["至少 8 位，建议含数字和字母", "At least 8 characters; letters and numbers recommended"],
      ["确认新密码", "Confirm new password"],
      ["再次输入密码", "Enter password again"],
      ["更新密码", "Update password"],
      ["用户名", "Name"],
      ["例如：openachieve_dev", "e.g. openachieve_dev"],
      ["确认密码", "Confirm password"],
      ["我已阅读并同意", "I have read and agree to the "],
      ["服务条款", "Terms of Service"],
      ["验证邮箱后启用 Free 套餐，每月 500 次请求额度，可调用实时同步的免费模型池和 DeepSeek V4 Flash。", "Verify your email to activate the Free plan: 500 monthly requests, the live free model catalog, and DeepSeek V4 Flash."],
      ["已提交", "Submitted"],
    ],
    models: [
      ["在一个广场里挑模型，在一套 API 里调用。", "Choose models in one catalog and call them through one API."],
      ["OpenAchieve 将实时同步的免费模型池与 Kimi、GLM、MiMo、Qwen、DeepSeek 等 Plus 模型收束到 OpenAI-compatible 接口。Free 可用免费模型池，Plus 模型统一自动分配通道。", "OpenAchieve brings the live free model catalog and Plus models like Kimi, GLM, MiMo, Qwen, and DeepSeek into one OpenAI-compatible endpoint."],
      ["浏览模型", "Browse models"],
      ["查看 base_url", "View base_url"],
      ["模型广场摘要", "Model catalog summary"],
      ["模型家族覆盖", "model families"],
      ["当前可用模型", "available models"],
      ["兼容 OpenAI 调用格式", "OpenAI-compatible"],
      ["统一入口", "Unified endpoint"],
      ["先从这四个模型开始试。", "Start with these four models."],
      ["推荐榜单按订阅权限和常见开发场景组织：Free 先试免费模型，Plus 再打开完整模型池。", "Recommendations are organized by plan and common development scenarios."],
      ["通用开发默认推荐，适合中文业务问答、工具调用与代码辅助。", "Default general-purpose choice for business Q&A, tool use, and coding help."],
      ["通用首选", "General pick"],
      ["偏推理和复杂任务，适合规划、分析和需要更稳回答的业务流程。", "For reasoning-heavy and complex workflows that need steadier answers."],
      ["推理增强", "Reasoning"],
      ["适合长文本阅读、摘要、知识库问答和多轮上下文场景。", "For long-context reading, summarization, knowledge-base Q&A, and multi-turn context."],
      ["长文本", "Long context"],
      ["实时免费模型池", "Live free catalog"],
      ["当前免费模型池实时更新，适合先验证接入链路和轻量实验。", "The live free catalog is ideal for integration checks and light experiments."],
      ["模型卡片带上调用名、套餐权限和套餐范围。", "Model cards include IDs, plan access, and usage scope."],
      ["Free 每月 {{FREE_MONTHLY_REQUESTS}} 次，可调用 <span data-live-free-count>实时免费模型池</span>，包含赞助开放的 DeepSeek V4 Flash；Plus {{PLUS_MONTHLY_PRICE_TEXT}}、{{PLUS_MONTHLY_REQUESTS}} 次，并额外开放完整 Plus 模型池。免费模型可能用于改进或试用目的，请避免提交敏感信息。", "Free includes {{FREE_MONTHLY_REQUESTS}} monthly requests and the <span data-live-free-count>live free model catalog</span>, including sponsored DeepSeek V4 Flash. Plus is {{PLUS_MONTHLY_PRICE_TEXT}} with {{PLUS_MONTHLY_REQUESTS}} requests and the full Plus model pool. Avoid sensitive data on free models."],
      ["模型分类筛选", "Model filters"],
      ["全部", "All"],
      ["通用对话", "Chat"],
      ["推理", "Reasoning"],
      ["低延迟", "Low latency"],
      ["创作", "Creative"],
      ["适合长上下文阅读、知识库摘要、文档问答和稳定中文理解的应用。", "For long-context reading, knowledge-base summaries, document Q&A, and stable Chinese understanding."],
      ["偏稳定调用与常规中文多轮对话，适合已有 Kimi 链路迁移。", "Stable calls and Chinese multi-turn chat, useful when migrating existing Kimi flows."],
      ["中文业务问答、知识检索、工具调用和企业级 Agent 流程。", "Business Q&A, retrieval, tool use, and enterprise agent workflows."],
      ["通用中文对话模型，适合客服、内容整理和常规业务助手。", "General Chinese chat for support, content organization, and business assistants."],
      ["Free 用户可用模型，适合轻量实验、验证接入和探索型生成场景。", "Free model for light experiments, integration checks, and exploratory generation."],
      ["免费低延迟推理模型，适合高频问答、代码辅助和快速实验。", "Free low-latency reasoning model for frequent Q&A, coding help, and quick experiments."],
      ["免费通用对话模型，适合内容生成、润色和轻量业务助手。", "Free general chat model for content generation, polishing, and lightweight assistants."],
      ["免费长上下文入口，适合文档理解、摘要和知识库实验。", "Free long-context entry point for document understanding, summaries, and knowledge-base experiments."],
      ["免费试用型模型，适合非敏感内容验证和能力探索。", "Free trial model for non-sensitive validation and capability exploration."],
      ["适合更复杂的创作、推理和多步骤任务，偏高质量输出。", "For more complex creation, reasoning, and multi-step tasks with higher-quality output."],
      ["轻量助手、文本润色和不需要最高推理强度的创作流程。", "For lightweight assistants, text polishing, and creative workflows that do not need maximum reasoning."],
      ["默认通用模型，覆盖问答、代码、工具调用和业务流程原型。", "Default general model for Q&A, code, tool use, and business prototypes."],
      ["成本敏感的通用任务、代码辅助和中文应用开发。", "Cost-sensitive general tasks, coding help, and Chinese app development."],
      ["复杂分析、代码审阅、规划和需要更强推理链路的产品能力。", "Complex analysis, code review, planning, and stronger reasoning workflows."],
      ["付费 Go 通道赞助开放，适合低延迟问答、代码辅助和高频产品调用。", "Sponsored through the paid Go route; suitable for low-latency Q&A, coding help, and frequent product calls."],
      ["换掉 base_url，继续用熟悉的 SDK。", "Replace base_url and keep your familiar SDK."],
      ["鉴权方式保持 Bearer API Key。客户只调用统一 Base URL；Free/Plus 权限由后端自动处理。", "Authentication remains Bearer API Key. Clients call one Base URL; Free/Plus permissions are handled by the backend."],
      ["接入参数", "Integration parameters"],
      ["适合从 OpenAI SDK、兼容网关或自研调用层迁移。", "Useful when migrating from OpenAI SDKs, compatible gateways, or custom client layers."],
      ["代码示例", "Code examples"],
      ["接入前最常见的几个问题。", "Common questions before integration."],
      ["这里保留产品承诺级别的信息，不写未确认的 SLA、折扣或性能数字。", "This section keeps product-level commitments and avoids unverified SLA or performance claims."],
      ["是否需要外卡或海外支付？", "Do I need a foreign card or overseas payment?"],
      ["不需要。OpenAchieve 面向国内开发者，支持支付宝/微信以人民币充值，到账后即可调用。", "No. OpenAchieve currently focuses on local payment via Alipay and WeChat Pay."],
      ["是否兼容 OpenAI SDK？", "Is it compatible with OpenAI SDKs?"],
      ["兼容 OpenAI 风格的请求格式。通常只需要替换 base_url、API Key 和模型名。", "Yes. Usually you only replace base_url, API key, and model name."],
      ["Plus 价格和额度是什么？", "What are the Plus price and quota?"],
      ["Plus 为 {{PLUS_MONTHLY_PRICE_TEXT}}，包含 {{PLUS_MONTHLY_REQUESTS}} 次/月请求额度；Free 是 {{FREE_MONTHLY_REQUESTS}} 次/月，可调用实时同步的免费模型池。", "Plus is {{PLUS_MONTHLY_PRICE_TEXT}} with {{PLUS_MONTHLY_REQUESTS}} requests/month. Free includes {{FREE_MONTHLY_REQUESTS}} requests/month and the live free model catalog."],
      ["可以在同一个项目里切换模型吗？", "Can I switch models in one project?"],
      ["可以。把模型名作为请求参数传入，就能在同一套接口下切换 Kimi、GLM、Qwen、DeepSeek 等模型。", "Yes. Pass the model ID in the request to switch among Kimi, GLM, Qwen, DeepSeek, and more through the same endpoint."],
      ["模型广场与接入文档", "Model catalog and integration docs"],
      ["返回顶部", "Back to top"],
      ["用三句话解释 OpenAchieve 的接入方式", "Explain OpenAchieve integration in three sentences"],
      ["生成一个模型选型建议", "Generate a model selection suggestion"],
      ["总结这份文档的重点", "Summarize the key points of this document"],
    ],
  };

  return replacements[kind].reduce((next, [from, to]) => next.replaceAll(from, to), html);
}
