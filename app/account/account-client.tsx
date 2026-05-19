"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { CircleDollarSign, CreditCard, Landmark, Wallet, X } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { modelDisplayName } from "@/lib/free-models";
import { useI18n } from "@/lib/i18n";
import type { Language } from "@/lib/i18n-core";
import { plusMonthlyPriceLabel, plusMonthlyPriceLabelEn } from "@/lib/pricing";
import { cn } from "@/lib/utils";
import { SiteFooter } from "../components/SiteFooter";
import { SiteHeader } from "../components/SiteHeader";

const defaultBackendUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/+$/, "") ?? "/api/backend";

const modelDisplayNames: Record<string, string> = {
  "big-pickle": "Big Pickle",
  "deepseek-v4-flash-free": "DeepSeek V4 Flash Free",
  "minimax-m2.5-free": "MiniMax M2.5 Free",
  "ring-2.6-1t-free": "Ring 2.6 1T Free",
  "nemotron-3-super-free": "Nemotron 3 Super Free",
  "glm-5.1": "GLM-5.1",
  "glm-5": "GLM-5",
  "kimi-k2.5": "Kimi K2.5",
  "kimi-k2.6": "Kimi K2.6",
  "deepseek-v4-pro": "DeepSeek V4 Pro",
  "deepseek-v4-flash": "DeepSeek V4 Flash",
  "mimo-v2.5": "MiMo V2.5",
  "mimo-v2.5-pro": "MiMo V2.5 Pro",
  "qwen3.6-plus": "Qwen3.6 Plus",
  "qwen3.5-plus": "Qwen3.5 Plus",
};

const copyZh: Record<string, string> = {
  title: "账号总览",
  loading: "正在读取账号...",
  needLogin: "需要登录",
  needLoginDesc: "登录后可以查看当前 API Key、月度额度、剩余额度和最近调用。",
  goLogin: "去登录",
  refresh: "刷新",
  remaining: "本月仍可调用请求数",
  usedQuota: "已用额度",
  usedDesc: "本月已记录请求",
  monthlyTotal: "月度总额",
  monthlyDesc: "账号套餐额度",
  modelRange: "模型范围",
  modelRangeDesc: "免费 + Plus 模型池",
  modelRangeFree: "实时免费模型池 + DeepSeek V4 Flash",
  viewModels: "查看可用模型",
  availableModels: "可用模型",
  close: "关闭",
  modelPrivacyNote: "免费模型可能用于服务改进或试用目的，请避免提交个人、商业机密或其他敏感信息。",
  monthlyUsage: "本月用量",
  thisMonth: "本月额度",
  used: "已用",
  remainingLabel: "剩余",
  freeNote: "Free 用户每月 500 次，可调用实时同步的免费模型池和 DeepSeek V4 Flash。",
  plusExpires: "Plus 到期",
  notSet: "未设置",
  apiKeys: "API Keys",
  recentUsage: "最近调用",
  noUsage: "暂无调用记录",
  label: "账号",
  keysLabel: "密钥",
  nameTitle: "的账号",
  updated: "账号信息已更新",
  loadFailed: "账号读取失败",
  noKeys: "还没有 API Key，请到控制台生成。",
  apiKeysSub: "多个 Key 共享账号套餐额度，不再按单个 Key 独立计费。",
  oldKeyPrefix: "旧 Key 未保存前缀",
  enabled: "启用",
  disabled: "停用",
  buyPlus: "开通 Plus",
  renewPlus: "续费 Plus",
  checkoutTitle: "选择支付方式",
  checkoutDesc: "Plus 按 30 天开通或续费，支付成功后自动生效。",
  checkoutAmount: "实际支付",
  checkoutTip: "支付完成后会自动返回账号页并刷新套餐状态。",
  alipay: "支付宝",
  wxpay: "微信支付",
  paypal: "PayPal",
  usdt: "USDT",
  payNow: "去支付",
  selectPaytype: "选择支付方式",
  checkoutUnavailable: "自助购买暂未开启",
  checkoutCreating: "正在创建支付订单...",
  checkoutPending: "正在等待支付结果...",
  checkoutPaid: "支付成功，Plus 已生效。",
  checkoutFailed: "支付未完成，请重新发起。",
  member: "会员",
  quotaOverview: "账号额度概览",
  usageRatio: "额度使用比例",
  freePrice: "$0 / 月",
  manageKey: "管理 Key",
  goPlayground: "去调试",
  recent: "Recent",
};

