"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import type { Language } from "@/lib/i18n-core";
import { modelDisplayName } from "@/lib/free-models";
import { modelAccessNote, usageQuotaNote, usageTransportLabel } from "@/lib/model-access";
import { ShutdownAnnouncementDialog } from "../components/ShutdownAnnouncementDialog";
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

const copyZh: Record<string, string> = {
  title: "Key 控制台",
  loading: "正在读取控制台...",
  loadingKeys: "读取中...",
  keyLabel: "API 密钥",
  apiBaseURL: "接口地址",
  createKey: "生成新 Key",
  creating: "正在生成...",
  keyCopied: "已复制到剪贴板",
  keyWarning: "此 Key 仅在创建时显示一次，请立即复制并妥善存储。",
  connected: "已连接",
  failed: "控制台读取失败",
  needLogin: "需要登录",
  needLoginDesc: "登录或注册后会生成 API Key，并在这里查看额度和调用记录。",
  goLogin: "去登录",
  generated: "新 API Key 已生成，请现在保存",
  copy: "复制",
  deleteKey: "删除",
  deletingKey: "删除中...",
  keyDeleted: "API Key 已删除并立即失效",
  apiKeys: "API 密钥",
  apiKeysSub: "多个 Key 共享账号套餐额度，不再按单个 Key 独立计费。",
  noKeys: "还没有 API Key，点击右上角生成一个。",
  oldKeyPrefix: "旧 Key 未保存前缀",
  enabled: "启用",
  disabled: "停用",
  recentUsage: "最近调用",
  refresh: "刷新",
  noUsage: "暂无调用记录。",
  label: "控制台",
  availableModels: "可用模型",
  modelAccessNote: "MiniMax M3 需走 /v1/messages，且不计入月度额度。",
};

const copyEn: Record<string, string> = {
  title: "Key Console",
  loading: "Loading console...",
  loadingKeys: "Loading...",
  keyLabel: "API key",
  apiBaseURL: "Base URL",
  createKey: "Create new key",
  creating: "Creating...",
  keyCopied: "Copied to clipboard",
  keyWarning: "This key is shown only once. Copy it now and store it safely.",
  connected: "Connected",
  failed: "Failed to load console",
  needLogin: "Login required",
  needLoginDesc: "Log in or sign up to create API keys and view quota and usage.",
  goLogin: "Log in",
  generated: "New API key generated. Save it now.",
  copy: "Copy",
  deleteKey: "Delete",
  deletingKey: "Deleting...",
  keyDeleted: "API key deleted and revoked",
  apiKeys: "API keys",
  apiKeysSub: "Multiple keys share the account plan quota instead of being billed per key.",
  noKeys: "No API key yet. Create one from the top-right button.",
  oldKeyPrefix: "Legacy key prefix unavailable",
  enabled: "Enabled",
  disabled: "Disabled",
  recentUsage: "Recent usage",
  refresh: "Refresh",
  noUsage: "No usage records yet.",
  label: "Console",
  confirmDelete: "Delete API key \"{name}\"?\n\nThe key will be revoked immediately and cannot be restored. You can create a new key afterwards.",
  userConsole: "{name}'s console",
  requests: "requests",
  availableModels: "Available models",
  modelAccessNote: "MiniMax M3 uses /v1/messages and does not count against monthly quota.",
};

function translate(language: Language, key: string) {
  const shortKey = key.split(".").at(-1) ?? key;
  const dictionary = language === "en" ? copyEn : copyZh;
  return dictionary[key] ?? dictionary[shortKey] ?? key;
}

