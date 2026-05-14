"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { SiteFooter } from "../components/SiteFooter";
import { SiteHeader } from "../components/SiteHeader";
import { useLocale } from "@/lib/i18n/context";

const defaultBackendUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/+$/, "") ?? "/api/backend";

type DashboardResponse = {
  user: {
    id: number;
    email: string;
    name: string;
    created_at: string;
    plan: string;
    plan_status: string;
    monthly_request_limit: number;
    plus_started_at: string | null;
    plus_expires_at: string | null;
  };
  subscription: {
    plan: string;
    plan_status: string;
    monthly_request_limit: number;
    requests_this_month: number;
    remaining_requests: number;
    plus_started_at: string | null;
    plus_expires_at: string | null;
    allowed_models: string[];
  };
  api_keys: Array<{
    id: number;
    name: string;
    enabled: boolean;
    key_prefix: string | null;
    monthly_request_limit: number;
    requests_this_month: number;
    created_at: string;
    last_used_at: string | null;
  }>;
  recent_usage: Array<{
    model: string | null;
    path: string;
    status_code: number;
    is_stream: boolean;
    upstream_latency_ms: number | null;
    error_type: string | null;
    created_at: string;
  }>;
};

export function AccountClient() {
  const { t } = useLocale();
  const [sessionToken, setSessionToken] = useState("");
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [status, setStatus] = useState(t("account.loading"));
  const [loading, setLoading] = useState(true);

  const summary = useMemo(() => {
    const monthlyLimit = dashboard?.subscription.monthly_request_limit ?? 500;
    const used = dashboard?.subscription.requests_this_month ?? 0;
    const remaining = dashboard?.subscription.remaining_requests ?? Math.max(monthlyLimit - used, 0);
    const usagePercent = monthlyLimit > 0 ? Math.min((used / monthlyLimit) * 100, 100) : 0;
    const plan = dashboard?.subscription.plan ?? "free";

    return {
      monthlyLimit,
      used,
      remaining,
      usagePercent,
      plan,
      planLabel: plan === "plus" ? "Plus" : "Free",
      allowedModels: dashboard?.subscription.allowed_models ?? ["big-pickle"],
      plusExpiresAt: dashboard?.subscription.plus_expires_at ?? null,
    };
  }, [dashboard]);

  const loadAccount = useCallback(async (token: string) => {
    setLoading(true);
    setStatus(t("account.loading"));

    try {
      const response = await fetch(`${defaultBackendUrl}/dashboard`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) throw new Error(await errorText(response));
      const payload = (await response.json()) as DashboardResponse;
      setDashboard(payload);
      window.localStorage.setItem("aijinapi_user", JSON.stringify(payload.user));
      setStatus("账号信息已更新");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "账号读取失败");
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    const token = window.localStorage.getItem("aijinapi_session_token") ?? "";
    setSessionToken(token);

    if (!token) {
      setLoading(false);
      setStatus("请先登录或注册");
      return;
    }

    void loadAccount(token);
  }, [loadAccount]);

  return (
    <main className="account-page">
      <section className="account-shell">
        <SiteHeader active="account" variant="workspace" />

        <section className="account-hero">
          <div>
            <p>Account</p>
            <h1>{dashboard ? `${dashboard.user.name} 的账号` : "账号与额度"}</h1>
            <span>
              {dashboard ? `${dashboard.user.email} · ${summary.planLabel} 会员` : status}
            </span>
          </div>
          <Button type="button" onClick={() => sessionToken && loadAccount(sessionToken)} disabled={loading || !sessionToken}>
            {loading ? t("account.loading") : t("account.refresh")}
          </Button>
        </section>

        {!sessionToken ? (
          <section className="empty-state">
            <h2>{t("account.needLogin")}</h2>
            <p>{t("account.needLoginDesc")}</p>
            <Link className={buttonVariants({ variant: "default" })} href="/login">{t("account.goLogin")}</Link>
          </section>
        ) : (
          <>
            <section className="quota-grid" aria-label="账号额度概览">
              <article className="quota-card primary">
                <p>{summary.planLabel}</p>
                <strong>{summary.remaining.toLocaleString()}</strong>
                <span>{t("account.remaining")}</span>
              </article>
              <article className="quota-card">
                <p>{t("account.usedQuota")}</p>
                <strong>{summary.used.toLocaleString()}</strong>
                <span>{t("account.usedDesc")}</span>
              </article>
              <article className="quota-card">
                <p>{t("account.monthlyTotal")}</p>
                <strong>{summary.monthlyLimit.toLocaleString()}</strong>
                <span>{t("account.monthlyDesc")}</span>
              </article>
              <article className="quota-card">
                <p>{t("account.modelRange")}</p>
                <strong>{summary.allowedModels.length}</strong>
                <span>{summary.plan === "plus" ? t("account.modelRangeDesc") : t("account.modelRangeFree")}</span>
              </article>
            </section>

            <section className="usage-panel">
              <div className="panel-head">
                <div>
                  <p>{t("account.monthlyUsage")}</p>
                  <h2>{t("account.thisMonth")}</h2>
                </div>
                <code>{Math.round(summary.usagePercent)}%</code>
              </div>
              <div className="meter" aria-label="额度使用比例">
                <span style={{ width: `${summary.usagePercent}%` }} />
              </div>
              <div className="meter-labels">
                <span>{t("account.used")} {summary.used.toLocaleString()}</span>
                <span>{t("account.remainingLabel")} {summary.remaining.toLocaleString()}</span>
              </div>
              <div className="plan-note">
                <strong>{summary.plan === "plus" ? "$13 / 月" : "$0 / 月"}</strong>
                <span>
                  {summary.plan === "plus"
                    ? `Plus 到期：${summary.plusExpiresAt ? new Date(summary.plusExpiresAt).toLocaleString() : t("account.notSet")}`
                    : t("account.freeNote")}
                </span>
              </div>
            </section>

            <div className="account-grid">
              <section className="panel">
                <div className="panel-head">
                  <div>
                    <p>Keys</p>
                    <h2>{t("account.apiKeys")}</h2>
                  </div>
                  <Link className={buttonVariants({ variant: "secondary" })} href="/dashboard">管理 Key</Link>
                </div>
                <p className="panel-note">
                  额度按账号套餐统一计算，多个 Key 共享每月 {summary.monthlyLimit.toLocaleString()} 次。
                </p>
                <div className="key-list">
                  {dashboard?.api_keys.map((key) => (
                    <article className="key-row" key={key.id}>
                      <div>
                        <strong>{key.name}</strong>
                        <span>{key.key_prefix ? `${key.key_prefix}...` : "未保存前缀"}</span>
                      </div>
                      <div>
                        <code>{key.requests_this_month} 次</code>
                        <small>{key.enabled ? "启用" : "停用"}</small>
                      </div>
                    </article>
                  ))}
                  {!loading && dashboard?.api_keys.length === 0 && (
                    <p className="muted">还没有 API Key，请到控制台生成。</p>
                  )}
                </div>
              </section>

              <section className="panel dark">
                <div className="panel-head">
                  <div>
                    <p>Recent</p>
                    <h2>{t("account.recentUsage")}</h2>
                  </div>
                  <Link className={buttonVariants({ variant: "outline" })} href="/playground">去调试</Link>
                </div>
                <div className="usage-list">
                  {dashboard?.recent_usage.slice(0, 6).map((event, index) => (
                    <article className="usage-row" key={`${event.created_at}-${index}`}>
                      <div>
                        <strong>{event.model ?? event.path}</strong>
                        <span>{new Date(event.created_at).toLocaleString()}</span>
                      </div>
                      <div>
                        <code>{event.status_code}</code>
                        <small>{event.is_stream ? "stream" : "json"}</small>
                      </div>
                    </article>
                  ))}
                  {!loading && dashboard?.recent_usage.length === 0 && (
                    <p className="muted">{t("account.noUsage")}</p>
                  )}
                </div>
              </section>
            </div>
          </>
        )}

        <footer className="status-bar">{status}</footer>
      </section>
      <SiteFooter />

      <style jsx>{`
        .account-page {
          min-height: 100vh;
          padding: 0 36px 42px;
          color: #141413;
          background:
            radial-gradient(circle at 18% 12%, rgba(201, 100, 66, 0.11), transparent 30rem),
            linear-gradient(135deg, #f5f4ed 0%, #ede8d8 100%);
          font-family: -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Noto Sans SC",
            "Microsoft YaHei", system-ui, sans-serif;
        }

        .account-shell {
          width: min(1180px, 100%);
          margin: 0 auto;
        }

        .account-hero {
          display: flex;
          align-items: end;
          justify-content: space-between;
          gap: 24px;
          margin: 58px 0 24px;
          padding-bottom: 34px;
          border-bottom: 1px solid #e0ded4;
        }

        .account-hero p,
        .panel-head p,
        .quota-card p {
          margin: 0 0 8px;
          color: #be5331;
          font-size: 12px;
          font-weight: 850;
          text-transform: uppercase;
        }

        h1,
        h2 {
          margin: 0;
          letter-spacing: 0;
        }

        h1 {
          font-size: clamp(48px, 6vw, 82px);
          line-height: 0.96;
        }

        h2 {
          font-size: 24px;
        }

        h1,
        .quota-card strong {
          font-family: "Iowan Old Style", "Yu Mincho", "Hiragino Mincho ProN", Georgia, serif;
          font-weight: 500;
        }

        .account-hero span,
        .quota-card span,
        .meter-labels,
        .key-row span,
        .usage-row span,
        .muted,
        .status-bar {
          color: #6a6861;
        }

        .quota-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 16px;
          margin-bottom: 18px;
        }

        .quota-card,
        .usage-panel,
        .panel,
        .empty-state {
          border: 1px solid #e0ded4;
          border-radius: 18px;
          background: rgba(250, 249, 245, 0.92);
          box-shadow: 0 18px 54px rgba(20, 20, 19, 0.08);
        }

        .quota-card {
          min-height: 164px;
          display: grid;
          align-content: space-between;
          padding: 22px;
        }

        .quota-card.primary {
          color: #faf9f5;
          background: #141413;
          border-color: #141413;
        }

        .quota-card.primary p,
        .quota-card.primary span {
          color: #d7d4c8;
        }

        .quota-card strong {
          font-size: clamp(34px, 4vw, 58px);
          line-height: 1;
        }

        .usage-panel,
        .panel,
        .empty-state {
          padding: 24px;
        }

        .panel-head,
        .key-row,
        .usage-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 18px;
        }

        .panel-head {
          margin-bottom: 18px;
        }

        .panel-head code {
          color: #141413;
          font-size: 18px;
          font-weight: 850;
        }

        .meter {
          height: 18px;
          overflow: hidden;
          border-radius: 999px;
          background: #e8e6dc;
        }

        .meter span {
          display: block;
          height: 100%;
          border-radius: inherit;
          background: #c96442;
        }

        .meter-labels {
          display: flex;
          justify-content: space-between;
          gap: 16px;
          margin-top: 10px;
          font-size: 13px;
          font-weight: 750;
        }

        .plan-note,
        .panel-note {
          margin-top: 14px;
          color: #6a6861;
          font-size: 13px;
        }

        .plan-note {
          display: flex;
          justify-content: space-between;
          gap: 16px;
        }

        .plan-note strong {
          color: #141413;
        }

        .panel-note {
          margin: -6px 0 16px;
        }

        .account-grid {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 0.88fr);
          gap: 18px;
          margin-top: 18px;
        }

        .panel.dark {
          color: #faf9f5;
          background: #141413;
          border-color: #141413;
        }

        .panel.dark .panel-head p,
        .panel.dark .usage-row span,
        .panel.dark .muted,
        .panel.dark code,
        .panel.dark small {
          color: #c8c5bb;
        }

        .key-list,
        .usage-list {
          display: grid;
          gap: 12px;
        }

        .key-row,
        .usage-row {
          min-height: 76px;
          border: 1px solid #e0ded4;
          border-radius: 12px;
          padding: 14px;
          background: #fffdfa;
        }

        .usage-row {
          border-color: #30302e;
          background: #1d1d1b;
        }

        .key-row > div,
        .usage-row > div {
          min-width: 0;
          display: grid;
          gap: 4px;
        }

        .key-row > div:last-child,
        .usage-row > div:last-child {
          justify-items: end;
        }

        .key-row strong,
        .usage-row strong {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .empty-state {
          display: grid;
          justify-items: start;
          gap: 12px;
        }

        .empty-state p {
          margin: 0;
          color: #6a6861;
        }

        .status-bar {
          margin-top: 22px;
          font-size: 13px;
        }

        @media (max-width: 920px) {
          .account-page {
            padding: 0 22px 32px;
            overflow-x: hidden;
          }

          .account-hero,
          .account-grid {
            grid-template-columns: 1fr;
            display: grid;
          }

          .quota-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          h1 {
            font-size: clamp(36px, 12vw, 58px);
            line-height: 1.02;
          }
        }

        @media (max-width: 620px) {
          .account-page {
            padding: 0 14px 28px;
          }

          .account-hero,
          .panel-head,
          .key-row,
          .usage-row,
          .meter-labels,
          .plan-note {
            display: grid;
            grid-template-columns: 1fr;
            justify-items: start;
          }

          .account-hero :global(button),
          .panel-head :global(a) {
            width: 100%;
          }

          .quota-grid {
            grid-template-columns: 1fr;
          }

          .quota-card,
          .usage-panel,
          .panel,
          .empty-state {
            border-radius: 12px;
            padding: 18px;
          }

          .key-row > div:last-child,
          .usage-row > div:last-child {
            justify-items: start;
          }

          .key-row strong,
          .usage-row strong {
            white-space: normal;
            overflow-wrap: anywhere;
          }
        }
      `}</style>
    </main>
  );
}

async function errorText(response: Response) {
  const text = await response.text();
  try {
    const json = JSON.parse(text) as { error?: { message?: string } };
    return json.error?.message ?? text;
  } catch {
    return text;
  }
}