const copyEn: Record<string, string> = {
  title: "Account",
  loading: "Loading account...",
  needLogin: "Login required",
  needLoginDesc: "Log in to view API keys, monthly quota, remaining requests, and recent usage.",
  goLogin: "Log in",
  refresh: "Refresh",
  remaining: "requests remaining this month",
  usedQuota: "Used quota",
  usedDesc: "requests recorded this month",
  monthlyTotal: "Monthly total",
  monthlyDesc: "plan quota",
  modelRange: "Model access",
  modelRangeDesc: "Free + Plus model pools",
  modelRangeFree: "Live free catalog + DeepSeek V4 Flash",
  viewModels: "View models",
  availableModels: "Available models",
  close: "Close",
  modelPrivacyNote: "Free models may be used for service improvement or trial purposes. Avoid personal, business-confidential, or sensitive content.",
  monthlyUsage: "Monthly usage",
  thisMonth: "This month",
  used: "Used",
  remainingLabel: "Remaining",
  freeNote: "Free users get 500 requests per month and can call the live free model catalog plus DeepSeek V4 Flash.",
  plusExpires: "Plus expires",
  notSet: "Not set",
  apiKeys: "API Keys",
  recentUsage: "Recent usage",
  noUsage: "No usage records yet",
  label: "Account",
  keysLabel: "Keys",
  nameTitle: "account",
  updated: "Account updated",
  loadFailed: "Failed to load account",
  noKeys: "No API key yet. Create one in the console.",
  apiKeysSub: "Multiple keys share the account plan quota instead of being billed per key.",
  oldKeyPrefix: "Legacy key prefix unavailable",
  enabled: "Enabled",
  disabled: "Disabled",
  buyPlus: "Buy Plus",
  renewPlus: "Renew Plus",
  checkoutTitle: "Choose payment method",
  checkoutDesc: "Plus is activated or renewed for 30 days after payment succeeds.",
  checkoutAmount: "Amount",
  checkoutTip: "After payment, you will return to the account page and the plan will refresh automatically.",
  alipay: "Alipay",
  wxpay: "WeChat Pay",
  paypal: "PayPal",
  usdt: "USDT",
  payNow: "Pay now",
  selectPaytype: "Choose payment method",
  checkoutUnavailable: "Self-service checkout is not available",
  checkoutCreating: "Creating checkout order...",
  checkoutPending: "Waiting for payment result...",
  checkoutPaid: "Payment succeeded. Plus is active.",
  checkoutFailed: "Payment was not completed. Please try again.",
  member: "member",
  quotaOverview: "Account quota overview",
  usageRatio: "Quota usage ratio",
  freePrice: "$0 / month",
  manageKey: "Manage keys",
  goPlayground: "Open playground",
  recent: "Recent",
};

