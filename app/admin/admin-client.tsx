"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import type { Language } from "@/lib/i18n-core";
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

const filterLabels: Record<Language, Record<UserFilter, string>> = {
  zh: {
    all: "全部",
    free: "Free",
    plus: "Plus",
    inactive_plus: "Plus 过期",
  },
  en: {
    all: "All",
    free: "Free",
    plus: "Plus",
    inactive_plus: "Expired Plus",
  },
};

const adminCopy: Record<Language, Record<string, string>> = {
  zh: {
    verifying: "正在验证管理员权限...",
    loadingUsers: "正在读取用户...",
    forbiddenStatus: "当前账号没有管理员权限。",
    connected: "已连接",
    loadFailed: "管理后台读取失败",
    addingUser: "正在添加用户...",
    userAdded: "用户已添加",
    addFailed: "添加用户失败",
    upgrading: "正在升级用户...",
    downgrading: "正在降级用户...",
    upgraded: "已开通 Plus",
    downgraded: "已降级 Free",
    planFailed: "套餐更新失败",
    deletingUser: "正在删除用户...",
    userDeleted: "用户已删除",
    deleteFailed: "删除用户失败",
    banning: "正在冻结用户...",
    unbanning: "正在解冻用户...",
    banned: "用户已冻结",
    unbanned: "用户已解冻",
    banFailed: "用户封禁操作失败",
    loadingIp: "正在读取 IP 明细...",
    ipUpdated: "IP 明细已更新",
    ipLoadFailed: "IP 明细读取失败",
    banningIp: "正在封禁 IP...",
    ipBanned: "IP 已封禁",
    ipBanFailed: "IP 封禁失败",
    liftingIp: "正在解封 IP...",
    ipLifted: "IP 已解封",
    ipLiftFailed: "IP 解封失败",
    resettingQuota: "正在重置全部额度...",
    quotaResetDone: "已重置 {count} 个用户的额度",
    quotaResetFailed: "额度重置失败",
    copied: "已复制到剪贴板",
    adminTitle: "管理后台",
    backendUrl: "后端地址",
    noPermission: "无权限",
    noPermissionBody: "当前账号不是管理员，无法查看用户数据。",
    backAccount: "返回账号总览",
    readFailed: "读取失败",
    retry: "重试",
    totalUsers: "总用户",
    expiredPlus: "Plus 过期",
    oneTime: "一次性凭证",
    credentialNote: "临时密码和 API Key 只在这里显示一次。",
    tempPassword: "临时密码",
    close: "关闭",
    searchUser: "搜索用户",
    userFilter: "用户筛选",
    addUser: "添加用户",
    resetAllQuota: "重置全部额度",
    refresh: "刷新",
    ipRisk: "IP 风控",
    ipRiskBody: "查询真实 IP 的关联账号、限流事件和封禁状态。",
    ipAddress: "IP 地址",
    ipReason: "封禁原因",
    ipReasonPlaceholder: "批量注册或滥用 Free 模型",
    queryIp: "查询 IP",
    banIp24h: "封禁 24 小时",
    liftIp: "解封 IP",
    bannedStatus: "已封禁：{reason}",
    notBanned: "未封禁",
    reg1h: "近 1 小时注册 {count} 次",
    freeAi1h: "近 1 小时 Free/Zen 调用 {count} 次",
    rate24h: "近 24 小时限流事件 {count} 次",
    associatedAccounts: "关联账号：",
    none: "无",
    user: "用户",
    plan: "套餐",
    usage: "用量",
    ipStatus: "IP / 状态",
    actions: "操作",
    admin: "管理员",
    registeredAt: "注册于 {date}",
    frozenSuffix: " · 已冻结",
    expiresAt: "到期 {date}",
    noExpiry: "无到期时间",
    remaining: "剩余 {count}",
    keyCount: "个 Key",
    noIp: "暂无 IP",
    seenAt: "请求于 {date}",
    noSeen: "暂无请求记录",
    upgradePlus: "升级 Plus",
    downgradeFree: "降级 Free",
    freeze: "冻结",
    unfreeze: "解冻",
    delete: "删除",
    noMatches: "没有匹配的用户。",
    name: "姓名",
    email: "邮箱",
    plusDays: "Plus 天数",
    cancel: "取消",
    adding: "添加中...",
    add: "添加",
    confirmUpgrade: "确认升级",
    confirmDowngrade: "确认降级",
    upgradeBody: "将 {email} 开通 Plus 30 天，额度调整为 1,500 次/月。",
    downgradeBody: "将 {email} 降级为 Free，Plus 到期时间会清空，额度调整为 500 次/月。",
    processing: "处理中...",
    resetQuotaTitle: "重置全部额度",
    resetQuotaBody: "这会让所有用户从现在开始重新计算本月额度。历史调用记录会保留，套餐、Plus 到期时间和 API Key 不会改变。请输入 RESET 确认。",
    resetConfirmAria: "确认重置额度",
    resetInProgress: "重置中...",
    resetConfirm: "确认重置",
    freezeUser: "冻结用户",
    unfreezeUser: "解冻用户",
    freezeBody: "冻结 {email} 会撤销现有 session，并拒绝登录和 API Key 鉴权。",
    unfreezeBody: "解冻 {email} 后，该用户需要重新登录；关联 IP ban 不会自动解除。",
    freezeReason: "冻结原因",
    confirm: "确认",
    deleteUser: "删除用户",
    deleteBody: "删除会永久移除该用户、API Key 和登录会话，历史调用记录会保留为审计记录。此操作无法恢复，请输入邮箱确认：{email}",
    deleteEmailAria: "确认删除邮箱",
    deleting: "删除中...",
    confirmDelete: "确认删除",
    copy: "复制",
  },
  en: {
    verifying: "Verifying admin access...",
    loadingUsers: "Loading users...",
    forbiddenStatus: "This account does not have admin access.",
    connected: "Connected",
    loadFailed: "Failed to load admin data",
    addingUser: "Adding user...",
    userAdded: "User added",
    addFailed: "Failed to add user",
    upgrading: "Upgrading user...",
    downgrading: "Downgrading user...",
    upgraded: "Plus activated",
    downgraded: "Downgraded to Free",
    planFailed: "Failed to update plan",
    deletingUser: "Deleting user...",
    userDeleted: "User deleted",
    deleteFailed: "Failed to delete user",
    banning: "Freezing user...",
    unbanning: "Unfreezing user...",
    banned: "User frozen",
    unbanned: "User unfrozen",
    banFailed: "Failed to update user ban",
    loadingIp: "Loading IP details...",
    ipUpdated: "IP details updated",
    ipLoadFailed: "Failed to load IP details",
    banningIp: "Banning IP...",
    ipBanned: "IP banned",
    ipBanFailed: "Failed to ban IP",
    liftingIp: "Lifting IP ban...",
    ipLifted: "IP ban lifted",
    ipLiftFailed: "Failed to lift IP ban",
    resettingQuota: "Resetting all quota...",
    quotaResetDone: "Reset quota for {count} users",
    quotaResetFailed: "Failed to reset quota",
    copied: "Copied to clipboard",
    adminTitle: "Admin",
    backendUrl: "Backend URL",
    noPermission: "No access",
    noPermissionBody: "This account is not an admin and cannot view user data.",
    backAccount: "Back to account",
    readFailed: "Failed to load",
    retry: "Retry",
    totalUsers: "Total users",
    expiredPlus: "Expired Plus",
    oneTime: "One-time credentials",
    credentialNote: "Temporary password and API key are shown only once.",
    tempPassword: "Temporary password",
    close: "Close",
    searchUser: "Search email or name",
    userFilter: "User filter",
    addUser: "Add user",
    resetAllQuota: "Reset all quota",
    refresh: "Refresh",
    ipRisk: "IP Security",
    ipRiskBody: "Inspect associated accounts, rate-limit events, and ban status for a real client IP.",
    ipAddress: "IP address",
    ipReason: "Ban reason",
    ipReasonPlaceholder: "Bulk registration or Free model abuse",
    queryIp: "Query IP",
    banIp24h: "Ban for 24 hours",
    liftIp: "Lift IP ban",
    bannedStatus: "Banned: {reason}",
    notBanned: "Not banned",
    reg1h: "{count} registrations in the last hour",
    freeAi1h: "{count} Free/Zen calls in the last hour",
    rate24h: "{count} rate-limit events in 24 hours",
    associatedAccounts: "Associated accounts: ",
    none: "None",
    user: "User",
    plan: "Plan",
    usage: "Usage",
    ipStatus: "IP / Status",
    actions: "Actions",
    admin: "Admin",
    registeredAt: "Registered {date}",
    frozenSuffix: " · Frozen",
    expiresAt: "Expires {date}",
    noExpiry: "No expiry",
    remaining: "{count} remaining",
    keyCount: "keys",
    noIp: "No IP",
    seenAt: "Seen {date}",
    noSeen: "No request record",
    upgradePlus: "Upgrade Plus",
    downgradeFree: "Downgrade Free",
    freeze: "Freeze",
    unfreeze: "Unfreeze",
    delete: "Delete",
    noMatches: "No matching users.",
    name: "Name",
    email: "Email",
    plusDays: "Plus days",
    cancel: "Cancel",
    adding: "Adding...",
    add: "Add",
    confirmUpgrade: "Confirm upgrade",
    confirmDowngrade: "Confirm downgrade",
    upgradeBody: "Activate Plus for {email} for 30 days and set quota to 1,500 requests/month.",
    downgradeBody: "Downgrade {email} to Free, clear Plus expiry, and set quota to 500 requests/month.",
    processing: "Processing...",
    resetQuotaTitle: "Reset all quota",
    resetQuotaBody: "This makes every user start a new monthly quota window from now. Usage history is kept; plans, Plus expiry, and API keys are unchanged. Type RESET to confirm.",
    resetConfirmAria: "Confirm quota reset",
    resetInProgress: "Resetting...",
    resetConfirm: "Confirm reset",
    freezeUser: "Freeze user",
    unfreezeUser: "Unfreeze user",
    freezeBody: "Freezing {email} revokes existing sessions and rejects login and API-key auth.",
    unfreezeBody: "After unfreezing {email}, the user must log in again. Related IP bans are not lifted automatically.",
    freezeReason: "Freeze reason",
    confirm: "Confirm",
    deleteUser: "Delete user",
    deleteBody: "Deleting permanently removes the user, API keys, and login sessions. Usage history stays as audit evidence. This cannot be undone. Type the email to confirm: {email}",
    deleteEmailAria: "Confirm delete email",
    deleting: "Deleting...",
    confirmDelete: "Confirm delete",
    copy: "Copy",
  },
};

