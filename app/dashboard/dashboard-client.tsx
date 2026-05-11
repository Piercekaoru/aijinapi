"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { SiteFooter } from "../components/SiteFooter";
import { SiteHeader } from "../components/SiteHeader";

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
  const [backendUrl, setBackendUrl] = useState(defaultBackendUrl);
  const [sessionToken, setSessionToken] = useState("");
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [latestKey, setLatestKey] = useState("");
  const [status, setStatus] = useState("正在读取控制台...");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const normalizedBackendUrl = useMemo(
    () => backendUrl.replace(/\/+$/, ""),
    [backendUrl],
  );

  const loadDashboard = useCallback(async (token = sessionToken, apiBase = normalizedBackendUrl) => {
    if (!token) return;
    setLoading(true);
    setStatus("正在读取控制台...");

    try {
      const response = await fetch(`${apiBase}/dashboard`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!response.ok) throw new Error(await errorText(response));
      setDashboard((await response.json()) as DashboardResponse);
      setStatus("已连接后端");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "控制台读取失败");
    } finally {
      setLoading(false);
    }
  }, [normalizedBackendUrl, sessionToken]);

  useEffect(() => {
    const token = window.localStorage.getItem("aijinapi_session_token") ?? "";
    const storedKey = window.localStorage.getItem("aijinapi_latest_customer_key") ?? "";
    setSessionToken(token);
    setLatestKey(storedKey);
    if (!token) {
      setLoading(false);
      setStatus("请先登录或注册");
      return;
    }
    void loadDashboard(token, normalizedBackendUrl);
  }, [loadDashboard, normalizedBackendUrl]);

  async function createKey() {
    if (!sessionToken) return;
    setCreating(true);
    setStatus("正在生成新 API Key...");

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
      window.localStorage.setItem("aijinapi_latest_customer_key", issued.key);
      setLatestKey(issued.key);
      setStatus("新 API Key 已生成，请现在保存");
      await loadDashboard();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "生成失败");
    } finally {
      setCreating(false);
    }
  }

  async function copy(text: string) {
    await navigator.clipboard.writeText(text);
    setStatus("已复制到剪贴板");
  }

  return (
    <main className="dashboard-page">
      <section className="dashboard-shell">
        <SiteHeader active="dashboard" variant="workspace" />

        <section className="hero-band">
          <div>
            <p>Console</p>
            <h1>{dashboard ? `${dashboard.user.name} 的控制台` : "AIJinAPI 控制台"}</h1>
            <span>
              {dashboard
                ? `${dashboard.user.email} · ${dashboard.subscription.plan === "plus" ? "Plus" : "Free"} · ${dashboard.subscription.requests_this_month}/${dashboard.subscription.monthly_request_limit}`
                : status}
            </span>
          </div>
          <label>
            后端地址
            <input
              value={backendUrl}
              onChange={(event) => setBackendUrl(event.target.value)}
              placeholder="http://127.0.0.1:8080"
              aria-label="后端地址"
            />
          </label>
        </section>

        {!sessionToken ? (
          <section className="empty-state">
            <h2>需要登录</h2>
            <p>登录或注册后会生成客户 API Key，并在这里查看额度和调用记录。</p>
            <Link className={buttonVariants({ variant: "default" })} href="/login">去登录</Link>
          </section>
        ) : (
          <div className="dashboard-grid">
            <section className="panel key-panel">
              <div className="panel-head">
                <div>
                  <p>API Key</p>
                  <h2>客户调用密钥</h2>
                  <span className="panel-subtitle">多个 Key 共享账号套餐额度，不再按单个 Key 独立计费。</span>
                </div>
                <Button type="button" onClick={createKey} disabled={creating}>
                  {creating ? "生成中..." : "生成新 Key"}
                </Button>
              </div>

              {latestKey && (
                <div className="issued-key">
                  <span>最近生成的 Key 仅在本机临时显示</span>
                  <code>{latestKey}</code>
                  <Button variant="secondary" type="button" onClick={() => copy(latestKey)}>
                    复制
                  </Button>
                </div>
              )}

              <div className="key-list">
                {loading && <p className="muted">读取中...</p>}
                {dashboard?.api_keys.map((key) => (
                  <article className="key-row" key={key.id}>
                    <div>
                      <strong>{key.name}</strong>
                      <span>{key.key_prefix ? `${key.key_prefix}...` : "旧 Key 未保存前缀"}</span>
                    </div>
                    <div>
                      <span>{key.requests_this_month} 次</span>
                      <small>{key.enabled ? "启用" : "停用"}</small>
                    </div>
                  </article>
                ))}
                {!loading && dashboard?.api_keys.length === 0 && (
                  <p className="muted">还没有 API Key，点击右上角生成一个。</p>
                )}
              </div>
            </section>

            <section className="panel usage-panel">
              <div className="panel-head">
                <div>
                  <p>Usage</p>
                  <h2>最近调用</h2>
                </div>
                <Button variant="secondary" type="button" onClick={() => loadDashboard()} disabled={loading}>
                  刷新
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
                  <p className="muted">暂无调用记录。</p>
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
        }

        code {
          overflow-wrap: anywhere;
          font-family: "SFMono-Regular", Consolas, monospace;
        }

        .status-bar {
          margin-top: 18px;
          color: rgba(25, 25, 22, 0.62);
          font-size: 13px;
        }

        @media (max-width: 780px) {
          .dashboard-page {
            padding: 0 22px 22px;
          }

          .hero-band,
          .dashboard-grid {
            display: grid;
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </main>
  );
}

async function errorText(response: Response) {
  const text = await response.text();
  if (!text) return `请求失败：${response.status}`;
  try {
    const json = JSON.parse(text) as { error?: { message?: string; code?: string } };
    return json.error?.message || json.error?.code || text;
  } catch {
    return text;
  }
}
