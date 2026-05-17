"use client";

import Link from "next/link";
import { Ban, Eye, Network, ShieldCheck, ShieldX } from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { SiteFooter } from "../components/SiteFooter";
import { SiteHeader } from "../components/SiteHeader";

const defaultBackendUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/+$/, "") ?? "/api/backend";

type AdminUser = {
  id: number;
  email: string;
  name: string;
  created_at: string;
  plan: string;
  stored_plan: string;
  plan_status: string;
  monthly_request_limit: number;
  requests_this_month: number;
  remaining_requests: number;
  plus_started_at: string | null;
  plus_expires_at: string | null;
  api_key_count: number;
  last_used_at: string | null;
  is_admin: boolean;
  status: string;
  banned_at: string | null;
  banned_reason: string | null;
  registration_ip: string | null;
  last_seen_ip: string | null;
  last_seen_at: string | null;
  recent_rate_limit_count: number;
  active_ip_ban_count: number;
};

type AdminUsersResponse = {
  stats: {
    total_users: number;
    free_users: number;
    plus_users: number;
    inactive_plus_users: number;
  };
  users: AdminUser[];
};

type AdminCreateUserResponse = {
  user: AdminUser;
  temporary_password: string;
  api_key: {
    key: string;
    key_prefix: string;
    name: string;
    monthly_request_limit: number;
  };
};

type AdminQuotaResetResponse = {
  effective_at: string;
  users_affected: number;
};

type IpBanSummary = {
  id: number;
  ip: string;
  reason: string;
  banned_by_user_id: number | null;
  created_at: string;
  expires_at: string | null;
  lifted_at: string | null;
};

type SecurityIpSummary = {
  ip: string;
  registered_user_count: number;
  seen_user_count: number;
  free_ai_request_count: number;
  rate_limited_count: number;
  active_ban_id: number | null;
  active_ban_reason: string | null;
  active_ban_expires_at: string | null;
  last_seen_at: string | null;
};

type SecurityIpDetail = {
  ip: string;
  stats: {
    registered_user_count: number;
    seen_user_count: number;
    free_ai_request_count: number;
    rate_limited_count: number;
  };
  active_ban: IpBanSummary | null;
  users: Array<{
    id: number;
    email: string;
    name: string;
    status: string;
    plan: string;
    created_at: string;
    registration_ip: string | null;
    last_seen_ip: string | null;
    last_seen_at: string | null;
  }>;
  recent_events: Array<{
    id: number;
    event_type: string;
    route: string | null;
    user_id: number | null;
    created_at: string;
  }>;
};

type AddUserForm = {
  name: string;
  email: string;
  plan: "free" | "plus";
  days: string;
};

type AccessState = "loading" | "allowed" | "forbidden" | "unauthenticated" | "error";
type UserFilter = "all" | "free" | "plus" | "inactive_plus";
type PlanAction = { user: AdminUser; plan: "free" | "plus" };

const initialAddUserForm: AddUserForm = {
  name: "",
  email: "",
  plan: "free",
  days: "30",
};

const filterLabels: Record<UserFilter, string> = {
  all: "全部",
  free: "Free",
  plus: "Plus",
  inactive_plus: "Plus 过期",
};

