"use client";

import { useI18n } from "@/lib/i18n";
import { plusMonthlyPriceLabel, plusMonthlyPriceLabelEn } from "@/lib/pricing";
import { SiteFooter } from "../components/SiteFooter";
import { SiteHeader } from "../components/SiteHeader";

function TermsBodyZh() {
  return (
    <article className="terms-body">
      <section>
        <h2>1. 服务说明</h2>
        <p>OpenAchieve（以下简称&ldquo;本服务&rdquo;）是一个面向开发者的 AI API 中转平台，提供 OpenAI-compatible 接口，将请求转发至上游模型提供商。本服务提供 Free 和 Plus 两种套餐，用户可根据需求选择合适的方案。</p>
      </section>
      <section>
        <h2>2. 账户注册与安全</h2>
        <p>使用本服务前，您需要注册一个账户。注册时您必须提供真实、准确的邮箱地址，并妥善保管您的密码和 API Key。</p>
        <p>API Key 仅在创建时显示一次，请务必在创建后立即保存。OpenAchieve 不会以任何方式存储您的 API Key 明文。因 API Key 泄露或丢失造成的损失由用户自行承担。</p>
        <p>您不得将账户转借、转让或出售给他人使用。</p>
      </section>
      <section>
        <h2>3. 可接受使用</h2>
        <p>您不得将本服务用于以下用途：</p>
        <ul>
          <li>生成或传播违法、有害、欺诈、诽谤、骚扰或仇恨内容</li>
          <li>侵犯他人知识产权、隐私权或其他合法权益</li>
          <li>绕过本服务的配额限制或滥用接口进行恶意请求</li>
          <li>将本服务用于武器开发、军事用途或任何违反适用法律的活动</li>
        </ul>
        <p>OpenAchieve 保留在发现违规行为时立即暂停或终止账户的权利。</p>
      </section>
      <section>
        <h2>4. 套餐与计费</h2>
        <p>Free 套餐：免费使用，每月 500 次请求额度，可调用实时同步的免费模型池及赞助开放模型。注册时自动获得。</p>
        <p>Plus 套餐：{plusMonthlyPriceLabel}，每月 1500 次请求额度，可调用全部 Plus 模型池。Plus 由后台管理员开通，有效期为开通日起 30 天，到期后自动降级为 Free。</p>
        <p>当前阶段 Plus 通过后台手动开通，后续将支持支付宝、微信支付等自助购买方式。</p>
        <p>每月 1 日重置请求额度。未使用的额度不累积至下月。</p>
      </section>
      <section>
        <h2>5. 服务可用性与限制</h2>
        <p>本服务依赖上游模型提供商的可用性。OpenAchieve 会尽力维持服务的稳定运行，但不保证 100% 的服务可用性。上游模型因维护、限流或其他原因不可用时，本服务可能暂时无法完成请求。</p>
        <p>Free 和 Plus 套餐均设有月度请求次数上限，超出后将返回 429 错误直至次月重置。滥用检测机制可能会对异常请求模式进行临时限制。</p>
      </section>
      <section>
        <h2>6. 免责声明</h2>
        <p>AI 模型生成的输出由上游模型提供商产生，OpenAchieve 不对模型输出的准确性、完整性、合法性或适用性做任何明示或默示的保证。用户应自行评估和验证模型输出的内容。</p>
        <p>在法律允许的最大范围内，OpenAchieve 不对因使用或无法使用本服务而产生的任何直接、间接、附带、特殊或后果性损害承担责任。</p>
      </section>
      <section>
        <h2>7. 隐私与数据</h2>
        <p>我们仅收集提供本服务所需的最少信息：您的邮箱地址、账户密码的哈希值、API Key 的哈希值以及 API 调用记录（模型名称、请求路径、状态码、延迟等）。</p>
        <p>我们不会读取、存储或分析您通过 API 发送的聊天消息内容。请求内容仅在转发至上游模型提供商的过程中短暂经过服务器。部分上游免费模型可能用于服务改进或试用目的，请避免提交个人、商业机密或其他敏感信息。</p>
        <p>我们不会将您的个人信息出售或共享给第三方，除非法律要求。</p>
      </section>
      <section>
        <h2>8. 条款变更</h2>
        <p>OpenAchieve 可能会不时更新本服务条款。重大变更将通过网站公告或邮件通知。继续使用本服务即表示您接受修改后的条款。</p>
      </section>
      <section>
        <h2>9. 联系我们</h2>
        <p>如对本条款有任何疑问，请通过以下方式联系我们：</p>
        <p>GitHub: github.com/Piercekaoru/openachieve</p>
      </section>
    </article>
  );
}

