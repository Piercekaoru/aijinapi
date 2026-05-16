"use client";

import { plusMonthlyPriceLabel } from "@/lib/pricing";
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
        <p>Free 套餐：免费使用，每月 500 次请求额度，可调用实时同步的免费模型池。注册时自动获得。</p>
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

export default function TermsPage() {
  return (
    <main className="terms-page">
      <div className="terms-header">
        <SiteHeader variant="public" />
      </div>

      <section className="terms-shell">
        <div className="terms-intro">
          <p>Terms of Service</p>
          <h1>服务条款</h1>
          <span>最后更新：2026 年 5 月</span>
        </div>

        <TermsBodyZh />
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