export function AdminClient() {
  const [backendUrl, setBackendUrl] = useState(defaultBackendUrl);
  const [sessionToken, setSessionToken] = useState("");
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);
  const [access, setAccess] = useState<AccessState>("loading");
  const [status, setStatus] = useState("正在验证管理员权限...");
  const [adminData, setAdminData] = useState<AdminUsersResponse | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<UserFilter>("all");
  const [showAddUser, setShowAddUser] = useState(false);
  const [addUserForm, setAddUserForm] = useState<AddUserForm>(initialAddUserForm);
  const [issuedCredentials, setIssuedCredentials] = useState<AdminCreateUserResponse | null>(null);
  const [planTarget, setPlanTarget] = useState<PlanAction | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [banTarget, setBanTarget] = useState<AdminUser | null>(null);
  const [banReason, setBanReason] = useState("abusive registration or free AI usage");
  const [securityIps, setSecurityIps] = useState<SecurityIpSummary[]>([]);
  const [showSecurityPanel, setShowSecurityPanel] = useState(false);
  const [ipDetail, setIpDetail] = useState<SecurityIpDetail | null>(null);
  const [ipBanReason, setIpBanReason] = useState("abusive registrations or free AI usage");
  const [showQuotaReset, setShowQuotaReset] = useState(false);
  const [quotaResetConfirmation, setQuotaResetConfirmation] = useState("");
  const [busyAction, setBusyAction] = useState("");

  const normalizedBackendUrl = useMemo(
    () => backendUrl.replace(/\/+$/, ""),
    [backendUrl],
  );

  const loadUsers = useCallback(async (token: string) => {
    if (!token) return;
    setStatus("正在读取用户...");

    try {
      const response = await fetch(`${normalizedBackendUrl}/admin/users`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (response.status === 401) {
        clearSession();
        setAccess("unauthenticated");
        window.location.href = "/login";
        return;
      }
      if (response.status === 403) {
        setAdminData(null);
        setAccess("forbidden");
        setStatus("当前账号没有管理员权限。");
        return;
      }
      if (!response.ok) throw new Error(await errorText(response));

      setAdminData((await response.json()) as AdminUsersResponse);
      setAccess("allowed");
      setStatus("已连接");
    } catch (error) {
      setAccess("error");
      setStatus(error instanceof Error ? error.message : "管理后台读取失败");
    }
  }, [normalizedBackendUrl]);

  const loadSecurityIps = useCallback(async (token: string) => {
    if (!token) return;
    setStatus("正在读取 IP 风控...");

    try {
      const response = await fetch(`${normalizedBackendUrl}/admin/security/ips`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!response.ok) throw new Error(await errorText(response));
      const payload = (await response.json()) as { ips: SecurityIpSummary[] };
      setSecurityIps(payload.ips);
      setShowSecurityPanel(true);
      setStatus("IP 风控已更新");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "IP 风控读取失败");
    }
  }, [normalizedBackendUrl]);

  const openIpDetail = useCallback(async (ip: string) => {
    if (!sessionToken) return;
    setStatus(`正在读取 ${ip}...`);

    try {
      const response = await fetch(
        `${normalizedBackendUrl}/admin/security/ip-detail?ip=${encodeURIComponent(ip)}`,
        {
          headers: {
            Authorization: `Bearer ${sessionToken}`,
          },
        },
      );
      if (!response.ok) throw new Error(await errorText(response));
      setIpDetail((await response.json()) as SecurityIpDetail);
      setIpBanReason("abusive registrations or free AI usage");
      setStatus("IP 明细已读取");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "IP 明细读取失败");
    }
  }, [normalizedBackendUrl, sessionToken]);

  useEffect(() => {
    const token = window.localStorage.getItem("openachieve_session_token") ?? "";
    const storedUser = readStoredUser();
    setSessionToken(token);
    setCurrentUserId(storedUser?.id ?? null);

    if (!token) {
      setAccess("unauthenticated");
      window.location.href = "/login";
      return;
    }

    void loadUsers(token);
  }, [loadUsers]);

  const filteredUsers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return (adminData?.users ?? []).filter((user) => {
      const matchesQuery =
        !normalizedQuery ||
        user.email.toLowerCase().includes(normalizedQuery) ||
        user.name.toLowerCase().includes(normalizedQuery);
      const matchesFilter =
        filter === "all" ||
        (filter === "free" && user.plan === "free" && user.stored_plan === "free") ||
        (filter === "plus" && user.plan === "plus") ||
        (filter === "inactive_plus" && user.stored_plan === "plus" && user.plan !== "plus");

      return matchesQuery && matchesFilter;
    });
  }, [adminData?.users, filter, query]);

  async function createUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!sessionToken) return;
    setBusyAction("create");
    setStatus("正在添加用户...");

    try {
      const response = await fetch(`${normalizedBackendUrl}/admin/users`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${sessionToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: addUserForm.name,
          email: addUserForm.email,
          plan: addUserForm.plan,
          days: addUserForm.plan === "plus" ? Number(addUserForm.days || 30) : undefined,
        }),
      });
      if (!response.ok) throw new Error(await errorText(response));
      const issued = (await response.json()) as AdminCreateUserResponse;
      setIssuedCredentials(issued);
      setAddUserForm(initialAddUserForm);
      setShowAddUser(false);
      setStatus("用户已添加");
      await loadUsers(sessionToken);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "添加用户失败");
    } finally {
      setBusyAction("");
    }
  }

  async function updatePlan(user: AdminUser, plan: "free" | "plus") {
    if (!sessionToken) return;
    const actionId = `${plan}-${user.id}`;
    setBusyAction(actionId);
    setStatus(plan === "plus" ? "正在升级用户..." : "正在降级用户...");

    try {
      const response = await fetch(`${normalizedBackendUrl}/admin/users/${user.id}/plan`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${sessionToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          plan,
          days: plan === "plus" ? 30 : undefined,
        }),
      });
      if (!response.ok) throw new Error(await errorText(response));
      setStatus(plan === "plus" ? "已开通 Plus" : "已降级 Free");
      setPlanTarget(null);
      await loadUsers(sessionToken);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "套餐更新失败");
    } finally {
      setBusyAction("");
    }
  }

  async function banUserNow() {
    if (!sessionToken || !banTarget) return;
    setBusyAction(`ban-${banTarget.id}`);
    setStatus("正在冻结账号...");

    try {
      const response = await fetch(`${normalizedBackendUrl}/admin/users/${banTarget.id}/ban`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${sessionToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ reason: banReason }),
      });
      if (!response.ok) throw new Error(await errorText(response));
      setBanTarget(null);
      setStatus("账号已冻结");
      await loadUsers(sessionToken);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "冻结账号失败");
    } finally {
      setBusyAction("");
    }
  }

  async function unbanUserNow(user: AdminUser) {
    if (!sessionToken) return;
    setBusyAction(`unban-${user.id}`);
    setStatus("正在解封账号...");

    try {
      const response = await fetch(`${normalizedBackendUrl}/admin/users/${user.id}/unban`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${sessionToken}`,
        },
      });
      if (!response.ok) throw new Error(await errorText(response));
      setStatus("账号已解封");
      await loadUsers(sessionToken);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "解封账号失败");
    } finally {
      setBusyAction("");
    }
  }

  async function banIp(ip: string) {
    if (!sessionToken) return;
    setBusyAction(`ban-ip-${ip}`);
    setStatus("正在封禁 IP...");

    try {
      const response = await fetch(`${normalizedBackendUrl}/admin/security/ip-bans`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${sessionToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ip, reason: ipBanReason }),
      });
      if (!response.ok) throw new Error(await errorText(response));
      setStatus("IP 已封禁");
      await loadSecurityIps(sessionToken);
      await openIpDetail(ip);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "封禁 IP 失败");
    } finally {
      setBusyAction("");
    }
  }

  async function unbanIp(banId: number, ip: string) {
    if (!sessionToken) return;
    setBusyAction(`unban-ip-${banId}`);
    setStatus("正在解封 IP...");

    try {
      const response = await fetch(`${normalizedBackendUrl}/admin/security/ip-bans/${banId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${sessionToken}`,
        },
      });
      if (!response.ok) throw new Error(await errorText(response));
      setStatus("IP 已解封");
      await loadSecurityIps(sessionToken);
      await openIpDetail(ip);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "解封 IP 失败");
    } finally {
      setBusyAction("");
    }
  }

  async function deleteUser() {
    if (!sessionToken || !deleteTarget || deleteConfirmation !== deleteTarget.email) return;
    setBusyAction(`delete-${deleteTarget.id}`);
    setStatus("正在删除用户...");

    try {
      const response = await fetch(`${normalizedBackendUrl}/admin/users/${deleteTarget.id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${sessionToken}`,
        },
      });
      if (!response.ok) throw new Error(await errorText(response));
      setStatus("用户已删除");
      setDeleteTarget(null);
      setDeleteConfirmation("");
      await loadUsers(sessionToken);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "删除用户失败");
    } finally {
      setBusyAction("");
    }
  }

  async function resetAllQuota() {
    if (!sessionToken || quotaResetConfirmation !== "RESET") return;
    setBusyAction("reset-quota");
    setStatus("正在重置全部额度...");

    try {
      const response = await fetch(`${normalizedBackendUrl}/admin/quota-resets`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${sessionToken}`,
        },
      });
      if (!response.ok) throw new Error(await errorText(response));
      const result = (await response.json()) as AdminQuotaResetResponse;
      setStatus(`已重置 ${result.users_affected.toLocaleString()} 个用户的额度`);
      setShowQuotaReset(false);
      setQuotaResetConfirmation("");
      await loadUsers(sessionToken);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "额度重置失败");
    } finally {
      setBusyAction("");
    }
  }

  async function copy(text: string) {
    await navigator.clipboard.writeText(text);
    setStatus("已复制到剪贴板");
  }

  return (
    <main className="admin-page">
      <section className="admin-shell">
        <SiteHeader active="admin" variant="workspace" />

        <section className="hero-band">
          <div>
            <p>Admin</p>
            <h1>管理后台</h1>
            <span>{status}</span>
          </div>
          <label>
            后端地址
            <input
              aria-label="后端地址"
              value={backendUrl}
              onChange={(event) => setBackendUrl(event.target.value)}
            />
          </label>
        </section>

        {access === "loading" && <section className="empty-state">正在验证管理员权限...</section>}

        {access === "forbidden" && (
          <section className="empty-state">
            <h2>无权限</h2>
            <p>当前账号不是管理员，无法查看用户数据。</p>
            <Link className={buttonVariants({ variant: "default" })} href="/account">
              返回账号总览
            </Link>
          </section>
        )}

        {access === "error" && (
          <section className="empty-state">
            <h2>读取失败</h2>
            <p>{status}</p>
            <Button type="button" onClick={() => loadUsers(sessionToken)}>
              重试
            </Button>
          </section>
        )}

        {access === "allowed" && adminData && (
          <>
            <section className="stats-grid" aria-label="用户统计">
              <StatBlock label="总用户" value={adminData.stats.total_users} />
              <StatBlock label="Free" value={adminData.stats.free_users} />
              <StatBlock label="Plus" value={adminData.stats.plus_users} />
              <StatBlock label="Plus 过期" value={adminData.stats.inactive_plus_users} />
            </section>

            {issuedCredentials && (
              <section className="issued-panel">
                <div>
                  <p>一次性凭证</p>
                  <h2>{issuedCredentials.user.email}</h2>
                  <span>临时密码和 API Key 只在这里显示一次。</span>
                </div>
                <div className="issued-grid">
                  <Credential label="临时密码" value={issuedCredentials.temporary_password} onCopy={copy} />
                  <Credential label="API Key" value={issuedCredentials.api_key.key} onCopy={copy} />
                </div>
                <Button variant="secondary" type="button" onClick={() => setIssuedCredentials(null)}>
                  关闭
                </Button>
              </section>
            )}

            <section className="toolbar">
              <input
                aria-label="搜索用户"
                placeholder="搜索邮箱或姓名"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              <div className="segments" aria-label="用户筛选">
                {(Object.keys(filterLabels) as UserFilter[]).map((key) => (
                  <button
                    className={filter === key ? "active" : ""}
                    key={key}
                    type="button"
                    onClick={() => setFilter(key)}
                  >
                    {filterLabels[key]}
                  </button>
                ))}
              </div>
              <Button type="button" onClick={() => setShowAddUser(true)}>
                添加用户
              </Button>
              <Button variant="secondary" type="button" onClick={() => loadSecurityIps(sessionToken)}>
                <Network data-icon="inline-start" />
                IP 风控
              </Button>
              <Button
                variant="destructive"
                type="button"
                onClick={() => {
                  setQuotaResetConfirmation("");
                  setShowQuotaReset(true);
                }}
              >
                重置全部额度
              </Button>
              <Button variant="secondary" type="button" onClick={() => loadUsers(sessionToken)}>
                刷新
              </Button>
            </section>

            {showSecurityPanel && (
              <section className="security-panel">
                <div className="panel-head">
                  <div>
                    <p>Security</p>
                    <h2>IP 风控</h2>
                  </div>
                  <Button variant="secondary" size="sm" type="button" onClick={() => loadSecurityIps(sessionToken)}>
                    刷新 IP
                  </Button>
                </div>
                <div className="ip-grid">
                  {securityIps.map((item) => (
                    <article className="ip-row" key={item.ip}>
                      <div>
                        <strong>{item.ip}</strong>
                        <span>
                          注册 {item.registered_user_count} · 关联 {item.seen_user_count} · Free/Zen 请求{" "}
                          {item.free_ai_request_count}
                        </span>
                        <small>
                          限流 {item.rate_limited_count}
                          {item.active_ban_id ? ` · 已封禁：${item.active_ban_reason}` : ""}
                        </small>
                      </div>
                      <div className="actions-cell">
                        <Button size="sm" variant="secondary" type="button" onClick={() => openIpDetail(item.ip)}>
                          <Eye data-icon="inline-start" />
                          明细
                        </Button>
                        {item.active_ban_id ? (
                          <Button
                            size="sm"
                            variant="secondary"
                            type="button"
                            disabled={busyAction === `unban-ip-${item.active_ban_id}`}
                            onClick={() => unbanIp(item.active_ban_id!, item.ip)}
                          >
                            <ShieldCheck data-icon="inline-start" />
                            解封 IP
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="destructive"
                            type="button"
                            disabled={busyAction === `ban-ip-${item.ip}`}
                            onClick={() => banIp(item.ip)}
                          >
                            <ShieldX data-icon="inline-start" />
                            封 IP
                          </Button>
                        )}
                      </div>
                    </article>
                  ))}
                  {securityIps.length === 0 && <p className="empty-row">暂无 IP 风控记录。</p>}
                </div>
              </section>
            )}

            <section className="user-table">
              <div className="table-head">
                <span>用户</span>
                <span>套餐</span>
                <span>用量</span>
                <span>Key</span>
                <span>最后活跃</span>
                <span>操作</span>
              </div>
              {filteredUsers.map((user) => {
                const isSelf = currentUserId === user.id;
                return (
                  <article className="table-row" key={user.id}>
                    <div className="identity-cell">
                      <div className="identity-title">
                        <strong>{user.name}</strong>
                        <StatusBadge user={user} />
                      </div>
                      <span>{user.email}</span>
                      <small>{user.is_admin ? "管理员" : `注册于 ${formatDate(user.created_at)}`}</small>
                      <div className="ip-links">
                        {user.registration_ip && (
                          <button type="button" onClick={() => openIpDetail(user.registration_ip!)}>
                            注册 IP {user.registration_ip}
                          </button>
                        )}
                        {user.last_seen_ip && user.last_seen_ip !== user.registration_ip && (
                          <button type="button" onClick={() => openIpDetail(user.last_seen_ip!)}>
                            最后 IP {user.last_seen_ip}
                          </button>
                        )}
                      </div>
                    </div>
                    <div>
                      <PlanBadge user={user} />
                      <small>{user.plus_expires_at ? `到期 ${formatDate(user.plus_expires_at)}` : "无到期时间"}</small>
                    </div>
                    <div>
                      <strong>
                        {user.requests_this_month.toLocaleString()} / {user.monthly_request_limit.toLocaleString()}
                      </strong>
                      <span>剩余 {user.remaining_requests.toLocaleString()}</span>
                    </div>
                    <div>
                      <strong>{user.api_key_count}</strong>
                      <span>个 Key</span>
                    </div>
                    <div>
                      <span>{user.last_used_at ? formatDate(user.last_used_at) : "暂无调用"}</span>
                      {(user.recent_rate_limit_count > 0 || user.active_ip_ban_count > 0) && (
                        <small>
                          限流 {user.recent_rate_limit_count} · IP 封禁 {user.active_ip_ban_count}
                        </small>
                      )}
                    </div>
                    <div className="actions-cell">
                      <Button
                        size="sm"
                        type="button"
                        disabled={busyAction === `plus-${user.id}` || user.plan === "plus"}
                        onClick={() => setPlanTarget({ user, plan: "plus" })}
                      >
                        升级 Plus
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        type="button"
                        disabled={busyAction === `free-${user.id}` || isSelf || user.plan !== "plus"}
                        onClick={() => setPlanTarget({ user, plan: "free" })}
                      >
                        降级 Free
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        type="button"
                        disabled={isSelf || user.status === "banned"}
                        onClick={() => {
                          setBanTarget(user);
                          setBanReason("abusive registration or free AI usage");
                        }}
                      >
                        <Ban data-icon="inline-start" />
                        封号
                      </Button>
                      {user.status === "banned" && (
                        <Button
                          size="sm"
                          variant="secondary"
                          type="button"
                          disabled={busyAction === `unban-${user.id}`}
                          onClick={() => unbanUserNow(user)}
                        >
                          <ShieldCheck data-icon="inline-start" />
                          解封
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="secondary"
                        type="button"
                        disabled={isSelf}
                        onClick={() => setDeleteTarget(user)}
                      >
                        删除
                      </Button>
                    </div>
                  </article>
                );
              })}
              {filteredUsers.length === 0 && <p className="empty-row">没有匹配的用户。</p>}
            </section>
          </>
        )}
      </section>
      <SiteFooter />

      {showAddUser && (
        <div className="modal-backdrop" role="presentation">
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="add-user-title">
            <div className="modal-head">
              <div>
                <p>New User</p>
                <h2 id="add-user-title">添加用户</h2>
              </div>
              <button type="button" onClick={() => setShowAddUser(false)} aria-label="关闭">
                ×
              </button>
            </div>
            <form onSubmit={createUser}>
              <label>
                姓名
                <input
                  required
                  minLength={2}
                  value={addUserForm.name}
                  onChange={(event) => setAddUserForm((form) => ({ ...form, name: event.target.value }))}
                />
              </label>
              <label>
                邮箱
                <input
                  required
                  type="email"
                  value={addUserForm.email}
                  onChange={(event) => setAddUserForm((form) => ({ ...form, email: event.target.value }))}
                />
              </label>
              <label>
                套餐
                <select
                  value={addUserForm.plan}
                  onChange={(event) =>
                    setAddUserForm((form) => ({ ...form, plan: event.target.value as "free" | "plus" }))
                  }
                >
                  <option value="free">Free</option>
                  <option value="plus">Plus</option>
                </select>
              </label>
              {addUserForm.plan === "plus" && (
                <label>
                  Plus 天数
                  <input
                    max={365}
                    min={1}
                    type="number"
                    value={addUserForm.days}
                    onChange={(event) => setAddUserForm((form) => ({ ...form, days: event.target.value }))}
                  />
                </label>
              )}
              <div className="modal-actions">
                <Button variant="secondary" type="button" onClick={() => setShowAddUser(false)}>
                  取消
                </Button>
                <Button type="submit" disabled={busyAction === "create"}>
                  {busyAction === "create" ? "添加中..." : "添加"}
                </Button>
              </div>
            </form>
          </section>
        </div>
      )}

      {planTarget && (
        <div className="modal-backdrop" role="presentation">
          <section className="modal danger" role="dialog" aria-modal="true" aria-labelledby="plan-user-title">
            <div className="modal-head">
              <div>
                <p>{planTarget.plan === "plus" ? "Upgrade" : "Downgrade"}</p>
                <h2 id="plan-user-title">{planTarget.plan === "plus" ? "确认升级" : "确认降级"}</h2>
              </div>
              <button type="button" onClick={() => setPlanTarget(null)} aria-label="关闭">
                ×
              </button>
            </div>
            <p className="danger-copy">
              {planTarget.plan === "plus"
                ? `将 ${planTarget.user.email} 开通 Plus 30 天，额度调整为 1,500 次/月。`
                : `将 ${planTarget.user.email} 降级为 Free，Plus 到期时间会清空，额度调整为 500 次/月。`}
            </p>
            <div className="modal-actions">
              <Button variant="secondary" type="button" onClick={() => setPlanTarget(null)}>
                取消
              </Button>
              <Button
                variant={planTarget.plan === "plus" ? "default" : "destructive"}
                type="button"
                disabled={busyAction === `${planTarget.plan}-${planTarget.user.id}`}
                onClick={() => updatePlan(planTarget.user, planTarget.plan)}
              >
                {busyAction === `${planTarget.plan}-${planTarget.user.id}`
                  ? "处理中..."
                  : planTarget.plan === "plus"
                    ? "确认升级"
                    : "确认降级"}
              </Button>
            </div>
          </section>
        </div>
      )}

      {banTarget && (
        <div className="modal-backdrop" role="presentation">
          <section className="modal danger" role="dialog" aria-modal="true" aria-labelledby="ban-user-title">
            <div className="modal-head">
              <div>
                <p>Ban</p>
                <h2 id="ban-user-title">冻结账号</h2>
              </div>
              <button type="button" onClick={() => setBanTarget(null)} aria-label="关闭">
                ×
              </button>
            </div>
            <p className="danger-copy">
              冻结后会撤销当前会话，并拒绝登录、控制台和 API Key 鉴权；用户、Key 和审计记录会保留。目标：{banTarget.email}
            </p>
            <label>
              原因
              <input value={banReason} onChange={(event) => setBanReason(event.target.value)} />
            </label>
            <div className="modal-actions">
              <Button variant="secondary" type="button" onClick={() => setBanTarget(null)}>
                取消
              </Button>
              <Button
                variant="destructive"
                type="button"
                disabled={busyAction === `ban-${banTarget.id}`}
                onClick={banUserNow}
              >
                {busyAction === `ban-${banTarget.id}` ? "冻结中..." : "确认冻结"}
              </Button>
            </div>
          </section>
        </div>
      )}

      {ipDetail && (
        <div className="modal-backdrop" role="presentation">
          <section className="modal ip-modal" role="dialog" aria-modal="true" aria-labelledby="ip-detail-title">
            <div className="modal-head">
              <div>
                <p>IP Detail</p>
                <h2 id="ip-detail-title">{ipDetail.ip}</h2>
              </div>
              <button type="button" onClick={() => setIpDetail(null)} aria-label="关闭">
                ×
              </button>
            </div>
            <div className="detail-stats">
              <StatBlock label="注册账号" value={ipDetail.stats.registered_user_count} />
              <StatBlock label="关联账号" value={ipDetail.stats.seen_user_count} />
              <StatBlock label="Free/Zen 请求" value={ipDetail.stats.free_ai_request_count} />
              <StatBlock label="近7天限流" value={ipDetail.stats.rate_limited_count} />
            </div>
            <label>
              IP 封禁原因
              <input value={ipBanReason} onChange={(event) => setIpBanReason(event.target.value)} />
            </label>
            <div className="modal-actions">
              {ipDetail.active_ban ? (
                <Button
                  variant="secondary"
                  type="button"
                  disabled={busyAction === `unban-ip-${ipDetail.active_ban.id}`}
                  onClick={() => unbanIp(ipDetail.active_ban!.id, ipDetail.ip)}
                >
                  <ShieldCheck data-icon="inline-start" />
                  解封 IP
                </Button>
              ) : (
                <Button
                  variant="destructive"
                  type="button"
                  disabled={busyAction === `ban-ip-${ipDetail.ip}`}
                  onClick={() => banIp(ipDetail.ip)}
                >
                  <ShieldX data-icon="inline-start" />
                  封禁 IP
                </Button>
              )}
            </div>
            <div className="detail-list">
              <h3>关联账号</h3>
              {ipDetail.users.map((user) => (
                <article key={user.id}>
                  <strong>{user.email}</strong>
                  <span>
                    {user.name} · {user.plan} · {user.status}
                  </span>
                  <small>注册 {formatDate(user.created_at)}</small>
                </article>
              ))}
              {ipDetail.users.length === 0 && <p className="empty-row">暂无关联账号。</p>}
            </div>
            <div className="detail-list">
              <h3>最近事件</h3>
              {ipDetail.recent_events.map((event) => (
                <article key={event.id}>
                  <strong>{event.event_type}</strong>
                  <span>{event.route ?? "system"}</span>
                  <small>{formatDate(event.created_at)}</small>
                </article>
              ))}
              {ipDetail.recent_events.length === 0 && <p className="empty-row">暂无事件。</p>}
            </div>
          </section>
        </div>
      )}

      {showQuotaReset && (
        <div className="modal-backdrop" role="presentation">
          <section className="modal danger" role="dialog" aria-modal="true" aria-labelledby="reset-quota-title">
            <div className="modal-head">
              <div>
                <p>Reset</p>
                <h2 id="reset-quota-title">重置全部额度</h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowQuotaReset(false);
                  setQuotaResetConfirmation("");
                }}
                aria-label="关闭"
              >
                ×
              </button>
            </div>
            <p className="danger-copy">
              这会让所有用户从现在开始重新计算本月额度。历史调用记录会保留，套餐、Plus 到期时间和 API Key 不会改变。请输入 RESET 确认。
            </p>
            <input
              aria-label="确认重置额度"
              value={quotaResetConfirmation}
              onChange={(event) => setQuotaResetConfirmation(event.target.value)}
            />
            <div className="modal-actions">
              <Button
                variant="secondary"
                type="button"
                onClick={() => {
                  setShowQuotaReset(false);
                  setQuotaResetConfirmation("");
                }}
              >
                取消
              </Button>
              <Button
                variant="destructive"
                type="button"
                disabled={quotaResetConfirmation !== "RESET" || busyAction === "reset-quota"}
                onClick={resetAllQuota}
              >
                {busyAction === "reset-quota" ? "重置中..." : "确认重置"}
              </Button>
            </div>
          </section>
        </div>
      )}

      {deleteTarget && (
        <div className="modal-backdrop" role="presentation">
          <section className="modal danger" role="dialog" aria-modal="true" aria-labelledby="delete-user-title">
            <div className="modal-head">
              <div>
                <p>Delete</p>
                <h2 id="delete-user-title">删除用户</h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  setDeleteTarget(null);
                  setDeleteConfirmation("");
                }}
                aria-label="关闭"
              >
                ×
              </button>
            </div>
            <p className="danger-copy">
              删除会永久移除该用户、API Key 和登录会话，历史调用记录会保留为审计记录。此操作无法恢复，请输入邮箱确认：{deleteTarget.email}
            </p>
            <input
              aria-label="确认删除邮箱"
              value={deleteConfirmation}
              onChange={(event) => setDeleteConfirmation(event.target.value)}
            />
            <div className="modal-actions">
              <Button
                variant="secondary"
                type="button"
                onClick={() => {
                  setDeleteTarget(null);
                  setDeleteConfirmation("");
                }}
              >
                取消
              </Button>
              <Button
                type="button"
                disabled={deleteConfirmation !== deleteTarget.email || busyAction === `delete-${deleteTarget.id}`}
                onClick={deleteUser}
              >
                {busyAction === `delete-${deleteTarget.id}` ? "删除中..." : "确认删除"}
              </Button>
            </div>
          </section>
        </div>
      )}

      <style jsx>{`
        .admin-page {
          min-height: 100vh;
          overflow-x: hidden;
          padding: 0 38px 72px;
          color: #141413;
          background:
            radial-gradient(circle at 12% 10%, rgba(201, 100, 66, 0.08), transparent 28rem),
            linear-gradient(135deg, #f5f4ed 0%, #eee9dc 100%);
          font-family: -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Noto Sans SC",
            "Microsoft YaHei", system-ui, sans-serif;
        }

        .admin-shell {
          width: min(1240px, 100%);
          margin: 0 auto;
        }

        .hero-band {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(240px, 360px);
          gap: 24px;
          align-items: end;
          border-bottom: 1px solid #dedacf;
          padding: 48px 0 30px;
        }

        .hero-band p,
        .issued-panel p,
        .security-panel p,
        .modal-head p {
          margin: 0 0 8px;
          color: #c96442;
          font-size: 12px;
          font-weight: 800;
          letter-spacing: 0.12em;
          text-transform: uppercase;
        }

        h1,
        h2 {
          margin: 0;
          letter-spacing: 0;
        }

        h1 {
          font-family: "Iowan Old Style", "Yu Mincho", "Hiragino Mincho ProN", Georgia, serif;
          font-size: clamp(54px, 8vw, 104px);
          font-weight: 500;
          line-height: 0.96;
        }

        .hero-band span,
        .issued-panel span,
        .table-row span,
        .table-row small,
        .empty-state p,
        .danger-copy {
          color: #6a6861;
        }

        label {
          display: grid;
          gap: 8px;
          color: #5e5d59;
          font-size: 13px;
          font-weight: 800;
        }

        input,
        select {
          width: 100%;
          min-height: 44px;
          border: 1px solid #d8d5ca;
          border-radius: 10px;
          padding: 0 12px;
          color: #141413;
          background: rgba(250, 249, 245, 0.92);
          font: inherit;
        }

        .stats-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 12px;
          margin: 22px 0;
        }

        :global(.stat-block),
        .issued-panel,
        .security-panel,
        .toolbar,
        .user-table,
        .empty-state,
        .modal {
          border: 1px solid #dedacf;
          border-radius: 8px;
          background: rgba(250, 249, 245, 0.86);
          box-shadow: 0 18px 46px rgba(20, 20, 19, 0.06);
        }

        :global(.stat-block) {
          min-height: 108px;
          display: grid;
          align-content: center;
          gap: 8px;
          padding: 18px;
        }

        :global(.stat-block span) {
          color: #6a6861;
          font-size: 13px;
          font-weight: 800;
        }

        :global(.stat-block strong) {
          font-size: 34px;
          line-height: 1;
        }

        .issued-panel {
          display: grid;
          gap: 16px;
          margin-bottom: 18px;
          padding: 18px;
        }

        .issued-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
        }

        :global(.credential) {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 10px;
          align-items: center;
          border: 1px solid #e8e6dc;
          border-radius: 8px;
          padding: 12px;
          background: #fffdf8;
        }

        :global(.credential span) {
          display: block;
          margin-bottom: 6px;
          color: #6a6861;
          font-size: 12px;
          font-weight: 800;
        }

        :global(.credential code) {
          display: block;
          min-width: 0;
          overflow-wrap: anywhere;
          font-size: 13px;
        }

        .toolbar {
          display: grid;
          grid-template-columns: minmax(220px, 1fr) auto auto auto auto auto;
          gap: 12px;
          align-items: center;
          margin-bottom: 18px;
          padding: 14px;
        }

        .segments {
          display: inline-grid;
          grid-auto-flow: column;
          gap: 4px;
          border: 1px solid #d8d5ca;
          border-radius: 10px;
          padding: 4px;
          background: #fffdf8;
        }

        .segments button {
          min-height: 34px;
          border: 0;
          border-radius: 8px;
          padding: 0 12px;
          color: #5e5d59;
          background: transparent;
          font-weight: 800;
        }

        .segments button.active {
          color: #141413;
          background: #e8e6dc;
        }

        .user-table {
          overflow: hidden;
        }

        .security-panel {
          display: grid;
          gap: 14px;
          margin-bottom: 18px;
          padding: 16px;
        }

        .panel-head,
        .ip-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 14px;
        }

        .ip-grid {
          display: grid;
          gap: 10px;
        }

        .ip-row {
          border: 1px solid #e8e6dc;
          border-radius: 8px;
          padding: 12px;
          background: #fffdf8;
        }

        .ip-row > div:first-child {
          min-width: 0;
          display: grid;
          gap: 4px;
        }

        .table-head,
        .table-row {
          display: grid;
          grid-template-columns: minmax(220px, 1.35fr) minmax(140px, 0.85fr) minmax(140px, 0.8fr) minmax(74px, 0.45fr) minmax(140px, 0.75fr) minmax(250px, 1.25fr);
          gap: 14px;
          align-items: center;
          padding: 14px 16px;
        }

        .table-head {
          color: #6a6861;
          background: rgba(232, 230, 220, 0.68);
          font-size: 12px;
          font-weight: 900;
          text-transform: uppercase;
        }

        .table-row {
          border-top: 1px solid #e8e6dc;
        }

        .table-row > div,
        .identity-cell {
          min-width: 0;
          display: grid;
          gap: 4px;
        }

        .identity-cell strong,
        .identity-cell span {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .identity-title,
        .ip-links {
          display: flex;
          min-width: 0;
          flex-wrap: wrap;
          align-items: center;
          gap: 8px;
        }

        .ip-links button {
          border: 0;
          padding: 0;
          color: #8b3f2b;
          background: transparent;
          font: inherit;
          font-size: 12px;
          font-weight: 800;
          text-align: left;
        }

        :global(.plan-badge) {
          width: fit-content;
          border-radius: 999px;
          padding: 5px 10px;
          font-size: 12px;
          font-weight: 900;
          color: #141413;
          background: #e8e6dc;
        }

        :global(.plan-badge.plus) {
          color: #fffaf1;
          background: #141413;
        }

        :global(.plan-badge.expired) {
          color: #8b3f2b;
          background: #f1d7ca;
        }

        :global(.status-badge) {
          width: fit-content;
          border-radius: 999px;
          padding: 4px 8px;
          color: #23533a;
          background: #d9eadf;
          font-size: 11px;
          font-weight: 900;
        }

        :global(.status-badge.banned) {
          color: #8b3f2b;
          background: #f1d7ca;
        }

        .actions-cell {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .empty-row,
        .empty-state {
          padding: 28px;
          text-align: center;
        }

        .empty-state {
          display: grid;
          place-items: center;
          gap: 12px;
          margin-top: 24px;
        }

        .modal-backdrop {
          position: fixed;
          inset: 0;
          z-index: 50;
          display: grid;
          place-items: center;
          padding: 20px;
          background: rgba(20, 20, 19, 0.38);
        }

        .modal {
          width: min(480px, 100%);
          display: grid;
          gap: 18px;
          padding: 18px;
        }

        .ip-modal {
          width: min(760px, 100%);
          max-height: min(86vh, 900px);
          overflow: auto;
        }

        .detail-stats {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 10px;
        }

        .detail-list {
          display: grid;
          gap: 8px;
        }

        .detail-list h3 {
          margin: 0;
          font-size: 14px;
        }

        .detail-list article {
          display: grid;
          gap: 3px;
          border: 1px solid #e8e6dc;
          border-radius: 8px;
          padding: 10px;
          background: #fffdf8;
        }

        .modal form {
          display: grid;
          gap: 14px;
        }

        .modal-head,
        .modal-actions {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }

        .modal-head button {
          width: 36px;
          height: 36px;
          border: 1px solid #d8d5ca;
          border-radius: 10px;
          background: #fffdf8;
          color: #141413;
          font-size: 22px;
          line-height: 1;
        }

        .modal-actions {
          justify-content: flex-end;
        }

        .danger {
          border-color: #c96442;
        }

        @media (max-width: 1100px) {
          .stats-grid,
          .detail-stats,
          .issued-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .toolbar {
            grid-template-columns: 1fr;
          }

          .segments {
            grid-auto-flow: row;
            grid-template-columns: repeat(4, minmax(0, 1fr));
          }

          .table-head {
            display: none;
          }

          .table-row {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }

        @media (max-width: 640px) {
          .admin-page {
            padding: 0 18px 52px;
          }

          .hero-band,
          .stats-grid,
          .detail-stats,
          .issued-grid,
          .table-row {
            grid-template-columns: 1fr;
          }

          .segments {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }
      `}</style>
    </main>
  );
}