function translate(language: Language, key: string) {
  const shortKey = key.split(".").at(-1) ?? key;
  const dictionary = language === "en" ? copyEn : copyZh;
  return dictionary[key] ?? dictionary[shortKey] ?? key;
}

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
  billing?: {
    fovpay_enabled: boolean;
    plus_amount_cny: string | null;
    plus_days: number;
    allowed_paytypes: string[];
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

type CheckoutResponse = {
  order_id: number;
  out_trade_no: string;
  pay_url: string;
  status: string;
  paytype_code: string;
  amount_cny: string;
};

type BillingOrderResponse = {
  id: number;
  out_trade_no: string;
  amount_cny: string;
  status: string;
  pay_url: string | null;
  granted_until: string | null;
};

type PaymentOption = {
  code: string;
  label: string;
  description: string;
  Icon: LucideIcon;
};

const temporarilyHiddenPaytypes = new Set(["paypal", "usdt"]);

const knownPaytypes: Record<Language, Record<string, PaymentOption>> = {
  zh: {
    alipay: {
      code: "alipay",
      label: "支付宝",
      description: "适合中国大陆用户的快捷扫码支付。",
      Icon: Wallet,
    },
    wxpay: {
      code: "wxpay",
      label: "微信支付",
      description: "使用微信完成扫码或移动端支付。",
      Icon: CreditCard,
    },
    paypal: {
      code: "paypal",
      label: "PayPal",
      description: "适合海外银行卡、PayPal 余额等国际支付。",
      Icon: Landmark,
    },
    usdt: {
      code: "usdt",
      label: "USDT",
      description: "通过 FovPay 托管收银台完成稳定币支付。",
      Icon: CircleDollarSign,
    },
  },
  en: {
    alipay: {
      code: "alipay",
      label: "Alipay",
      description: "Fast hosted checkout for Alipay users.",
      Icon: Wallet,
    },
    wxpay: {
      code: "wxpay",
      label: "WeChat Pay",
      description: "Use WeChat Pay through the FovPay hosted cashier.",
      Icon: CreditCard,
    },
    paypal: {
      code: "paypal",
      label: "PayPal",
      description: "Temporarily unavailable while payment backend is being verified.",
      Icon: Landmark,
    },
    usdt: {
      code: "usdt",
      label: "USDT",
      description: "Temporarily unavailable while payment backend is being verified.",
      Icon: CircleDollarSign,
    },
  },
};

function paytypeOption(paytype: string, language: Language): PaymentOption {
  return knownPaytypes[language][paytype] ?? {
    code: paytype,
    label: paytype,
    description:
      language === "zh"
        ? "通过 FovPay 支持的托管收银台完成支付。"
        : "Pay through the FovPay hosted cashier.",
    Icon: CreditCard,
  };
}

export function AccountClient() {
  const { language } = useI18n();
  const t = useCallback((key: string) => translate(language, key), [language]);
  const [sessionToken, setSessionToken] = useState("");
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [status, setStatus] = useState(() => t("account.loading"));
  const [loading, setLoading] = useState(true);
  const [modelsOpen, setModelsOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [selectedPaytype, setSelectedPaytype] = useState("");

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
      allowedModels: dashboard?.subscription.allowed_models ?? [],
      plusExpiresAt: dashboard?.subscription.plus_expires_at ?? null,
    };
  }, [dashboard]);

  const allowedModelItems = useMemo(
    () => summary.allowedModels.map((id) => ({
      id,
      name: modelDisplayNames[id] ?? modelDisplayName(id),
    })),
    [summary.allowedModels],
  );

  const paymentOptions = useMemo(() => {
    const allowed = dashboard?.billing?.allowed_paytypes ?? [];
    const preferredOrder = ["alipay", "wxpay", "paypal", "usdt"];
    return allowed
      .slice()
      .filter((paytype) => !temporarilyHiddenPaytypes.has(paytype))
      .sort((left, right) => {
        const leftIndex = preferredOrder.indexOf(left);
        const rightIndex = preferredOrder.indexOf(right);
        return (leftIndex === -1 ? 99 : leftIndex) - (rightIndex === -1 ? 99 : rightIndex);
      })
      .map((paytype) => paytypeOption(paytype, language));
  }, [dashboard?.billing?.allowed_paytypes, language]);

  const plusAmountCny = dashboard?.billing?.plus_amount_cny ?? "58.00";
  const plusPriceLabel = language === "en" ? plusMonthlyPriceLabelEn : plusMonthlyPriceLabel;

  useEffect(() => {
    if (paymentOptions.length === 0) {
      setSelectedPaytype("");
      return;
    }
    if (!paymentOptions.some((option) => option.code === selectedPaytype)) {
      setSelectedPaytype(paymentOptions[0].code);
    }
  }, [paymentOptions, selectedPaytype]);

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
      window.localStorage.setItem("openachieve_user", JSON.stringify(payload.user));
      setStatus(t("account.updated"));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("account.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    const token = window.localStorage.getItem("openachieve_session_token") ?? "";
    setSessionToken(token);

    if (!token) {
      setLoading(false);
      setStatus(t("account.needLogin"));
      return;
    }

    void loadAccount(token);
  }, [loadAccount, t]);

  useEffect(() => {
    if (!modelsOpen && !checkoutOpen) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setModelsOpen(false);
        setCheckoutOpen(false);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [modelsOpen, checkoutOpen]);

  useEffect(() => {
    if (!sessionToken) return;
    const checkoutRef = new URLSearchParams(window.location.search).get("checkout");
    if (!checkoutRef) return;
    const orderRef = checkoutRef;

    let cancelled = false;
    let attempts = 0;
    setStatus(t("account.checkoutPending"));

    async function pollOrder() {
      const response = await fetch(
        `${defaultBackendUrl}/dashboard/billing/orders/${encodeURIComponent(orderRef)}`,
        {
          headers: {
            Authorization: `Bearer ${sessionToken}`,
          },
        },
      );
      if (!response.ok) throw new Error(await errorText(response));
      const order = (await response.json()) as BillingOrderResponse;
      if (cancelled) return true;

      if (order.status === "paid") {
        setStatus(t("account.checkoutPaid"));
        window.history.replaceState(null, "", "/account");
        void loadAccount(sessionToken);
        return true;
      }

      if (["closed", "refunded", "frozen", "failed"].includes(order.status)) {
        setStatus(t("account.checkoutFailed"));
        window.history.replaceState(null, "", "/account");
        return true;
      }

      setStatus(t("account.checkoutPending"));
      return false;
    }

    void pollOrder().catch((error) => {
      if (!cancelled) setStatus(error instanceof Error ? error.message : t("account.checkoutFailed"));
    });
    const interval = window.setInterval(() => {
      attempts += 1;
      if (attempts > 30) {
        window.clearInterval(interval);
        return;
      }

      void pollOrder()
        .then((done) => {
          if (done) window.clearInterval(interval);
        })
        .catch((error) => {
          window.clearInterval(interval);
          if (!cancelled) setStatus(error instanceof Error ? error.message : t("account.checkoutFailed"));
        });
    }, 2000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [loadAccount, sessionToken, t]);

  async function startCheckout(paytypeCode: string) {
    if (!sessionToken) return;
    setCheckoutLoading(paytypeCode);
    setStatus(t("account.checkoutCreating"));

    try {
      const response = await fetch(`${defaultBackendUrl}/dashboard/billing/fovpay/checkout`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${sessionToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ paytype_code: paytypeCode }),
      });
      if (!response.ok) throw new Error(await errorText(response));
      const payload = (await response.json()) as CheckoutResponse;
      window.location.assign(payload.pay_url);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("account.checkoutFailed"));
      setCheckoutLoading(null);
    }
  }

  return (
    <main className="account-page">
      <section className="account-shell">
        <SiteHeader active="account" variant="workspace" />

        <section className="account-hero">
          <div>
            <p>{t("account.label")}</p>
            <h1>{dashboard ? `${dashboard.user.name} ${t("nameTitle")}` : t("account.title")}</h1>
            <span>
              {dashboard ? `${dashboard.user.email} · ${summary.planLabel} ${t("account.member")}` : status}
            </span>
          </div>
          <Button type="button" onClick={() => sessionToken && loadAccount(sessionToken)} disabled={loading || !sessionToken}>
            {loading ? t("loading") : t("refresh")}
          </Button>
        </section>

        {!sessionToken ? (
          <section className="empty-state">
            <h2>{t("needLogin")}</h2>
            <p>{t("needLoginDesc")}</p>
            <Link className={buttonVariants({ variant: "default" })} href="/login">{t("goLogin")}</Link>
          </section>
        ) : (
          <>
            <section className="quota-grid" aria-label={t("account.quotaOverview")}>
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
              <button
                className="quota-card model-range-card"
                type="button"
                aria-haspopup="dialog"
                aria-expanded={modelsOpen}
                onClick={() => setModelsOpen(true)}
              >
                <p>{t("account.modelRange")}</p>
                <strong>{summary.allowedModels.length}</strong>
                <span>{summary.plan === "plus" ? t("account.modelRangeDesc") : t("account.modelRangeFree")}</span>
                <em>{t("account.viewModels")}</em>
              </button>
            </section>

            {modelsOpen && (
              <div className="model-dialog-backdrop" role="presentation" onClick={() => setModelsOpen(false)}>
                <section
                  aria-labelledby="model-dialog-title"
                  aria-modal="true"
                  className="model-dialog"
                  role="dialog"
                  onClick={(event) => event.stopPropagation()}
                >
                  <div className="model-dialog-head">
                    <div>
                      <p>{summary.planLabel}</p>
                      <h2 id="model-dialog-title">{t("account.availableModels")}</h2>
                    </div>
                    <button className="dialog-close" type="button" onClick={() => setModelsOpen(false)}>
                      {t("account.close")}
                    </button>
                  </div>
                  <div className="model-list">
                    {allowedModelItems.map((model) => (
                      <article className="model-row" key={model.id}>
                        <strong>{model.name}</strong>
                        <code>{model.id}</code>
                      </article>
                    ))}
                  </div>
                  <p className="model-dialog-note">{t("account.modelPrivacyNote")}</p>
                </section>
              </div>
            )}

            <section className="usage-panel">
              <div className="panel-head">
                <div>
                  <p>{t("account.monthlyUsage")}</p>
                  <h2>{t("account.thisMonth")}</h2>
                </div>
                <code>{Math.round(summary.usagePercent)}%</code>
              </div>
              <div className="meter" aria-label={t("account.usageRatio")}>
                <span style={{ width: `${summary.usagePercent}%` }} />
              </div>
              <div className="meter-labels">
                <span>{t("account.used")} {summary.used.toLocaleString()}</span>
                <span>{t("account.remainingLabel")} {summary.remaining.toLocaleString()}</span>
              </div>
              <div className="plan-note">
                <strong>{summary.plan === "plus" ? plusPriceLabel : t("account.freePrice")}</strong>
                <span>
                  {summary.plan === "plus"
                    ? `${t("account.plusExpires")}：${summary.plusExpiresAt ? new Date(summary.plusExpiresAt).toLocaleString() : t("account.notSet")}`
                    : t("account.freeNote")}
                </span>
              </div>
              <div className="billing-actions">
                {dashboard?.billing?.fovpay_enabled ? (
                  <>
                    <Button
                      type="button"
                      disabled={paymentOptions.length === 0}
                      onClick={() => {
                        setSelectedPaytype(paymentOptions[0]?.code ?? "");
                        setCheckoutOpen(true);
                      }}
                    >
                      {summary.plan === "plus" ? t("account.renewPlus") : t("account.buyPlus")}
                    </Button>
                    <span>{t("account.checkoutAmount")} ¥{plusAmountCny}</span>
                  </>
                ) : (
                  <span>{t("account.checkoutUnavailable")}</span>
                )}
              </div>
            </section>

            <Dialog
              open={checkoutOpen}
              onOpenChange={(open) => {
                setCheckoutOpen(open);
                if (!open) setCheckoutLoading(null);
              }}
            >
              <DialogContent className="w-[min(calc(100vw-2rem),36rem)] bg-[#faf9f5]">
                <div className="flex items-start justify-between gap-4">
                  <DialogHeader>
                    <p className="text-xs font-extrabold tracking-normal text-muted-foreground">Plus</p>
                    <DialogTitle>{t("account.checkoutTitle")}</DialogTitle>
                    <DialogDescription>{t("account.checkoutDesc")}</DialogDescription>
                  </DialogHeader>
                  <DialogClose
                    aria-label={t("account.close")}
                    className="grid size-9 place-items-center"
                    type="button"
                  >
                    <X className="size-4" />
                  </DialogClose>
                </div>

                <Card className="border-[#e0ded4] bg-[#fffdfa] py-0">
                  <CardContent className="flex flex-col gap-2 p-4 sm:flex-row sm:items-end sm:justify-between">
                    <span className="text-sm font-extrabold text-muted-foreground">{plusPriceLabel}</span>
                    <strong className="text-3xl leading-none text-foreground">¥{plusAmountCny}</strong>
                  </CardContent>
                </Card>

                <RadioGroup
                  aria-label={t("account.selectPaytype")}
                  className="grid gap-3 sm:grid-cols-2"
                  value={selectedPaytype}
                  onValueChange={(value) => setSelectedPaytype(value)}
                >
                  {paymentOptions.map((option) => (
                    <div className="h-full" key={option.code}>
                      <Card
                        className={cn(
                          "h-full cursor-pointer border-[#e0ded4] bg-[#fffdfa] py-0 transition-colors hover:border-primary",
                          selectedPaytype === option.code && "border-primary ring-2 ring-primary/20",
                          checkoutLoading !== null && "cursor-wait opacity-75"
                        )}
                        onClick={() => {
                          if (checkoutLoading === null) setSelectedPaytype(option.code);
                        }}
                      >
                        <CardContent className="grid h-full gap-4 p-4">
                          <div className="flex items-start justify-between gap-3">
                            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-secondary text-foreground">
                              <option.Icon className="size-5" />
                            </span>
                            <RadioGroupItem
                              disabled={checkoutLoading !== null}
                              value={option.code}
                              onClick={() => setSelectedPaytype(option.code)}
                            />
                          </div>
                          <div className="grid gap-1">
                            <strong className="text-base leading-tight">{option.label}</strong>
                            <span className="text-sm leading-6 text-muted-foreground">{option.description}</span>
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  ))}
                </RadioGroup>

                <DialogFooter className="gap-3 sm:items-center sm:justify-between">
                  <p className="m-0 text-sm leading-6 text-muted-foreground">{t("account.checkoutTip")}</p>
                  <Button
                    type="button"
                    disabled={!selectedPaytype || checkoutLoading !== null}
                    onClick={() => selectedPaytype && startCheckout(selectedPaytype)}
                  >
                    {checkoutLoading ? t("account.checkoutCreating") : t("account.payNow")}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <div className="account-grid">
              <section className="panel">
                <div className="panel-head">
                  <div>
                    <p>{t("account.keysLabel")}</p>
                    <h2>{t("account.apiKeys")}</h2>
                  </div>
                  <Link className={buttonVariants({ variant: "secondary" })} href="/dashboard">{t("account.manageKey")}</Link>
                </div>
                <p className="panel-note">
                  {t("dashboard.apiKeysSub")}
                </p>
                <div className="key-list">
                  {dashboard?.api_keys.map((key) => (
                    <article className="key-row" key={key.id}>
                      <div>
                        <strong>{key.name}</strong>
                        <span>{key.key_prefix ? `${key.key_prefix}...` : t("dashboard.oldKeyPrefix")}</span>
                      </div>
                      <div>
                        <code>{key.requests_this_month} {t("account.used")}</code>
                        <small>{key.enabled ? t("dashboard.enabled") : t("dashboard.disabled")}</small>
                      </div>
                    </article>
                  ))}
                  {!loading && dashboard?.api_keys.length === 0 && (
                    <p className="muted">{t("account.noKeys")}</p>
                  )}
                </div>
              </section>

              <section className="panel dark">
                <div className="panel-head">
                  <div>
                    <p>{t("account.recent")}</p>
                    <h2>{t("account.recentUsage")}</h2>
                  </div>
                  <Link className={buttonVariants({ variant: "outline" })} href="/playground">{t("account.goPlayground")}</Link>
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
          overflow-x: hidden;
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
          overflow: hidden;
        }

        .quota-card {
          min-height: 164px;
          display: grid;
          align-content: space-between;
          padding: 22px;
        }

        .model-range-card {
          width: 100%;
          color: inherit;
          font: inherit;
          text-align: left;
          cursor: pointer;
          transition: transform 160ms ease, border-color 160ms ease, box-shadow 160ms ease;
        }

        .model-range-card:hover,
        .model-range-card:focus-visible {
          border-color: #c96442;
          box-shadow: 0 18px 54px rgba(201, 100, 66, 0.16);
          transform: translateY(-2px);
          outline: none;
        }

        .model-range-card em {
          color: #be5331;
          font-size: 12px;
          font-style: normal;
          font-weight: 850;
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

        .model-dialog-backdrop {
          position: fixed;
          inset: 0;
          z-index: 50;
          display: grid;
          place-items: center;
          padding: 24px;
          background: rgba(20, 20, 19, 0.48);
        }

        .model-dialog {
          width: min(620px, 100%);
          max-height: min(720px, calc(100vh - 48px));
          overflow: auto;
          border: 1px solid #e0ded4;
          border-radius: 18px;
          background: #faf9f5;
          box-shadow: 0 28px 90px rgba(20, 20, 19, 0.28);
          padding: 24px;
        }

        .model-dialog-head {
          display: flex;
          align-items: start;
          justify-content: space-between;
          gap: 18px;
          margin-bottom: 18px;
        }

        .model-dialog-head p {
          margin: 0 0 8px;
          color: #be5331;
          font-size: 12px;
          font-weight: 850;
          text-transform: uppercase;
        }

        .dialog-close {
          min-height: 44px;
          border: 1px solid #d8d5c8;
          border-radius: 999px;
          padding: 0 18px;
          color: #141413;
          background: #ebe8dc;
          font: inherit;
          font-size: 13px;
          font-weight: 850;
          cursor: pointer;
        }

        .dialog-close:hover,
        .dialog-close:focus-visible {
          border-color: #c96442;
          outline: none;
        }

        .model-list {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
        }

        .model-row {
          min-width: 0;
          display: grid;
          gap: 6px;
          border: 1px solid #e0ded4;
          border-radius: 12px;
          padding: 14px;
          background: #fffdfa;
        }

        .model-row strong,
        .model-row code {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .model-row code {
          color: #6a6861;
          font-size: 12px;
        }

        .model-dialog-note {
          margin: 16px 0 0;
          color: #6a6861;
          font-size: 13px;
          line-height: 1.7;
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
        .panel-note,
        .billing-actions {
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

        .billing-actions {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
        }

        .billing-actions span {
          color: #6a6861;
          font-weight: 750;
        }

        .panel-note {
          margin: -6px 0 16px;
        }

        .account-grid {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 0.88fr);
          gap: 18px;
          margin-top: 18px;
          min-width: 0;
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
            padding: 0 14px 32px;
            overflow-x: hidden;
          }

          .account-hero,
          .account-grid {
            grid-template-columns: 1fr;
            display: grid;
            min-width: 0;
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
          .plan-note,
          .billing-actions {
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
            overflow-wrap: anywhere;
          }

          .key-row > div:last-child,
          .usage-row > div:last-child {
            justify-items: start;
          }

          .key-row strong,
          .usage-row strong,
          .model-row strong,
          .model-row code {
            white-space: normal;
            overflow-wrap: anywhere;
          }

          .model-dialog-backdrop {
            padding: 14px;
          }

          .model-dialog {
            border-radius: 12px;
            padding: 18px;
          }

          .model-dialog-head {
            display: grid;
            grid-template-columns: 1fr;
          }

          .model-list {
            grid-template-columns: 1fr;
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
    return json.error?.message ?? `${response.status} ${response.statusText}`;
  } catch {
    return `${response.status} ${response.statusText}`;
  }
}