function TermsBodyEn() {
  return (
    <article className="terms-body">
      <section>
        <h2>1. Service Description</h2>
        <p>OpenAchieve is an AI API relay platform for developers. It provides an OpenAI-compatible interface and forwards requests to upstream model providers. The service offers Free and Plus plans.</p>
      </section>
      <section>
        <h2>2. Account Registration and Security</h2>
        <p>You need to create an account before using the service. You must provide an accurate email address and keep your password and API keys secure.</p>
        <p>API keys are shown only once at creation time. OpenAchieve stores only hashed API keys. Losses caused by leaked or lost API keys are your responsibility.</p>
        <p>You may not lend, transfer, or sell your account to others.</p>
      </section>
      <section>
        <h2>3. Acceptable Use</h2>
        <p>You may not use this service to:</p>
        <ul>
          <li>Generate or distribute illegal, harmful, fraudulent, defamatory, harassing, or hateful content</li>
          <li>Infringe intellectual property, privacy, or other legal rights</li>
          <li>Bypass quota limits or abuse the API with malicious request patterns</li>
          <li>Develop weapons, support military use, or violate applicable laws</li>
        </ul>
        <p>OpenAchieve may suspend or terminate accounts when violations are found.</p>
      </section>
      <section>
        <h2>4. Plans and Billing</h2>
        <p>Free plan: free to use, 500 requests per month, with access to the live free model catalog and sponsored free models.</p>
        <p>Plus plan: {plusMonthlyPriceLabelEn}, 1,500 requests per month, and access to the full Plus model pool. Plus is valid for 30 days from activation and downgrades to Free after expiry.</p>
        <p>Self-service checkout currently supports Alipay and WeChat Pay while PayPal and USDT are temporarily hidden.</p>
        <p>Request quota resets on the first day of each month. Unused quota does not carry over.</p>
      </section>
      <section>
        <h2>5. Availability and Limits</h2>
        <p>This service depends on upstream model providers. OpenAchieve tries to keep the service stable but does not guarantee 100% availability.</p>
        <p>Free and Plus plans both have monthly request limits. After the limit is exceeded, requests may return 429 until the next monthly reset. Abuse controls may temporarily limit abnormal request patterns.</p>
      </section>
      <section>
        <h2>6. Disclaimer</h2>
        <p>AI model outputs are produced by upstream providers. OpenAchieve does not guarantee accuracy, completeness, legality, or fitness for purpose. You should evaluate and verify outputs yourself.</p>
        <p>To the maximum extent permitted by law, OpenAchieve is not liable for direct, indirect, incidental, special, or consequential damages arising from use or inability to use the service.</p>
      </section>
      <section>
        <h2>7. Privacy and Data</h2>
        <p>We collect the minimum data needed to provide the service: email address, password hash, API key hash, and API usage records such as model name, path, status code, and latency.</p>
        <p>We do not read, store, or analyze chat message content sent through the API. Request content only passes through the server while being forwarded upstream. Some upstream free models may be used for service improvement or trials, so avoid sensitive content.</p>
        <p>We do not sell or share your personal information with third parties unless required by law.</p>
      </section>
      <section>
        <h2>8. Changes to Terms</h2>
        <p>OpenAchieve may update these terms from time to time. Major changes will be announced on the website or by email. Continued use means you accept the updated terms.</p>
      </section>
      <section>
        <h2>9. Contact</h2>
        <p>If you have questions about these terms, contact us at:</p>
        <p>GitHub: github.com/Piercekaoru/openachieve</p>
      </section>
    </article>
  );
}

export default function TermsPage() {
  const { language } = useI18n();

  return (
    <main className="terms-page">
      <div className="terms-header">
        <SiteHeader variant="public" />
      </div>

      <section className="terms-shell">
        <div className="terms-intro">
          <p>Terms of Service</p>
          <h1>{language === "zh" ? "服务条款" : "Terms of Service"}</h1>
          <span>{language === "zh" ? "最后更新：2026 年 5 月" : "Last updated: May 2026"}</span>
        </div>

        {language === "zh" ? <TermsBodyZh /> : <TermsBodyEn />}
      </section>

      <SiteFooter />

      <style jsx>{`
        .terms-page {
          min-height: 100vh;
          overflow-x: hidden;
          color: #141413;
          background:
            radial-gradient(circle at 18% 12%, rgba(201, 100, 66, 0.08), transparent 28rem),
            linear-gradient(135deg, #f5f4ed 0%, #eee9dc 100%);
        }

        .terms-header {
          width: min(1220px, calc(100% - 48px));
          margin: 0 auto;
        }

        @media (max-width: 760px) {
          .terms-header {
            width: min(100% - 28px, 1220px);
          }
        }

        .terms-shell {
          width: min(900px, calc(100% - 48px));
          margin: 0 auto;
          padding: 44px 0 60px;
        }

        .terms-intro {
          margin-bottom: 44px;
        }

        .terms-intro p {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          margin: 0;
          font-size: 13px;
          font-weight: 850;
          letter-spacing: 0.06em;
          color: #c96442;
          text-transform: uppercase;
        }

        .terms-intro h1 {
          margin: 12px 0 8px;
          font-family: "Iowan Old Style", "Yu Mincho", "Hiragino Mincho ProN", Georgia, serif;
          font-size: clamp(32px, 5vw, 52px);
          font-weight: 600;
          line-height: 1.1;
          letter-spacing: 0.02em;
        }

        .terms-intro span {
          font-size: 13px;
          color: #6a6861;
        }

        .terms-body {
          color: #30302e;
          font-size: 15px;
          line-height: 1.85;
        }

        .terms-body section {
          margin-bottom: 36px;
        }

        .terms-body h2 {
          margin: 0 0 14px;
          font-family: "Iowan Old Style", "Yu Mincho", "Hiragino Mincho ProN", Georgia, serif;
          font-size: 20px;
          font-weight: 600;
          color: #141413;
        }

        .terms-body p {
          margin: 0 0 12px;
        }

        .terms-body ul {
          margin: 0 0 14px;
          padding-left: 22px;
        }

        .terms-body li {
          margin-bottom: 6px;
        }

        .terms-body li::marker {
          color: #c96442;
        }

        @media (max-width: 760px) {
          .terms-page {
            overflow-x: hidden;
          }

          .terms-shell {
            width: min(100% - 28px, 900px);
            padding: 32px 0 48px;
          }

          .terms-body {
            font-size: 14px;
            overflow-wrap: anywhere;
          }
        }

        @media (max-width: 460px) {
          .terms-header,
          .terms-shell {
            width: min(100% - 24px, 900px);
          }

          .terms-intro {
            margin-bottom: 30px;
          }

          .terms-body ul {
            padding-left: 18px;
          }
        }
      `}</style>
    </main>
  );
}
