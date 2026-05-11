"use client";

import { useEffect, useRef } from "react";
import { SiteFooter } from "../components/SiteFooter";
import { SiteHeader } from "../components/SiteHeader";

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

export function LoginPageClient({ style, html }: LoginPageClientProps) {
  const rootRef = useRef<HTMLDivElement>(null);

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
        title: "欢迎回来",
        subtitle: "登录后管理余额、API Key、调用记录和文档。",
      },
      register: {
        title: "创建账号",
        subtitle: "注册后即可充值余额，获取 AIJinAPI Key。",
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
      setError(input, ok ? "" : `请输入${label}`);
      return ok;
    }

    function showToast(message: string) {
      const toastMessage = toast?.querySelector<HTMLElement>("span");
      if (!toast || !toastMessage) return;

      toastMessage.textContent = message;
      toast.classList.add("show");
      if (toastTimer) window.clearTimeout(toastTimer);
      toastTimer = window.setTimeout(() => toast.classList.remove("show"), 2400);
    }

    function setButtonBusy(button: HTMLButtonElement | null, busy: boolean) {
      if (!button) return;
      button.disabled = busy;
      button.classList.toggle("loading", busy);
    }

    function persistSession(payload: AuthResponse) {
      window.localStorage.setItem("aijinapi_session_token", payload.session_token);
      window.localStorage.setItem("aijinapi_user", JSON.stringify(payload.user));
      if (payload.api_key?.key) {
        window.localStorage.setItem("aijinapi_latest_customer_key", payload.api_key.key);
      }
    }

    async function parseError(response: Response) {
      const text = await response.text();
      if (!text) return `请求失败：${response.status}`;
      try {
        const json = JSON.parse(text) as ErrorResponse;
        return json.error?.message || json.error?.code || text;
      } catch {
        return text;
      }
    }

    async function postAuth(path: "/auth/login" | "/auth/register", payload: object) {
      const response = await fetch(`${backendUrl}${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal,
      });

      if (!response.ok) {
        throw new Error(await parseError(response));
      }

      return (await response.json()) as AuthResponse;
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
        weak: "弱",
        medium: "中",
        strong: "强",
        "": "-",
      };
      strength.dataset.level = level;
      strengthLabel.textContent = labelMap[level];
    }

    function validatePasswordMatch(live = false) {
      if (!registerPassword || !confirmPassword) return false;
      if (!confirmPassword.value.trim()) {
        if (!live) setError(confirmPassword, "请再次输入密码");
        return false;
      }
      const ok = registerPassword.value === confirmPassword.value;
      setError(confirmPassword, ok ? "" : "两次输入的密码不一致");
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
          button.setAttribute("aria-label", next === "password" ? "显示密码" : "隐藏密码");
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
          const payload = await postAuth("/auth/login", {
            email: email.value.trim(),
            password: password.value,
          });
          persistSession(payload);
          showToast("登录成功，正在进入控制台");
          window.setTimeout(() => {
            window.location.href = "/dashboard";
          }, 350);
        } catch (error) {
          showToast(error instanceof Error ? error.message : "登录失败");
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

        if (!terms?.checked) showToast("请先同意服务条款");
        if (!valid || !terms?.checked || !name || !email || !registerPassword) return;

        setButtonBusy(submitter, true);
        try {
          const payload = await postAuth("/auth/register", {
            name: name.value.trim(),
            email: email.value.trim(),
            password: registerPassword.value,
          });
          persistSession(payload);
          showToast("注册成功，API Key 已生成");
          window.setTimeout(() => {
            window.location.href = "/dashboard";
          }, 350);
        } catch (error) {
          showToast(error instanceof Error ? error.message : "注册失败");
        } finally {
          setButtonBusy(submitter, false);
        }
      },
      { signal },
    );

    updateStrength();

    return () => {
      controller.abort();
      if (toastTimer) window.clearTimeout(toastTimer);
    };
  }, []);

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
          }
        }
      `}</style>
    </div>
  );
}