export function DashboardClient() {
  const { language } = useI18n();
  const t = useCallback((key: string) => translate(language, key), [language]);
  const [backendUrl, setBackendUrl] = useState(defaultBackendUrl);
  const [sessionToken, setSessionToken] = useState("");
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [latestKey, setLatestKey] = useState("");
  const [status, setStatus] = useState(() => t("dashboard.loading"));
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [deletingKeyId, setDeletingKeyId] = useState<number | null>(null);

  const allowedModelItems = useMemo(
    () =>
      (dashboard?.subscription.allowed_models ?? []).map((id) => ({
        id,
        name: modelDisplayName(id),
        note: modelAccessNote(id, language),
      })),
    [dashboard?.subscription.allowed_models, language],
  );

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

  async function deleteKey(key: DashboardResponse["api_keys"][number]) {
    if (!sessionToken || !key.enabled) return;
    const confirmed = window.confirm(t("dashboard.confirmDelete").replace("{name}", key.name));
    if (!confirmed) return;

    setDeletingKeyId(key.id);
    setStatus(t("dashboard.deletingKey"));

    try {
      const response = await fetch(`${normalizedBackendUrl}/dashboard/api-keys/${key.id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${sessionToken}`,
        },
      });
      if (!response.ok) throw new Error(await errorText(response));
      setStatus(t("dashboard.keyDeleted"));
      await loadDashboard();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("dashboard.failed"));
    } finally {
      setDeletingKeyId(null);
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
        <ShutdownAnnouncementDialog enabled={Boolean(sessionToken)} />

        <section className="hero-band">
          <div>
            <p>{t("dashboard.label")}</p>
            <h1>{dashboard ? t("dashboard.userConsole").replace("{name}", dashboard.user.name) : t("dashboard.title")}</h1>
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
                    <div className="key-actions">
                      <span>{key.requests_this_month} {t("dashboard.requests")}</span>
                      <small>{key.enabled ? t("dashboard.enabled") : t("dashboard.disabled")}</small>
                      {key.enabled && (
                        <Button
                          variant="destructive"
                          size="sm"
                          type="button"
                          onClick={() => deleteKey(key)}
                          disabled={deletingKeyId === key.id}
                        >
                          {deletingKeyId === key.id
                            ? t("dashboard.deletingKey")
                            : t("dashboard.deleteKey")}
                        </Button>
                      )}
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
                <div className="model-access">
                  <div className="model-access-head">
                    <strong>{t("dashboard.availableModels")}</strong>
                    <span>{allowedModelItems.length}</span>
                  </div>
                  <div className="model-access-list">
                    {allowedModelItems.map((model) => (
                      <article className="model-access-item" key={model.id}>
                        <strong>{model.name}</strong>
                        <code>{model.id}</code>
                        {model.note && <small>{model.note}</small>}
                      </article>
                    ))}
                  </div>
                  <p className="muted">{t("dashboard.modelAccessNote")}</p>
                </div>
                {dashboard?.recent_usage.map((event, index) => (
                  <article className="usage-row" key={`${event.created_at}-${index}`}>
                    <div>
                      <strong>{event.model ?? event.path}</strong>
                      <span>{formatDateTime(event.created_at, language)}</span>
                    </div>
                    <div>
                      <code>{event.status_code}</code>
                      <span>
                        {usageTransportLabel(event.path, event.is_stream, event.model)}
                        {usageQuotaNote(event.model, language) ? ` · ${usageQuotaNote(event.model, language)}` : ""}
                      </span>
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
          width: min(1380px, 100%);
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

        .model-access {
          display: grid;
          gap: 10px;
          margin-bottom: 8px;
          border: 1px solid rgba(25, 25, 22, 0.1);
          border-radius: 8px;
          padding: 14px;
          background: rgba(255, 255, 255, 0.72);
        }

        .model-access-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }

        .model-access-head strong {
          font-size: 15px;
        }

        .model-access-list {
          display: grid;
          gap: 10px;
        }

        .model-access-item {
          display: grid;
          gap: 4px;
          border: 1px solid rgba(25, 25, 22, 0.08);
          border-radius: 8px;
          padding: 10px 12px;
          background: rgba(255, 255, 255, 0.84);
        }

        .model-access-item small {
          color: rgba(25, 25, 22, 0.62);
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

        .key-actions {
          align-content: center;
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

function formatDateTime(value: string, language: Language) {
  return new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
