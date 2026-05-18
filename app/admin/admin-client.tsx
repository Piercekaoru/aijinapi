"use client";

import Link from "next/link";
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
  status: string;
  banned_at: string | null;
  banned_reason: string | null;
  registration_ip: string | null;
  last_seen_ip: string | null;
  last_seen_at: string | null;
  api_key_count: number;
  last_used_at: string | null;
  is_admin: boolean;
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

type IpBan = {
  id: number;
  ip: string;
  reason: string;
  banned_by_user_id: number | null;
  created_at: string;
  expires_at: string | null;
  lifted_at: string | null;
};

type IpDetails = {
  ip: string;
  active_ban: IpBan | null;
  associated_users: Array<{
    id: number;
    email: string;
    name: string;
    status: string;
    plan: string;
    registration_ip: string | null;
    last_seen_ip: string | null;
    created_at: string;
  }>;
  registration_count_1h: number;
  free_ai_request_count_1h: number;
  rate_limit_event_count_24h: number;
  recent_events: Array<{
    id: number;
    event_type: string;
    ip: string | null;
    route: string | null;
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
type BanAction = { user: AdminUser; action: "ban" | "unban" };

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
  const [banTarget, setBanTarget] = useState<BanAction | null>(null);
  const [banReason, setBanReason] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [showQuotaReset, setShowQuotaReset] = useState(false);
  const [quotaResetConfirmation, setQuotaResetConfirmation] = useState("");
  const [ipQuery, setIpQuery] = useState("");
  const [ipDetails, setIpDetails] = useState<IpDetails | null>(null);
  const [ipBanReason, setIpBanReason] = useState("");
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

  async function updateBan() {
    if (!sessionToken || !banTarget) return;
    const { user, action } = banTarget;
    const actionId = `${action}-${user.id}`;
    setBusyAction(actionId);
    setStatus(action === "ban" ? "正在冻结用户..." : "正在解冻用户...");

    try {
      const response = await fetch(`${normalizedBackendUrl}/admin/users/${user.id}/${action}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${sessionToken}`,
          "Content-Type": "application/json",
        },
        body: action === "ban" ? JSON.stringify({ reason: banReason || undefined }) : undefined,
      });
      if (!response.ok) throw new Error(await errorText(response));
      setStatus(action === "ban" ? "用户已冻结" : "用户已解冻");
      setBanTarget(null);
      setBanReason("");
      await loadUsers(sessionToken);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "用户封禁操作失败");
    } finally {
      setBusyAction("");
    }
  }

  async function loadIpDetails(ip = ipQuery) {
    if (!sessionToken || !ip.trim()) return;
    setBusyAction("ip-details");
    setStatus("正在读取 IP 明细...");

    try {
      const response = await fetch(`${normalizedBackendUrl}/admin/ip-details?ip=${encodeURIComponent(ip.trim())}`, {
        headers: {
          Authorization: `Bearer ${sessionToken}`,
        },
      });
      if (!response.ok) throw new Error(await errorText(response));
      setIpDetails((await response.json()) as IpDetails);
      setStatus("IP 明细已更新");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "IP 明细读取失败");
    } finally {
      setBusyAction("");
    }
  }

  async function banIp() {
    if (!sessionToken || !ipQuery.trim()) return;
    setBusyAction("ban-ip");
    setStatus("正在封禁 IP...");

    try {
      const response = await fetch(`${normalizedBackendUrl}/admin/ip-bans`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${sessionToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ip: ipQuery.trim(),
          reason: ipBanReason || undefined,
          hours: 24,
        }),
      });
      if (!response.ok) throw new Error(await errorText(response));
      setIpBanReason("");
      await loadIpDetails(ipQuery);
      setStatus("IP 已封禁");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "IP 封禁失败");
    } finally {
      setBusyAction("");
    }
  }

  async function liftIpBan() {
    if (!sessionToken || !ipDetails?.active_ban) return;
    setBusyAction("lift-ip");
    setStatus("正在解封 IP...");

    try {
      const response = await fetch(`${normalizedBackendUrl}/admin/ip-bans/${ipDetails.active_ban.id}/lift`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${sessionToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ reason: "manual admin unban" }),
      });
      if (!response.ok) throw new Error(await errorText(response));
      await loadIpDetails(ipDetails.ip);
      setStatus("IP 已解封");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "IP 解封失败");
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

            <section className="issued-panel">
              <div>
                <p>Security</p>
                <h2>IP 风控</h2>
                <span>查询真实 IP 的关联账号、限流事件和封禁状态。</span>
              </div>
              <div className="issued-grid">
                <label>
                  IP 地址
                  <input
                    aria-label="IP 地址"
                    placeholder="203.0.113.10"
                    value={ipQuery}
                    onChange={(event) => setIpQuery(event.target.value)}
                  />
                </label>
                <label>
                  封禁原因
                  <input
                    aria-label="封禁原因"
                    placeholder="批量注册或滥用 Free 模型"
                    value={ipBanReason}
                    onChange={(event) => setIpBanReason(event.target.value)}
                  />
                </label>
              </div>
              <div className="modal-actions">
                <Button type="button" variant="secondary" disabled={busyAction === "ip-details"} onClick={() => loadIpDetails()}>
                  查询 IP
                </Button>
                <Button type="button" variant="destructive" disabled={!ipQuery.trim() || busyAction === "ban-ip"} onClick={banIp}>
                  封禁 24 小时
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={!ipDetails?.active_ban || busyAction === "lift-ip"}
                  onClick={liftIpBan}
                >
                  解封 IP
                </Button>
              </div>
              {ipDetails && (
                <div className="ip-details">
                  <strong>{ipDetails.ip}</strong>
                  <span>{ipDetails.active_ban ? `已封禁：${ipDetails.active_ban.reason}` : "未封禁"}</span>
                  <span>近 1 小时注册 {ipDetails.registration_count_1h.toLocaleString()} 次</span>
                  <span>近 1 小时 Free/Zen 调用 {ipDetails.free_ai_request_count_1h.toLocaleString()} 次</span>
                  <span>近 24 小时限流事件 {ipDetails.rate_limit_event_count_24h.toLocaleString()} 次</span>
                  <small>
                    关联账号：
                    {ipDetails.associated_users.length === 0
                      ? "无"
                      : ipDetails.associated_users.map((user) => user.email).join(", ")}
                  </small>
                </div>
              )}
            </section>

            <section className="user-table">
              <div className="table-head">
                <span>用户</span>
                <span>套餐</span>
                <span>用量</span>
                <span>Key</span>
                <span>IP / 状态</span>
                <span>操作</span>
              </div>
              {filteredUsers.map((user) => {
                const isSelf = currentUserId === user.id;
                return (
                  <article className="table-row" key={user.id}>
                    <div className="identity-cell">
                      <strong>{user.name}</strong>
                      <span>{user.email}</span>
                      <small>
                        {user.is_admin ? "管理员" : `注册于 ${formatDate(user.created_at)}`}
                        {user.status === "banned" ? " · 已冻结" : ""}
                      </small>
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
                      <span>{user.last_seen_ip ?? user.registration_ip ?? "暂无 IP"}</span>
                      <small>{user.last_seen_at ? `请求于 ${formatDate(user.last_seen_at)}` : "暂无请求记录"}</small>
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
                        disabled={isSelf}
                        onClick={() => {
                          setBanReason("");
                          setBanTarget({ user, action: user.status === "banned" ? "unban" : "ban" });
                        }}
                      >
                        {user.status === "banned" ? "解冻" : "冻结"}
                      </Button>
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

      {banTarget && (
        <div className="modal-backdrop" role="presentation">
          <section className="modal danger" role="dialog" aria-modal="true" aria-labelledby="ban-user-title">
            <div className="modal-head">
              <div>
                <p>{banTarget.action === "ban" ? "Ban" : "Unban"}</p>
                <h2 id="ban-user-title">{banTarget.action === "ban" ? "冻结用户" : "解冻用户"}</h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  setBanTarget(null);
                  setBanReason("");
                }}
                aria-label="关闭"
              >
                ×
              </button>
            </div>
            <p className="danger-copy">
              {banTarget.action === "ban"
                ? `冻结 ${banTarget.user.email} 会撤销现有 session，并拒绝登录和 API Key 鉴权。`
                : `解冻 ${banTarget.user.email} 后，该用户需要重新登录；关联 IP ban 不会自动解除。`}
            </p>
            {banTarget.action === "ban" && (
              <input
                aria-label="冻结原因"
                placeholder="冻结原因"
                value={banReason}
                onChange={(event) => setBanReason(event.target.value)}
              />
            )}
            <div className="modal-actions">
              <Button
                variant="secondary"
                type="button"
                onClick={() => {
                  setBanTarget(null);
                  setBanReason("");
                }}
              >
                取消
              </Button>
              <Button
                variant={banTarget.action === "ban" ? "destructive" : "default"}
                type="button"
                disabled={busyAction === `${banTarget.action}-${banTarget.user.id}`}
                onClick={updateBan}
              >
                {busyAction === `${banTarget.action}-${banTarget.user.id}` ? "处理中..." : "确认"}
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

        .ip-details {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          align-items: center;
          border: 1px solid #e8e6dc;
          border-radius: 8px;
          padding: 12px;
          background: #fffdf8;
        }

        .ip-details strong,
        .ip-details small {
          flex-basis: 100%;
          overflow-wrap: anywhere;
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
          grid-template-columns: minmax(220px, 1fr) auto auto auto auto;
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