function StatBlock({ label, value }: { label: string; value: number }) {
  return (
    <div className="stat-block">
      <span>{label}</span>
      <strong>{value.toLocaleString()}</strong>
    </div>
  );
}

function Credential({
  label,
  value,
  onCopy,
}: {
  label: string;
  value: string;
  onCopy: (value: string) => Promise<void>;
}) {
  return (
    <div className="credential">
      <div>
        <span>{label}</span>
        <code>{value}</code>
      </div>
      <Button variant="secondary" type="button" onClick={() => onCopy(value)}>
        复制
      </Button>
    </div>
  );
}

function PlanBadge({ user }: { user: AdminUser }) {
  const expiredPlus = user.stored_plan === "plus" && user.plan !== "plus";
  const className = `plan-badge ${user.plan === "plus" ? "plus" : ""} ${expiredPlus ? "expired" : ""}`;
  const label = expiredPlus ? "Plus 过期" : user.plan === "plus" ? "Plus" : "Free";

  return <strong className={className}>{label}</strong>;
}

function StatusBadge({ user }: { user: AdminUser }) {
  const banned = user.status === "banned";
  return <span className={`status-badge ${banned ? "banned" : ""}`}>{banned ? "封禁" : "正常"}</span>;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

async function errorText(response: Response) {
  try {
    const payload = (await response.json()) as { error?: { message?: string } };
    return payload.error?.message ?? `${response.status} ${response.statusText}`;
  } catch {
    return `${response.status} ${response.statusText}`;
  }
}

function readStoredUser(): { id: number } | null {
  try {
    const raw = window.localStorage.getItem("openachieve_user");
    return raw ? (JSON.parse(raw) as { id: number }) : null;
  } catch {
    return null;
  }
}

function clearSession() {
  window.localStorage.removeItem("openachieve_session_token");
  window.localStorage.removeItem("openachieve_user");
}