function fill(template: string, values: Record<string, string>) {
  return Object.entries(values).reduce((next, [key, value]) => next.replaceAll(`{${key}}`, value), template);
}

export function AdminClient() {
  const { language } = useI18n();
  const t = useCallback((key: string) => adminCopy[language][key] ?? key, [language]);
  const [backendUrl, setBackendUrl] = useState(defaultBackendUrl);
  const [sessionToken, setSessionToken] = useState("");
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);
  const [access, setAccess] = useState<AccessState>("loading");
  const [status, setStatus] = useState(() => t("verifying"));
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
    setStatus(t("loadingUsers"));

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
        setStatus(t("forbiddenStatus"));
        return;
      }
      if (!response.ok) throw new Error(await errorText(response));

      setAdminData((await response.json()) as AdminUsersResponse);
      setAccess("allowed");
      setStatus(t("connected"));
    } catch (error) {
      setAccess("error");
      setStatus(error instanceof Error ? error.message : t("loadFailed"));
    }
  }, [normalizedBackendUrl, t]);

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
    setStatus(t("addingUser"));

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
      setStatus(t("userAdded"));
      await loadUsers(sessionToken);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("addFailed"));
    } finally {
      setBusyAction("");
    }
  }

  async function updatePlan(user: AdminUser, plan: "free" | "plus") {
    if (!sessionToken) return;
    const actionId = `${plan}-${user.id}`;
    setBusyAction(actionId);
    setStatus(plan === "plus" ? t("upgrading") : t("downgrading"));

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
      setStatus(plan === "plus" ? t("upgraded") : t("downgraded"));
      setPlanTarget(null);
      await loadUsers(sessionToken);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("planFailed"));
    } finally {
      setBusyAction("");
    }
  }

  async function deleteUser() {
    if (!sessionToken || !deleteTarget || deleteConfirmation !== deleteTarget.email) return;
    setBusyAction(`delete-${deleteTarget.id}`);
    setStatus(t("deletingUser"));

    try {
      const response = await fetch(`${normalizedBackendUrl}/admin/users/${deleteTarget.id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${sessionToken}`,
        },
      });
      if (!response.ok) throw new Error(await errorText(response));
      setStatus(t("userDeleted"));
      setDeleteTarget(null);
      setDeleteConfirmation("");
      await loadUsers(sessionToken);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("deleteFailed"));
    } finally {
      setBusyAction("");
    }
  }

  async function updateBan() {
    if (!sessionToken || !banTarget) return;
    const { user, action } = banTarget;
    const actionId = `${action}-${user.id}`;
    setBusyAction(actionId);
    setStatus(action === "ban" ? t("banning") : t("unbanning"));

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
      setStatus(action === "ban" ? t("banned") : t("unbanned"));
      setBanTarget(null);
      setBanReason("");
      await loadUsers(sessionToken);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("banFailed"));
    } finally {
      setBusyAction("");
    }
  }

  async function loadIpDetails(ip = ipQuery) {
    if (!sessionToken || !ip.trim()) return;
    setBusyAction("ip-details");
    setStatus(t("loadingIp"));

    try {
      const response = await fetch(`${normalizedBackendUrl}/admin/ip-details?ip=${encodeURIComponent(ip.trim())}`, {
        headers: {
          Authorization: `Bearer ${sessionToken}`,
        },
      });
      if (!response.ok) throw new Error(await errorText(response));
      setIpDetails((await response.json()) as IpDetails);
      setStatus(t("ipUpdated"));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("ipLoadFailed"));
    } finally {
      setBusyAction("");
    }
  }

  async function banIp() {
    if (!sessionToken || !ipQuery.trim()) return;
    setBusyAction("ban-ip");
    setStatus(t("banningIp"));

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
      setStatus(t("ipBanned"));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("ipBanFailed"));
    } finally {
      setBusyAction("");
    }
  }

  async function liftIpBan() {
    if (!sessionToken || !ipDetails?.active_ban) return;
    setBusyAction("lift-ip");
    setStatus(t("liftingIp"));

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
      setStatus(t("ipLifted"));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("ipLiftFailed"));
    } finally {
      setBusyAction("");
    }
  }

  async function resetAllQuota() {
    if (!sessionToken || quotaResetConfirmation !== "RESET") return;
    setBusyAction("reset-quota");
    setStatus(t("resettingQuota"));

    try {
      const response = await fetch(`${normalizedBackendUrl}/admin/quota-resets`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${sessionToken}`,
        },
      });
      if (!response.ok) throw new Error(await errorText(response));
      const result = (await response.json()) as AdminQuotaResetResponse;
      setStatus(fill(t("quotaResetDone"), { count: result.users_affected.toLocaleString() }));
      setShowQuotaReset(false);
      setQuotaResetConfirmation("");
      await loadUsers(sessionToken);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("quotaResetFailed"));
    } finally {
      setBusyAction("");
    }
  }

  async function copy(text: string) {
    await navigator.clipboard.writeText(text);
    setStatus(t("copied"));
  }

  return (
    <main className="admin-page">
      <section className="admin-shell">
        <SiteHeader active="admin" variant="workspace" />

        <section className="hero-band">
          <div>
            <p>Admin</p>
            <h1>{t("adminTitle")}</h1>
            <span>{status}</span>
          </div>
          <label>
            {t("backendUrl")}
            <input
              aria-label={t("backendUrl")}
              value={backendUrl}
              onChange={(event) => setBackendUrl(event.target.value)}
            />
          </label>
        </section>

        {access === "loading" && <section className="empty-state">{t("verifying")}</section>}

        {access === "forbidden" && (
          <section className="empty-state">
            <h2>{t("noPermission")}</h2>
            <p>{t("noPermissionBody")}</p>
            <Link className={buttonVariants({ variant: "default" })} href="/account">
              {t("backAccount")}
            </Link>
          </section>
        )}

        {access === "error" && (
          <section className="empty-state">
            <h2>{t("readFailed")}</h2>
            <p>{status}</p>
            <Button type="button" onClick={() => loadUsers(sessionToken)}>
              {t("retry")}
            </Button>
          </section>
        )}

        {access === "allowed" && adminData && (
          <>
            <section className="stats-grid" aria-label={t("userFilter")}>
              <StatBlock label={t("totalUsers")} value={adminData.stats.total_users} />
              <StatBlock label="Free" value={adminData.stats.free_users} />
              <StatBlock label="Plus" value={adminData.stats.plus_users} />
              <StatBlock label={t("expiredPlus")} value={adminData.stats.inactive_plus_users} />
            </section>

            {issuedCredentials && (
              <section className="issued-panel">
                <div>
                  <p>{t("oneTime")}</p>
                  <h2>{issuedCredentials.user.email}</h2>
                  <span>{t("credentialNote")}</span>
                </div>
                <div className="issued-grid">
                  <Credential label={t("tempPassword")} copyLabel={t("copy")} value={issuedCredentials.temporary_password} onCopy={copy} />
                  <Credential label="API Key" copyLabel={t("copy")} value={issuedCredentials.api_key.key} onCopy={copy} />
                </div>
                <Button variant="secondary" type="button" onClick={() => setIssuedCredentials(null)}>
                  {t("close")}
                </Button>
              </section>
            )}

            <section className="toolbar">
              <input
                aria-label={t("searchUser")}
                placeholder={t("searchUser")}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              <div className="segments" aria-label={t("userFilter")}>
                {(Object.keys(filterLabels[language]) as UserFilter[]).map((key) => (
                  <button
                    className={filter === key ? "active" : ""}
                    key={key}
                    type="button"
                    onClick={() => setFilter(key)}
                  >
                    {filterLabels[language][key]}
                  </button>
                ))}
              </div>
              <Button type="button" onClick={() => setShowAddUser(true)}>
                {t("addUser")}
              </Button>
              <Button
                variant="destructive"
                type="button"
                onClick={() => {
                  setQuotaResetConfirmation("");
                  setShowQuotaReset(true);
                }}
              >
                {t("resetAllQuota")}
              </Button>
              <Button variant="secondary" type="button" onClick={() => loadUsers(sessionToken)}>
                {t("refresh")}
              </Button>
            </section>

            <section className="issued-panel">
              <div>
                <p>Security</p>
                <h2>{t("ipRisk")}</h2>
                <span>{t("ipRiskBody")}</span>
              </div>
              <div className="issued-grid">
                <label>
                  {t("ipAddress")}
                  <input
                    aria-label={t("ipAddress")}
                    placeholder="203.0.113.10"
                    value={ipQuery}
                    onChange={(event) => setIpQuery(event.target.value)}
                  />
                </label>
                <label>
                  {t("ipReason")}
                  <input
                    aria-label={t("ipReason")}
                    placeholder={t("ipReasonPlaceholder")}
                    value={ipBanReason}
                    onChange={(event) => setIpBanReason(event.target.value)}
                  />
                </label>
              </div>
              <div className="modal-actions">
                <Button type="button" variant="secondary" disabled={busyAction === "ip-details"} onClick={() => loadIpDetails()}>
                  {t("queryIp")}
                </Button>
                <Button type="button" variant="destructive" disabled={!ipQuery.trim() || busyAction === "ban-ip"} onClick={banIp}>
                  {t("banIp24h")}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={!ipDetails?.active_ban || busyAction === "lift-ip"}
                  onClick={liftIpBan}
                >
                  {t("liftIp")}
                </Button>
              </div>
              {ipDetails && (
                <div className="ip-details">
                  <strong>{ipDetails.ip}</strong>
                  <span>{ipDetails.active_ban ? fill(t("bannedStatus"), { reason: ipDetails.active_ban.reason }) : t("notBanned")}</span>
                  <span>{fill(t("reg1h"), { count: ipDetails.registration_count_1h.toLocaleString() })}</span>
                  <span>{fill(t("freeAi1h"), { count: ipDetails.free_ai_request_count_1h.toLocaleString() })}</span>
                  <span>{fill(t("rate24h"), { count: ipDetails.rate_limit_event_count_24h.toLocaleString() })}</span>
                  <small>
                    {t("associatedAccounts")}
                    {ipDetails.associated_users.length === 0
                      ? t("none")
                      : ipDetails.associated_users.map((user) => user.email).join(", ")}
                  </small>
                </div>
              )}
            </section>

            <section className="user-table">
              <div className="table-head">
                <span>{t("user")}</span>
                <span>{t("plan")}</span>
                <span>{t("usage")}</span>
                <span>Key</span>
                <span>{t("ipStatus")}</span>
                <span>{t("actions")}</span>
              </div>
              {filteredUsers.map((user) => {
                const isSelf = currentUserId === user.id;
                return (
                  <article className="table-row" key={user.id}>
                    <div className="identity-cell">
                      <strong>{user.name}</strong>
                      <span>{user.email}</span>
                      <small>
                        {user.is_admin ? t("admin") : fill(t("registeredAt"), { date: formatDate(user.created_at, language) })}
                        {user.status === "banned" ? t("frozenSuffix") : ""}
                      </small>
                    </div>
                    <div>
                      <PlanBadge user={user} language={language} />
                      <small>{user.plus_expires_at ? fill(t("expiresAt"), { date: formatDate(user.plus_expires_at, language) }) : t("noExpiry")}</small>
                    </div>
                    <div>
                      <strong>
                        {user.requests_this_month.toLocaleString()} / {user.monthly_request_limit.toLocaleString()}
                      </strong>
                      <span>{fill(t("remaining"), { count: user.remaining_requests.toLocaleString() })}</span>
                    </div>
                    <div>
                      <strong>{user.api_key_count}</strong>
                      <span>{t("keyCount")}</span>
                    </div>
                    <div>
                      <span>{user.last_seen_ip ?? user.registration_ip ?? t("noIp")}</span>
                      <small>{user.last_seen_at ? fill(t("seenAt"), { date: formatDate(user.last_seen_at, language) }) : t("noSeen")}</small>
                    </div>
                    <div className="actions-cell">
                      <Button
                        size="sm"
                        type="button"
                        disabled={busyAction === `plus-${user.id}` || user.plan === "plus"}
                        onClick={() => setPlanTarget({ user, plan: "plus" })}
                      >
                        {t("upgradePlus")}
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        type="button"
                        disabled={busyAction === `free-${user.id}` || isSelf || user.plan !== "plus"}
                        onClick={() => setPlanTarget({ user, plan: "free" })}
                      >
                        {t("downgradeFree")}
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
                        {user.status === "banned" ? t("unfreeze") : t("freeze")}
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        type="button"
                        disabled={isSelf}
                        onClick={() => setDeleteTarget(user)}
                      >
                        {t("delete")}
                      </Button>
                    </div>
                  </article>
                );
              })}
              {filteredUsers.length === 0 && <p className="empty-row">{t("noMatches")}</p>}
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
                <h2 id="add-user-title">{t("addUser")}</h2>
              </div>
              <button type="button" onClick={() => setShowAddUser(false)} aria-label={t("close")}>
                ×
              </button>
            </div>
            <form onSubmit={createUser}>
              <label>
                {t("name")}
                <input
                  required
                  minLength={2}
                  value={addUserForm.name}
                  onChange={(event) => setAddUserForm((form) => ({ ...form, name: event.target.value }))}
                />
              </label>
              <label>
                {t("email")}
                <input
                  required
                  type="email"
                  value={addUserForm.email}
                  onChange={(event) => setAddUserForm((form) => ({ ...form, email: event.target.value }))}
                />
              </label>
              <label>
                {t("plan")}
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
                  {t("plusDays")}
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
                  {t("cancel")}
                </Button>
                <Button type="submit" disabled={busyAction === "create"}>
                  {busyAction === "create" ? t("adding") : t("add")}
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
                <h2 id="plan-user-title">{planTarget.plan === "plus" ? t("confirmUpgrade") : t("confirmDowngrade")}</h2>
              </div>
              <button type="button" onClick={() => setPlanTarget(null)} aria-label={t("close")}>
                ×
              </button>
            </div>
            <p className="danger-copy">
              {planTarget.plan === "plus"
                ? fill(t("upgradeBody"), { email: planTarget.user.email })
                : fill(t("downgradeBody"), { email: planTarget.user.email })}
            </p>
            <div className="modal-actions">
              <Button variant="secondary" type="button" onClick={() => setPlanTarget(null)}>
                {t("cancel")}
              </Button>
              <Button
                variant={planTarget.plan === "plus" ? "default" : "destructive"}
                type="button"
                disabled={busyAction === `${planTarget.plan}-${planTarget.user.id}`}
                onClick={() => updatePlan(planTarget.user, planTarget.plan)}
              >
                {busyAction === `${planTarget.plan}-${planTarget.user.id}`
                  ? t("processing")
                  : planTarget.plan === "plus"
                    ? t("confirmUpgrade")
                    : t("confirmDowngrade")}
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
                <h2 id="reset-quota-title">{t("resetQuotaTitle")}</h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowQuotaReset(false);
                  setQuotaResetConfirmation("");
                }}
                aria-label={t("close")}
              >
                ×
              </button>
            </div>
            <p className="danger-copy">
              {t("resetQuotaBody")}
            </p>
            <input
              aria-label={t("resetConfirmAria")}
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
                {t("cancel")}
              </Button>
              <Button
                variant="destructive"
                type="button"
                disabled={quotaResetConfirmation !== "RESET" || busyAction === "reset-quota"}
                onClick={resetAllQuota}
              >
                {busyAction === "reset-quota" ? t("resetInProgress") : t("resetConfirm")}
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
                <h2 id="ban-user-title">{banTarget.action === "ban" ? t("freezeUser") : t("unfreezeUser")}</h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  setBanTarget(null);
                  setBanReason("");
                }}
                aria-label={t("close")}
              >
                ×
              </button>
            </div>
            <p className="danger-copy">
              {banTarget.action === "ban"
                ? fill(t("freezeBody"), { email: banTarget.user.email })
                : fill(t("unfreezeBody"), { email: banTarget.user.email })}
            </p>
            {banTarget.action === "ban" && (
              <input
                aria-label={t("freezeReason")}
                placeholder={t("freezeReason")}
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
                {t("cancel")}
              </Button>
              <Button
                variant={banTarget.action === "ban" ? "destructive" : "default"}
                type="button"
                disabled={busyAction === `${banTarget.action}-${banTarget.user.id}`}
                onClick={updateBan}
              >
                {busyAction === `${banTarget.action}-${banTarget.user.id}` ? t("processing") : t("confirm")}
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
                <h2 id="delete-user-title">{t("deleteUser")}</h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  setDeleteTarget(null);
                  setDeleteConfirmation("");
                }}
                aria-label={t("close")}
              >
                ×
              </button>
            </div>
            <p className="danger-copy">
              {fill(t("deleteBody"), { email: deleteTarget.email })}
            </p>
            <input
              aria-label={t("deleteEmailAria")}
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
                {t("cancel")}
              </Button>
              <Button
                type="button"
                disabled={deleteConfirmation !== deleteTarget.email || busyAction === `delete-${deleteTarget.id}`}
                onClick={deleteUser}
              >
                {busyAction === `delete-${deleteTarget.id}` ? t("deleting") : t("confirmDelete")}
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
          width: min(1440px, 100%);
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
  copyLabel,
  value,
  onCopy,
}: {
  label: string;
  copyLabel: string;
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
        {copyLabel}
      </Button>
    </div>
  );
}

function PlanBadge({ user, language }: { user: AdminUser; language: Language }) {
  const expiredPlus = user.stored_plan === "plus" && user.plan !== "plus";
  const className = `plan-badge ${user.plan === "plus" ? "plus" : ""} ${expiredPlus ? "expired" : ""}`;
  const label = expiredPlus ? filterLabels[language].inactive_plus : user.plan === "plus" ? "Plus" : "Free";

  return <strong className={className}>{label}</strong>;
}

function formatDate(value: string, language: Language) {
  return new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : "en-US", {
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
