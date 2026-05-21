"use client";

import { useCallback, useEffect, useRef } from "react";
import { useI18n } from "@/lib/i18n";
import type { Language } from "@/lib/i18n-core";
import { useDocumentTitle } from "@/lib/use-document-title";
import { SiteFooter } from "../components/SiteFooter";
import { SiteHeader } from "../components/SiteHeader";

type LoginPageClientProps = {
  style: string;
  html: Record<Language, string>;
  title: Record<Language, string>;
};

const backendUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/+$/, "") ?? "/api/backend";

type AuthResponse = {
  session_token: string;
  user: {
    id: number;
    email: string;
    name: string;
  };
  api_key?: {
    key: string;
  } | null;
};

type RegisterResponse = {
  verification_required: boolean;
  email: string;
  message: string;
};

type VerificationResponse = RegisterResponse;

type PasswordResetResponse = {
  message: string;
};

type ErrorResponse = {
  error?: {
    message?: string;
    code?: string;
  };
};

class AuthRequestError extends Error {
  code?: string;

  constructor(message: string, code?: string) {
    super(message);
    this.name = "AuthRequestError";
    this.code = code;
  }
}

const copy: Record<string, string> = {
  welcome: "欢迎回来",
  welcomeSub: "登录后管理余额、API Key、调用记录和文档。",
  register: "创建账号",
  registerSub: "注册后先验证邮箱，再获取 OpenAchieve Key。",
  requestFailed: "请求失败",
  passwordWeak: "弱",
  passwordMedium: "中",
  passwordStrong: "强",
  confirmAgain: "请再次输入密码",
  passwordMismatch: "两次输入的密码不一致",
  showPassword: "显示密码",
  hidePassword: "隐藏密码",
  loginSuccess: "登录成功，正在进入控制台",
  loginFailed: "登录失败",
  emailNotVerified: "邮箱尚未验证，请先查收验证邮件",
  resendVerification: "重新发送验证邮件",
  resendSuccess: "验证邮件已重新发送，请查收",
  resendTooSoon: "验证邮件刚刚发送过，请稍后再试",
  verified: "邮箱已验证，请登录",
  verificationInvalid: "验证链接无效或已过期，请重新发送验证邮件",
  resetRequestTitle: "找回密码",
  resetRequestSub: "输入注册邮箱，查收重置链接后设置新密码。",
  resetConfirmTitle: "设置新密码",
  resetConfirmSub: "更新后旧登录状态会失效，请使用新密码重新登录。",
  resetRequestSuccess: "如果该邮箱存在，重置邮件会发送到你的邮箱",
  resetSuccess: "密码已更新，请重新登录",
  resetInvalid: "重置链接无效或已过期，请重新申请",
  termsToast: "请先同意服务条款",
  registerSuccess: "验证邮件已发送，请查收后再登录",
  registerFailed: "注册失败",
  required: "{label} 不能为空",
  email: "邮箱",
  password: "密码",
  newPassword: "新密码",
  name: "用户名",
};

const copyEn: Record<string, string> = {
  welcome: "Welcome back",
  welcomeSub: "Log in to manage quota, API keys, usage history, and docs.",
  register: "Create account",
  registerSub: "Verify your email first, then get your OpenAchieve key.",
  requestFailed: "Request failed",
  passwordWeak: "Weak",
  passwordMedium: "Medium",
  passwordStrong: "Strong",
  confirmAgain: "Please enter the password again",
  passwordMismatch: "The two passwords do not match",
  showPassword: "Show password",
  hidePassword: "Hide password",
  loginSuccess: "Login successful, opening the console",
  loginFailed: "Login failed",
  emailNotVerified: "Email is not verified. Please check your verification email first.",
  resendVerification: "Resend verification email",
  resendSuccess: "Verification email sent. Please check your inbox.",
  resendTooSoon: "Verification email was just sent. Please try again later.",
  verified: "Email verified. Please log in.",
  verificationInvalid: "Verification link is invalid or expired. Please resend the email.",
  resetRequestTitle: "Reset password",
  resetRequestSub: "Enter your account email and use the reset link to set a new password.",
  resetConfirmTitle: "Set new password",
  resetConfirmSub: "Existing sessions will expire. Log in again with the new password.",
  resetRequestSuccess: "If the email exists, a reset email will be sent to it.",
  resetSuccess: "Password updated. Please log in again.",
  resetInvalid: "Reset link is invalid or expired. Please request a new one.",
  termsToast: "Please agree to the terms first",
  registerSuccess: "Verification email sent. Please verify before logging in.",
  registerFailed: "Sign-up failed",
  required: "{label} is required",
  email: "Email",
  password: "Password",
  newPassword: "New password",
  name: "Name",
};

