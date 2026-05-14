"use client";

import { SiteFooter } from "../components/SiteFooter";
import { SiteHeader } from "../components/SiteHeader";
import { useLocale } from "@/lib/i18n/context";

function TermsBodyZh() {
  return (
    <article className="terms-body">
      <section>
        <h2>1. 服务说明</h2>
        <p>AIJinAPI（以下简称&ldquo;本服务&rdquo;）是一个面向开发者的 AI API 中转平台，提供 OpenAI-compatible 接口，将请求转发至上游模型提供商。本服务提供 Free 和 Plus 两种套餐，用户可根据需求选择合适的方案。</p>
      </section>
      <section>
        <h2>2. 账户注册与安全</h2>
        <p>使用本服务前，您需要注册一个账户。注册时您必须提供真实、准确的邮箱地址，并妥善保管您的密码和 API Key。</p>
        <p>API Key 仅在创建时显示一次，请务必在创建后立即保存。AIJinAPI 不会以任何方式存储您的 API Key 明文。因 API Key 泄露或丢失造成的损失由用户自行承担。</p>
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
        <p>AIJinAPI 保留在发现违规行为时立即暂停或终止账户的权利。</p>
      </section>
      <section>
        <h2>4. 套餐与计费</h2>
        <p>Free 套餐：免费使用，每月 500 次请求额度，仅可调用 Big Pickle 模型。注册时自动获得。</p>
        <p>Plus 套餐：$13/月，每月 1500 次请求额度，可调用全部 Plus 模型池。Plus 由后台管理员开通，有效期为开通日起 30 天，到期后自动降级为 Free。</p>
        <p>当前阶段 Plus 通过后台手动开通，后续将支持支付宝、微信支付等自助购买方式。</p>
        <p>每月 1 日重置请求额度。未使用的额度不累积至下月。</p>
      </section>
      <section>
        <h2>5. 服务可用性与限制</h2>
        <p>本服务依赖上游模型提供商的可用性。AIJinAPI 会尽力维持服务的稳定运行，但不保证 100% 的服务可用性。上游模型因维护、限流或其他原因不可用时，本服务可能暂时无法完成请求。</p>
        <p>Free 和 Plus 套餐均设有月度请求次数上限，超出后将返回 429 错误直至次月重置。滥用检测机制可能会对异常请求模式进行临时限制。</p>
      </section>
      <section>
        <h2>6. 免责声明</h2>
        <p>AI 模型生成的输出由上游模型提供商产生，AIJinAPI 不对模型输出的准确性、完整性、合法性或适用性做任何明示或默示的保证。用户应自行评估和验证模型输出的内容。</p>
        <p>在法律允许的最大范围内，AIJinAPI 不对因使用或无法使用本服务而产生的任何直接、间接、附带、特殊或后果性损害承担责任。</p>
      </section>
      <section>
        <h2>7. 隐私与数据</h2>
        <p>我们仅收集提供本服务所需的最少信息：您的邮箱地址、账户密码的哈希值、API Key 的哈希值以及 API 调用记录（模型名称、请求路径、状态码、延迟等）。</p>
        <p>我们不会读取、存储或分析您通过 API 发送的聊天消息内容。请求内容仅在转发至上游模型提供商的过程中短暂经过服务器。</p>
        <p>我们不会将您的个人信息出售或共享给第三方，除非法律要求。</p>
      </section>
      <section>
        <h2>8. 条款变更</h2>
        <p>AIJinAPI 可能会不时更新本服务条款。重大变更将通过网站公告或邮件通知。继续使用本服务即表示您接受修改后的条款。</p>
      </section>
      <section>
        <h2>9. 联系我们</h2>
        <p>如对本条款有任何疑问，请通过以下方式联系我们：</p>
        <p>GitHub: github.com/Piercekaoru/aijinapi</p>
      </section>
    </article>
  );
}

