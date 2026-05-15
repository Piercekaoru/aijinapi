"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
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

type IssuedApiKey = {
  key: string;
  key_prefix: string;
  name: string;
  monthly_request_limit: number;
};

export function DashboardClient() {
  const { t } = useLocale();
  const [backendUrl, setBackendUrl] = useState(defaultBackendUrl);
  const [sessionToken, setSessionToken] = useState("");
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [latestKey, setLatestKey] = useState("");
  const [status, setStatus] = useState(t("dashboard.loading"));
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const normalizedBackendUrl = useMemo(
    () => backendUrl.replace(/\/+$/, ""),
    [backendUrl],
  );

  const loadDashboard = useCallback(async (token = sessionToken, apiBase = normalizedBackendUrl) => {
    if (!token) return;
    setLoading(true);
    setStatus(t("dashboard.loading"));

    try {
      const response = await fetch(`${apiBase}/dashboard`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!response.ok) throw new Error(await errorText(response));
      setDashboard((await response.json()) as DashboardResponse);
      setStatus(t("dashboard.connected"));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("dashboard.failed"));
    } finally {
      setLoading(false);
    }
  }, [normalizedBackendUrl, sessionToken, t]);

  useEffect(() => {
    const token = window.localStorage.getItem("openachieve_session_token") ?? "";
    const storedKey = window.localStorage.getItem("openachieve_latest_customer_key") ?? "";
    setSessionToken(token);
    setLatestKey(storedKey);
    if (!token) {
      setLoading(false);
      setStatus(t("dashboard.needLogin"));
      return;
    }
    void loadDashboard(token, normalizedBackendUrl);
  }, [loadDashboard, normalizedBackendUrl, t]);

  async function createKey() {
    if (!sessionToken) return;
    setCreating(true);
    setStatus(t("dashboard.creating"));

    try {
      const response = await fetch(`${normalizedBackendUrl}/dashboard/api-keys`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${sessionToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: `key-${new Date().toISOString().slice(0, 10)}`,
        }),
      });
      if (!response.ok) throw new Error(await errorText(response));
      const issued = (await response.json()) as IssuedApiKey;
      window.localStorage.setItem("openachieve_latest_customer_key", issued.key);
      setLatestKey(issued.key);
      setStatus(t("dashboard.generated"));
      await loadDashboard();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("dashboard.failed"));
    } finally {
      setCreating(false);
    }
  }

  async function copy(text: string) {
    await navigator.clipboard.writeText(text);
    setStatus(t("dashboard.keyCopied"));
  }

  return (
    <main className="dashboard-page">
      <section className="dashboard-shell">
        <SiteHeader active="dashboard" variant="workspace" />

        <section className="hero-band">
          <div>
            <p>{t("dashboard.label")}</p>
            <h1>{dashboard ? `${dashboard.user.name} 的控制台` : t("dashboard.title")}</h1>
            <span>
              {dashboard
                ? `${dashboard.user.email} · ${dashboard.subscription.plan === "plus" ? "Plus" : "Free"} · ${dashboard.subscription.requests_this_month}/${dashboard.subscription.monthly_request_limit}`
                : status}
            </span>
          </div>
          <label>
{t("dashboard.apiBaseURL")}
            <input
              value={backendUrl}
              onChange={(event) => setBackendUrl(event.target.value)}
              placeholder="https://openachieve.asia"
              aria-label={t("dashboard.apiBaseURL")}
            />
          </label>
        </section>

        {!sessionToken ? (
          <section className="empty-state">
            <h2>{t("dashboard.needLogin")}</h2>
            <p>{t("dashboard.needLoginDesc")}</p>
            <Link className={buttonVariants({ variant: "default" })} href="/login">{t("dashboard.goLogin")}</Link>
          </section>
        ) : (
          <div className="dashboard-grid">
            <section className="panel key-panel">
              <div className="panel-head">
                <div>
                  <p>{t("dashboard.keyLabel")}</p>
<h2>{t("dashboard.apiKeys")}</h2>
            <span className="panel-subtitle">{t("dashboard.apiKeysSub")}</span>
                </div>
                <Button type="button" onClick={createKey} disabled={creating}>
                  {creating ? t("dashboard.creating") : t("dashboard.createKey")}
                </Button>
              </div>

              {latestKey && (
                <div className="issued-key">
                  <span>{t("dashboard.keyWarning")}</span>
                  <code>{latestKey}</code>
                  <Button variant="secondary" type="button" onClick={() => copy(latestKey)}>
                    {t("dashboard.copy")}
                  </Button>
                </div>
              )}

              <div className="key-list">
                {loading && <p className="muted">{t("dashboard.loadingKeys")}</p>}
                {dashboard?.api_keys.map((key) => (
                  <article className="key-row" key={key.id}>
                    <div>
                      <strong>{key.name}</strong>
                      <span>{key.key_prefix ? `${key.key_prefix}...` : t("dashboard.oldKeyPrefix")}</span>
                    </div>
                    <div>
                      <span>{key.requests_this_month} 次</span>
                      <small>{key.enabled ? t("dashboard.enabled") : t("dashboard.disabled")}</small>
                    </div>
                  </article>
                ))}
                {!loading && dashboard?.api_keys.length === 0 && (
                  <p className="muted">{t("dashboard.noKeys")}</p>
                )}
              </div>
            </section>

            <section className="panel usage-panel">
              <div className="panel-head">
                <div>
                  <p>Usage</p>
                  <h2>{t("dashboard.recentUsage")}</h2>
                </div>
                <Button variant="secondary" type="button" onClick={() => loadDashboard()} disabled={loading}>
                  {t("dashboard.refresh")}
                </Button>
              </div>

              <div className="usage-list">
                {dashboard?.recent_usage.map((event, index) => (
                  <article className="usage-row" key={`${event.created_at}-${index}`}>
                    <div>
                      <strong>{event.model ?? event.path}</strong>
                      <span>{new Date(event.created_at).toLocaleString()}</span>
                    </div>
                    <div>
                      <code>{event.status_code}</code>
                      <span>{event.is_stream ? "stream" : "json"}</span>
                    </div>
                  </article>
                ))}
                {!loading && dashboard?.recent_usage.length === 0 && (
                  <p className="muted">{t("dashboard.noUsage")}</p>
                )}
              </div>
            </section>
          </div>
        )}

        <footer className="status-bar">{status}</footer>
      </section>
      <SiteFooter />

      <style jsx>{`
        .dashboard-page {
          min-height: 100vh;
          padding: 0 36px 36px;
          color: #141413;
          background:
            radial-gradient(circle at 16% 10%, rgba(201, 100, 66, 0.1), transparent 30rem),
            linear-gradient(135deg, #f5f4ed 0%, #ede8d8 100%);
          font-family: -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Noto Sans SC",
            "Microsoft YaHei", system-ui, sans-serif;
        }

        .dashboard-shell {
          width: min(1180px, 100%);
          margin: 0 auto;
        }
        .hero-band,
        .panel-head,
        .key-row,
        .usage-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
        }
        .hero-band {
          align-items: end;
          padding: 28px 0;
          border-top: 1px solid rgba(25, 25, 22, 0.12);
          border-bottom: 1px solid rgba(25, 25, 22, 0.12);
        }

        .hero-band p,
        .panel-head p {
          margin: 0 0 8px;
          color: #af4b2a;
          font-size: 12px;
          font-weight: 800;
          letter-spacing: 0;
          text-transform: uppercase;
        }

        h1,
        h2 {
          margin: 0;
          letter-spacing: 0;
        }

        h1 {
          font-size: clamp(32px, 5vw, 58px);
          line-height: 1;
        }

        h2 {
          font-size: 22px;
        }

        .hero-band span,
        .muted,
        .key-row span,
        .usage-row span,
        .panel-subtitle,
        .issued-key span {
          color: rgba(25, 25, 22, 0.62);
        }

        .panel-subtitle {
          display: block;
          margin-top: 6px;
          font-size: 13px;
          font-weight: 650;
        }

        label {
          display: grid;
          gap: 8px;
          min-width: min(360px, 100%);
          color: rgba(25, 25, 22, 0.62);
          font-size: 13px;
          font-weight: 700;
        }

        input {
          min-height: 44px;
          border: 1px solid rgba(25, 25, 22, 0.14);
          border-radius: 8px;
          padding: 0 14px;
          color: #191916;
          background: rgba(255, 255, 255, 0.7);
          font: inherit;
        }

        .dashboard-grid {
          display: grid;
          grid-template-columns: minmax(0, 1.1fr) minmax(340px, 0.9fr);
          gap: 18px;
          margin-top: 22px;
          min-width: 0;
        }

        .panel,
        .empty-state {
          border: 1px solid rgba(25, 25, 22, 0.12);
          border-radius: 8px;
          padding: 22px;
          background: rgba(255, 255, 255, 0.56);
          box-shadow: 0 20px 60px rgba(45, 37, 20, 0.08);
        }

        .empty-state {
          margin-top: 22px;
        }

        .empty-state p {
          color: rgba(25, 25, 22, 0.62);
        }

        .key-list,
        .usage-list {
          display: grid;
          gap: 10px;
          margin-top: 18px;
        }

        .key-row,
        .usage-row {
          min-height: 72px;
          border: 1px solid rgba(25, 25, 22, 0.1);
          border-radius: 8px;
          padding: 14px;
          background: rgba(255, 255, 255, 0.68);
        }

        .key-row div,
        .usage-row div {
          display: grid;
          gap: 5px;
        }

        .key-row div:last-child,
        .usage-row div:last-child {
          justify-items: end;
        }

        .issued-key {
          display: grid;
          gap: 10px;
          margin-top: 18px;
          border: 1px solid rgba(175, 75, 42, 0.26);
          border-radius: 8px;
          padding: 14px;
          background: rgba(255, 248, 238, 0.86);
          overflow: hidden;
        }

        .issued-key code {
          overflow-wrap: anywhere;
          word-break: break-all;
          font-family: "SFMono-Regular", Consolas, monospace;
          font-size: 13px;
        }

        code {
          overflow-wrap: anywhere;
          word-break: break-all;
          font-family: "SFMono-Regular", Consolas, monospace;
        }

        .status-bar {
          margin-top: 18px;
          color: rgba(25, 25, 22, 0.62);
          font-size: 13px;
        }

        @media (max-width: 780px) {
          .dashboard-page {
            padding: 0 14px 22px;
            overflow-x: hidden;
          }

          .hero-band,
          .dashboard-grid {
            display: grid;
            grid-template-columns: 1fr;
            min-width: 0;
          }

          .hero-band {
            gap: 18px;
            align-items: start;
          }

          h1 {
            font-size: clamp(30px, 10vw, 42px);
            line-height: 1.05;
          }

          label {
            min-width: 0;
          }

          .panel,
          .empty-state {
            padding: 18px;
            min-width: 0;
            overflow-wrap: anywhere;
          }

          .panel-head,
          .key-row,
          .usage-row {
            display: grid;
            grid-template-columns: 1fr;
            justify-items: start;
          }

          .panel-head :global(button),
          .issued-key :global(button) {
            width: 100%;
          }

          .key-row div:last-child,
          .usage-row div:last-child {
            justify-items: start;
          }
        }

        @media (max-width: 480px) {
          .dashboard-page {
            padding: 0 14px 20px;
          }

          .panel,
          .empty-state {
            padding: 16px;
          }

          .issued-key code {
            max-width: 100%;
            overflow-x: auto;
            word-break: break-all;
          }

          .key-row strong,
          .key-row span,
          .usage-row strong,
          .usage-row span {
            overflow-wrap: anywhere;
            word-break: break-word;
          }
        }
      `}</style>
    </main>
  );
}

async function errorText(response: Response) {
  const text = await response.text();
  if (!text) return `${response.status} ${response.statusText}`;
  try {
    const json = JSON.parse(text) as { error?: { message?: string; code?: string } };
    return json.error?.message || json.error?.code || text;
  } catch {
    return text;
  }
}