function translate(key: string, language: Language) {
  const shortKey = key.split(".").at(-1) ?? key;
  const dictionary = language === "en" ? copyEn : copy;
  return dictionary[key] ?? dictionary[shortKey] ?? key;
}

export function LoginPageClient({ style, html, title }: LoginPageClientProps) {
  const { language } = useI18n();
  const rootRef = useRef<HTMLDivElement>(null);
  const t = useCallback((key: string) => translate(key, language), [language]);
  useDocumentTitle(title[language]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const controller = new AbortController();
    const signal = controller.signal;
    let toastTimer: number | undefined;

    const tabs = Array.from(root.querySelectorAll<HTMLButtonElement>(".tab"));
    const tabsWrap = root.querySelector<HTMLElement>(".tabs");
    type AuthView = "login" | "register" | "resetRequest" | "resetConfirm";
    const panels: Record<AuthView, HTMLElement | null> = {
      login: root.querySelector<HTMLElement>("#loginPanel"),
      register: root.querySelector<HTMLElement>("#registerPanel"),
      resetRequest: root.querySelector<HTMLElement>("#resetRequestPanel"),
      resetConfirm: root.querySelector<HTMLElement>("#resetConfirmPanel"),
    };
    const formTitle = root.querySelector<HTMLElement>("#formTitle");
    const subtitle = root.querySelector<HTMLElement>("#formSubtitle");
    const toast = root.querySelector<HTMLElement>("#toast");
    const forgotPassword = root.querySelector<HTMLButtonElement>("#forgotPassword");
    const resendVerification = root.querySelector<HTMLButtonElement>("#resendVerification");
    const backToLoginFromReset = root.querySelector<HTMLButtonElement>("#backToLoginFromReset");
    const backToLoginFromConfirm = root.querySelector<HTMLButtonElement>("#backToLoginFromConfirm");
    const registerPassword = root.querySelector<HTMLInputElement>("#registerPassword");
    const confirmPassword = root.querySelector<HTMLInputElement>("#confirmPassword");
    const resetEmail = root.querySelector<HTMLInputElement>("#resetEmail");
    const resetPassword = root.querySelector<HTMLInputElement>("#resetPassword");
    const resetConfirmPassword = root.querySelector<HTMLInputElement>("#resetConfirmPassword");
    const strength = root.querySelector<HTMLElement>("#strength");
    const strengthLabel = strength?.querySelector<HTMLElement>(".strength-label");
    const resetStrength = root.querySelector<HTMLElement>("#resetStrength");
    const resetStrengthLabel = resetStrength?.querySelector<HTMLElement>(".strength-label");
    let resetToken = "";

    const viewCopy: Record<AuthView, { title: string; subtitle: string }> = {
      login: {
        title: t("auth.welcome"),
        subtitle: t("auth.welcomeSub"),
      },
      register: {
        title: t("auth.register"),
        subtitle: t("auth.registerSub"),
      },
      resetRequest: {
        title: t("auth.resetRequestTitle"),
        subtitle: t("auth.resetRequestSub"),
      },
      resetConfirm: {
        title: t("auth.resetConfirmTitle"),
        subtitle: t("auth.resetConfirmSub"),
      },
    };

    function setAuthView(next: AuthView) {
      if (!tabsWrap || !formTitle || !subtitle) return;

      const tabView = next === "login" || next === "register";
      tabsWrap.hidden = !tabView;
      if (tabView) tabsWrap.dataset.active = next;
      tabs.forEach((tab) => {
        const active = tabView && tab.dataset.tab === next;
        tab.classList.toggle("active", active);
        tab.setAttribute("aria-selected", String(active));
      });
      Object.entries(panels).forEach(([view, panel]) => {
        panel?.classList.toggle("active", view === next);
      });
      formTitle.textContent = viewCopy[next].title;
      subtitle.textContent = viewCopy[next].subtitle;

      if (next === "resetRequest" && resetEmail && !resetEmail.value) {
        const loginEmail = rootRef.current?.querySelector<HTMLInputElement>("#loginEmail");
        resetEmail.value = loginEmail?.value.trim() ?? "";
      }
    }

    function fieldFor(input: HTMLInputElement) {
      return input.closest<HTMLElement>(".field");
    }

    function setError(input: HTMLInputElement, message: string) {
      const field = fieldFor(input);
      const error = field?.querySelector<HTMLElement>(".error-text");
      field?.classList.toggle("error", Boolean(message));
      if (error) error.textContent = message;
    }

    function requireValue(input: HTMLInputElement | null, label: string) {
      if (!input) return false;
      const ok = input.value.trim().length > 0;
      setError(input, ok ? "" : t("auth.required").replace("{label}", label));
      return ok;
    }

    function showToast(message: string, duration = 2400) {
      const toastMessage = toast?.querySelector<HTMLElement>("span");
      if (!toast || !toastMessage) return;

      toastMessage.textContent = message;
      toast.classList.add("show");
      if (toastTimer) window.clearTimeout(toastTimer);
      toastTimer = window.setTimeout(() => toast.classList.remove("show"), duration);
    }

    function setButtonBusy(button: HTMLButtonElement | null, busy: boolean) {
      if (!button) return;
      button.disabled = busy;
      button.classList.toggle("loading", busy);
    }

    function setResendVisible(visible: boolean) {
      if (!resendVerification) return;
      resendVerification.hidden = !visible;
    }

    function persistSession(payload: AuthResponse) {
      window.localStorage.setItem("openachieve_session_token", payload.session_token);
      window.localStorage.setItem("openachieve_user", JSON.stringify(payload.user));
      if (payload.api_key?.key) {
        window.localStorage.setItem("openachieve_latest_customer_key", payload.api_key.key);
      }
    }

    async function parseError(response: Response) {
      const text = await response.text();
      if (!text) {
        return {
          message: `${t("auth.requestFailed")}：${response.status}`,
        };
      }
      try {
        const json = JSON.parse(text) as ErrorResponse;
        return {
          message: json.error?.message || json.error?.code || text,
          code: json.error?.code,
        };
      } catch {
        return { message: text };
      }
    }

    async function postJson<T>(
      path:
        | "/auth/login"
        | "/auth/register"
        | "/auth/resend-verification"
        | "/auth/password-reset/request"
        | "/auth/password-reset/confirm",
      payload: object,
    ) {
      const response = await fetch(`${backendUrl}${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal,
      });

      if (!response.ok) {
        const parsed = await parseError(response);
        throw new AuthRequestError(parsed.message, parsed.code);
      }

      return (await response.json()) as T;
    }

    function passwordLevel(value: string) {
      let score = 0;
      if (value.length >= 8) score += 1;
      if (/[A-Z]/.test(value) && /[a-z]/.test(value)) score += 1;
      if (/\d/.test(value)) score += 1;
      if (/[^A-Za-z0-9]/.test(value)) score += 1;
      if (!value) return "";
      if (score <= 1) return "weak";
      if (score <= 3) return "medium";
      return "strong";
    }

    function updatePasswordStrength(
      input: HTMLInputElement | null,
      target: HTMLElement | null | undefined,
      label: HTMLElement | null | undefined,
    ) {
      if (!input || !target || !label) return;

      const level = passwordLevel(input.value);
      const labelMap: Record<string, string> = {
        weak: t("auth.passwordWeak"),
        medium: t("auth.passwordMedium"),
        strong: t("auth.passwordStrong"),
        "": "-",
      };
      target.dataset.level = level;
      label.textContent = labelMap[level];
    }

    function updateStrength() {
      updatePasswordStrength(registerPassword, strength, strengthLabel);
    }

    function updateResetStrength() {
      updatePasswordStrength(resetPassword, resetStrength, resetStrengthLabel);
    }

    function validatePasswordPair(
      passwordInput: HTMLInputElement | null,
      confirmInput: HTMLInputElement | null,
      live = false,
    ) {
      if (!passwordInput || !confirmInput) return false;
      if (!confirmInput.value.trim()) {
        if (!live) setError(confirmInput, t("auth.confirmAgain"));
        return false;
      }
      const ok = passwordInput.value === confirmInput.value;
      setError(confirmInput, ok ? "" : t("auth.passwordMismatch"));
      return ok;
    }

    function validatePasswordMatch(live = false) {
      return validatePasswordPair(registerPassword, confirmPassword, live);
    }

    function validateResetPasswordMatch(live = false) {
      return validatePasswordPair(resetPassword, resetConfirmPassword, live);
    }

    tabs.forEach((tab) => {
      tab.addEventListener(
        "click",
        () => {
          if (tab.dataset.tab === "login" || tab.dataset.tab === "register") {
            setAuthView(tab.dataset.tab);
          }
        },
        { signal },
      );
    });

    forgotPassword?.addEventListener("click", () => setAuthView("resetRequest"), { signal });
    backToLoginFromReset?.addEventListener("click", () => setAuthView("login"), { signal });
    backToLoginFromConfirm?.addEventListener(
      "click",
      () => {
        resetToken = "";
        window.history.replaceState({}, "", "/login");
        setAuthView("login");
      },
      { signal },
    );

    root.querySelectorAll<HTMLButtonElement>(".toggle-password").forEach((button) => {
      button.addEventListener(
        "click",
        () => {
          const target = button.dataset.target;
          const input = target ? root.querySelector<HTMLInputElement>(`#${target}`) : null;
          if (!input) return;

          const next = input.type === "password" ? "text" : "password";
          input.type = next;
          button.setAttribute("aria-label", next === "password" ? t("auth.showPassword") : t("auth.hidePassword"));
        },
        { signal },
      );
    });

    root.querySelectorAll<HTMLInputElement>("input").forEach((input) => {
      input.addEventListener(
        "input",
        () => {
          if (fieldFor(input)) setError(input, "");
        },
        { signal },
      );
    });

    registerPassword?.addEventListener(
      "input",
      () => {
        updateStrength();
        if (confirmPassword?.value) validatePasswordMatch(true);
      },
      { signal },
    );
    confirmPassword?.addEventListener("input", () => validatePasswordMatch(true), { signal });
    resetPassword?.addEventListener(
      "input",
      () => {
        updateResetStrength();
        if (resetConfirmPassword?.value) validateResetPasswordMatch(true);
      },
      { signal },
    );
    resetConfirmPassword?.addEventListener("input", () => validateResetPasswordMatch(true), { signal });

    panels.login?.addEventListener(
      "submit",
      async (event) => {
        event.preventDefault();
        const email = root.querySelector<HTMLInputElement>("#loginEmail");
        const password = root.querySelector<HTMLInputElement>("#loginPassword");
        const valid = [requireValue(email, t("auth.email")), requireValue(password, t("auth.password"))].every(Boolean);
        const submitter = (event as SubmitEvent).submitter as HTMLButtonElement | null;
        if (!valid || !email || !password) return;

        setButtonBusy(submitter, true);
        setResendVisible(false);
        try {
          const payload = await postJson<AuthResponse>("/auth/login", {
            email: email.value.trim(),
            password: password.value,
          });
          persistSession(payload);
          showToast(t("auth.loginSuccess"));
          window.setTimeout(() => {
            window.location.href = "/dashboard";
          }, 350);
        } catch (error) {
          if (error instanceof AuthRequestError && error.code === "email_not_verified") {
            showToast(t("auth.emailNotVerified"), 3600);
            setResendVisible(true);
          } else {
            showToast(error instanceof Error ? error.message : t("auth.loginFailed"));
          }
        } finally {
          setButtonBusy(submitter, false);
        }
      },
      { signal },
    );

    resendVerification?.addEventListener(
      "click",
      async () => {
        const email = root.querySelector<HTMLInputElement>("#loginEmail");
        const password = root.querySelector<HTMLInputElement>("#loginPassword");
        const valid = [requireValue(email, t("auth.email")), requireValue(password, t("auth.password"))].every(Boolean);
        if (!valid || !email || !password) return;

        setButtonBusy(resendVerification, true);
        try {
          await postJson<VerificationResponse>("/auth/resend-verification", {
            email: email.value.trim(),
            password: password.value,
          });
          showToast(t("auth.resendSuccess"), 3600);
          setResendVisible(false);
        } catch (error) {
          if (error instanceof AuthRequestError && error.code === "verification_email_recently_sent") {
            showToast(t("auth.resendTooSoon"), 3600);
          } else {
            showToast(error instanceof Error ? error.message : t("auth.registerFailed"));
          }
        } finally {
          setButtonBusy(resendVerification, false);
        }
      },
      { signal },
    );

    panels.resetRequest?.addEventListener(
      "submit",
      async (event) => {
        event.preventDefault();
        const valid = requireValue(resetEmail, t("auth.email"));
        const submitter = (event as SubmitEvent).submitter as HTMLButtonElement | null;
        if (!valid || !resetEmail) return;

        setButtonBusy(submitter, true);
        try {
          await postJson<PasswordResetResponse>("/auth/password-reset/request", {
            email: resetEmail.value.trim(),
          });
          showToast(t("auth.resetRequestSuccess"), 4200);
          setAuthView("login");
        } catch (error) {
          showToast(error instanceof Error ? error.message : t("auth.requestFailed"));
        } finally {
          setButtonBusy(submitter, false);
        }
      },
      { signal },
    );

    panels.resetConfirm?.addEventListener(
      "submit",
      async (event) => {
        event.preventDefault();
        const valid = [
          requireValue(resetPassword, t("auth.newPassword")),
          validateResetPasswordMatch(false),
        ].every(Boolean);
        const submitter = (event as SubmitEvent).submitter as HTMLButtonElement | null;
        if (!valid || !resetToken || !resetPassword) {
          if (!resetToken) showToast(t("auth.resetInvalid"), 3600);
          return;
        }

        setButtonBusy(submitter, true);
        try {
          await postJson<PasswordResetResponse>("/auth/password-reset/confirm", {
            token: resetToken,
            password: resetPassword.value,
          });
          resetToken = "";
          resetPassword.value = "";
          if (resetConfirmPassword) resetConfirmPassword.value = "";
          updateResetStrength();
          window.history.replaceState({}, "", "/login");
          showToast(t("auth.resetSuccess"), 4200);
          setAuthView("login");
        } catch (error) {
          showToast(error instanceof Error ? error.message : t("auth.resetInvalid"), 4200);
        } finally {
          setButtonBusy(submitter, false);
        }
      },
      { signal },
    );

    panels.register?.addEventListener(
      "submit",
      async (event) => {
        event.preventDefault();
        const name = root.querySelector<HTMLInputElement>("#registerName");
        const email = root.querySelector<HTMLInputElement>("#registerEmail");
        const terms = root.querySelector<HTMLInputElement>("#terms");
        const valid = [
          requireValue(name, t("auth.name")),
          requireValue(email, t("auth.email")),
          requireValue(registerPassword, t("auth.password")),
          validatePasswordMatch(false),
        ].every(Boolean);
        const submitter = (event as SubmitEvent).submitter as HTMLButtonElement | null;

        if (!terms?.checked) showToast(t("auth.termsToast"));
        if (!valid || !terms?.checked || !name || !email || !registerPassword) return;

        setButtonBusy(submitter, true);
        try {
          const payload = await postJson<RegisterResponse>("/auth/register", {
            name: name.value.trim(),
            email: email.value.trim(),
            password: registerPassword.value,
          });
          showToast(t("auth.registerSuccess"));
          const loginEmail = root.querySelector<HTMLInputElement>("#loginEmail");
          const loginPassword = root.querySelector<HTMLInputElement>("#loginPassword");
          if (loginEmail) loginEmail.value = payload.email;
          if (loginPassword) loginPassword.value = "";
          setAuthView("login");
        } catch (error) {
          showToast(error instanceof Error ? error.message : t("auth.registerFailed"));
        } finally {
          setButtonBusy(submitter, false);
        }
      },
      { signal },
    );

    updateStrength();
    updateResetStrength();
    const params = new URLSearchParams(window.location.search);
    resetToken = params.get("reset_token") ?? "";
    if (resetToken) {
      setAuthView("resetConfirm");
    } else if (params.get("mode") === "register") {
      setAuthView("register");
    }
    if (params.get("verified") === "1") {
      setAuthView("login");
      showToast(t("auth.verified"), 3600);
    }
    if (params.get("verification") === "invalid") {
      setAuthView("login");
      showToast(t("auth.verificationInvalid"), 4200);
      setResendVisible(true);
    }

    return () => {
      controller.abort();
      if (toastTimer) window.clearTimeout(toastTimer);
    };
  }, [language, t]);

  return (
    <div>
      <style dangerouslySetInnerHTML={{ __html: style }} />
      <div className="static-page-chrome">
        <SiteHeader variant="public" />
      </div>
      <div key={language} ref={rootRef} dangerouslySetInnerHTML={{ __html: html[language] }} />
      <SiteFooter />
      <style jsx>{`
        .static-page-chrome {
          width: min(1220px, calc(100% - 48px));
          margin: 0 auto;
        }

        @media (max-width: 760px) {
          .static-page-chrome {
            width: min(100% - 28px, 1220px);
            overflow: hidden;
          }
        }
      `}</style>
    </div>
  );
}
