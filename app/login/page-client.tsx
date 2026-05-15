"use client";

import { useEffect, useRef } from "react";
import { SiteFooter } from "../components/SiteFooter";
import { SiteHeader } from "../components/SiteHeader";
import { useLocale } from "@/lib/i18n/context";

type LoginPageClientProps = {
  style: string;
  html: string;
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

export function LoginPageClient({ style, html }: LoginPageClientProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const { t } = useLocale();

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const controller = new AbortController();
    const signal = controller.signal;
    let toastTimer: number | undefined;

    const tabs = Array.from(root.querySelectorAll<HTMLButtonElement>(".tab"));
    const tabsWrap = root.querySelector<HTMLElement>(".tabs");
    const panels = {
      login: root.querySelector<HTMLElement>("#loginPanel"),
      register: root.querySelector<HTMLElement>("#registerPanel"),
    };
    const title = root.querySelector<HTMLElement>("#formTitle");
    const subtitle = root.querySelector<HTMLElement>("#formSubtitle");
    const toast = root.querySelector<HTMLElement>("#toast");
    const registerPassword = root.querySelector<HTMLInputElement>("#registerPassword");
    const confirmPassword = root.querySelector<HTMLInputElement>("#confirmPassword");
    const strength = root.querySelector<HTMLElement>("#strength");
    const strengthLabel = strength?.querySelector<HTMLElement>(".strength-label");

    const copy = {
      login: {
        title: t("auth.welcome"),
        subtitle: t("auth.welcomeSub"),
      },
      register: {
        title: t("auth.register"),
        subtitle: t("auth.registerSub"),
      },
    };

    function setTab(next: "login" | "register") {
      if (!tabsWrap || !title || !subtitle) return;

      tabsWrap.dataset.active = next;
      tabs.forEach((tab) => {
        const active = tab.dataset.tab === next;
        tab.classList.toggle("active", active);
        tab.setAttribute("aria-selected", String(active));
      });
      panels.login?.classList.toggle("active", next === "login");
      panels.register?.classList.toggle("active", next === "register");
      title.textContent = copy[next].title;
      subtitle.textContent = copy[next].subtitle;
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
      setError(input, ok ? "" : `${label} 不能为空`);
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
      path: "/auth/login" | "/auth/register",
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

    function updateStrength() {
      if (!registerPassword || !strength || !strengthLabel) return;

      const level = passwordLevel(registerPassword.value);
      const labelMap: Record<string, string> = {
        weak: t("auth.passwordWeak"),
        medium: t("auth.passwordMedium"),
        strong: t("auth.passwordStrong"),
        "": "-",
      };
      strength.dataset.level = level;
      strengthLabel.textContent = labelMap[level];
    }

    function validatePasswordMatch(live = false) {
      if (!registerPassword || !confirmPassword) return false;
      if (!confirmPassword.value.trim()) {
        if (!live) setError(confirmPassword, t("auth.confirmAgain"));
        return false;
      }
      const ok = registerPassword.value === confirmPassword.value;
      setError(confirmPassword, ok ? "" : t("auth.passwordMismatch"));
      return ok;
    }

    tabs.forEach((tab) => {
      tab.addEventListener(
        "click",
        () => {
          if (tab.dataset.tab === "login" || tab.dataset.tab === "register") {
            setTab(tab.dataset.tab);
          }
        },
        { signal },
      );
    });

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

    panels.login?.addEventListener(
      "submit",
      async (event) => {
        event.preventDefault();
        const email = root.querySelector<HTMLInputElement>("#loginEmail");
        const password = root.querySelector<HTMLInputElement>("#loginPassword");
        const valid = [requireValue(email, "邮箱"), requireValue(password, "密码")].every(Boolean);
        const submitter = (event as SubmitEvent).submitter as HTMLButtonElement | null;
        if (!valid || !email || !password) return;

        setButtonBusy(submitter, true);
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
          showToast(error instanceof Error ? error.message : t("auth.loginFailed"));
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
          requireValue(name, "用户名"),
          requireValue(email, "邮箱"),
          requireValue(registerPassword, "密码"),
          validatePasswordMatch(false),
        ].every(Boolean);
        const submitter = (event as SubmitEvent).submitter as HTMLButtonElement | null;

        if (!terms?.checked) showToast(t("auth.termsToast"));
        if (!valid || !terms?.checked || !name || !email || !registerPassword) return;

        setButtonBusy(submitter, true);
        try {
          const payload = await postJson<AuthResponse>("/auth/register", {
            name: name.value.trim(),
            email: email.value.trim(),
            password: registerPassword.value,
          });
          persistSession(payload);
          showToast(t("auth.registerSuccess"));
          window.setTimeout(() => {
            window.location.href = "/dashboard";
          }, 350);
        } catch (error) {
          showToast(error instanceof Error ? error.message : t("auth.registerFailed"));
        } finally {
          setButtonBusy(submitter, false);
        }
      },
      { signal },
    );

    updateStrength();
    const params = new URLSearchParams(window.location.search);
    if (params.get("mode") === "register") setTab("register");

    return () => {
      controller.abort();
      if (toastTimer) window.clearTimeout(toastTimer);
    };
  }, [t]);

  return (
    <div>
      <style dangerouslySetInnerHTML={{ __html: style }} />
      <div className="static-page-chrome">
        <SiteHeader variant="public" />
      </div>
      <div ref={rootRef} dangerouslySetInnerHTML={{ __html: html }} />
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