function TermsBodyJa() {
  return (
    <article className="terms-body">
      <section>
        <h2>1. サービス概要</h2>
        <p>AIJinAPI（以下「本サービス」）は、開発者向けの AI API 中継プラットフォームです。OpenAI 互換インターフェースを提供し、リクエストを上流モデルプロバイダーに転送します。Free と Plus の 2 プランがあります。</p>
      </section>
      <section>
        <h2>2. アカウント登録とセキュリティ</h2>
        <p>本サービスを利用するにはアカウント登録が必要です。登録時には正確なメールアドレスを提供し、パスワードと API Key を厳重に管理してください。</p>
        <p>API Key は作成時に一度だけ表示されます。必ずすぐに保存してください。AIJinAPI は API Key の平文を一切保存しません。API Key の漏洩や紛失による損害は利用者の責任となります。</p>
        <p>アカウントの貸与・譲渡・売買は禁止されています。</p>
      </section>
      <section>
        <h2>3. 利用許諾</h2>
        <p>本サービスを以下の目的で使用することは禁止されています：</p>
        <ul>
          <li>違法・有害・詐欺的・中傷的・嫌がらせ・ヘイトコンテンツの生成または拡散</li>
          <li>他者の知的財産権、プライバシー権、その他合法的権利の侵害</li>
          <li>本サービスの利用枠制限の回避、または悪意ある大量リクエスト</li>
          <li>兵器開発、軍事用途、または適用法令に違反する活動</li>
        </ul>
        <p>AIJinAPI は違反行為を発見した場合、直ちにアカウントを停止または終了する権利を留保します。</p>
      </section>
      <section>
        <h2>4. プランと課金</h2>
        <p>Free プラン：無料、月 500 リクエスト、Big Pickle モデルのみ利用可。登録時に自動付与。</p>
        <p>Plus プラン：$13/月、月 1500 リクエスト、全 Plus モデルプール利用可。Plus は管理者が有効化し、30 日間有効。期限切れ後は自動的に Free にダウングレード。</p>
        <p>現在 Plus は管理者による手動有効化ですが、今後 Alipay / WeChat での自動購入に対応予定です。</p>
        <p>リクエスト枠は毎月 1 日にリセットされます。未使用分は翌月に繰り越されません。</p>
      </section>
      <section>
        <h2>5. サービス可用性と制限</h2>
        <p>本サービスは上流モデルプロバイダーの可用性に依存します。AIJinAPI は安定稼働に努めますが、100% の可用性を保証するものではありません。上流モデルのメンテナンスや制限により、一時的にリクエストが処理できない場合があります。</p>
        <p>Free・Plus 両プランに月間リクエスト上限があります。上限超過時は 429 エラーが返され、翌月まで利用できません。異常なリクエストパターンに対しては一時的な制限がかかることがあります。</p>
      </section>
      <section>
        <h2>6. 免責事項</h2>
        <p>AI モデルの出力は上流プロバイダーによって生成されます。AIJinAPI はモデル出力の正確性、完全性、合法性、適合性について明示・黙示を問わず一切保証しません。利用者はモデル出力内容を自己責任で評価・検証してください。</p>
        <p>法令で認められる最大限の範囲において、AIJinAPI は本サービスの利用または利用不能に起因する直接的・間接的・付随的・特別・結果的損害について一切責任を負いません。</p>
      </section>
      <section>
        <h2>7. プライバシーとデータ</h2>
        <p>当社はサービス提供に必要な最小限の情報のみを収集します：メールアドレス、パスワードのハッシュ値、API Key のハッシュ値、API 呼出記録（モデル名、リクエストパス、ステータスコード、レイテンシ等）。</p>
        <p>API 経由で送信されたチャットメッセージの内容を読み取り、保存、分析することはありません。リクエスト内容は上流プロバイダーへの転送時にサーバーを一時的に通過するのみです。</p>
        <p>法令で要求される場合を除き、お客様の個人情報を第三者に販売または共有することはありません。</p>
      </section>
      <section>
        <h2>8. 規約の変更</h2>
        <p>AIJinAPI は本利用規約を随時更新することがあります。重要な変更はウェブサイトでの告知またはメールで通知します。継続利用をもって変更後の規約に同意したものとみなします。</p>
      </section>
      <section>
        <h2>9. お問い合わせ</h2>
        <p>本規約に関するご質問は以下までお問い合わせください：</p>
        <p>GitHub: github.com/Piercekaoru/aijinapi</p>
      </section>
    </article>
  );
}

export default function TermsPage() {
  const { locale, t } = useLocale();

  return (
    <main className="terms-page">
      <div className="terms-header">
        <SiteHeader variant="public" />
      </div>

      <section className="terms-shell">
        <div className="terms-intro">
          <p>Terms of Service</p>
          <h1>{t("terms.title")}</h1>
          <span>{t("terms.updated")}</span>
        </div>

        {locale === "ja" ? <TermsBodyJa /> : <TermsBodyZh />}
      </section>

      <SiteFooter />

      <style jsx>{`
        .terms-page {
          min-height: 100vh;
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
