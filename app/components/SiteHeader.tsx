"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  publicNavItems,
  siteRoutes,
  type SiteRouteKey,
  workspaceNavItems,
} from "@/lib/site-routes";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const defaultBackendUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/+$/, "") ?? "/api/backend";

type PublicUser = {
  id: number;
  email: string;
  name: string;
  created_at: string;
};

type SiteHeaderProps = {
  active?: SiteRouteKey;
  variant?: "public" | "workspace";
  logoutRedirect?: string;
};

export function SiteHeader({ active, variant = "public", logoutRedirect = "/" }: SiteHeaderProps) {
  const [token, setToken] = useState("");
  const [user, setUser] = useState<PublicUser | null>(null);
  const navItems = variant === "workspace" ? workspaceNavItems : publicNavItems;

  const initial = useMemo(() => {
    const source = user?.name || user?.email || "A";
    return source.trim().slice(0, 1).toUpperCase();
  }, [user]);

  useEffect(() => {
    const storedToken = window.localStorage.getItem("aijinapi_session_token") ?? "";
    setToken(storedToken);
    setUser(readStoredUser());

    if (!storedToken) return;

    const controller = new AbortController();

    async function hydrateUser() {
      try {
        const response = await fetch(`${defaultBackendUrl}/auth/me`, {
          headers: {
            Authorization: `Bearer ${storedToken}`,
          },
          signal: controller.signal,
        });

        if (!response.ok) {
          clearSession();
          setToken("");
          setUser(null);
          return;
        }

        const freshUser = (await response.json()) as PublicUser;
        window.localStorage.setItem("aijinapi_user", JSON.stringify(freshUser));
        setUser(freshUser);
      } catch {
        // Keep the local account hint when the backend is temporarily unavailable.
      }
    }

    void hydrateUser();

    return () => controller.abort();
  }, []);

  function logout() {
    clearSession();
    window.location.href = logoutRedirect;
  }

  return (
    <header className="site-header">
      <div className="site-header-left">
        <Link className="site-brand" href="/">
          AIJINAPI
        </Link>
      </div>

      <nav aria-label="站点导航">
        {navItems.map((item) => (
          <Link
            className={active === item.key ? "active" : ""}
            href={item.href}
            key={item.key}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="site-header-right">
        {token ? (
          <>
            <Link className={cn("account-chip", active === "account" && "active")} href="/account">
              <span className="account-avatar">{initial}</span>
              <span className="account-copy">
                <strong>{user?.name || "账号"}</strong>
                <small>{user?.email || "查看额度"}</small>
              </span>
            </Link>
            {variant === "public" && (
              <Link className={buttonVariants({ variant: "default" })} href={siteRoutes.dashboard.href}>
                控制台
              </Link>
            )}
            <Button variant="secondary" type="button" onClick={logout}>
              退出
            </Button>
          </>
        ) : (
          <>
            <Link className={buttonVariants({ variant: "secondary" })} href={siteRoutes.login.href}>
              {siteRoutes.login.label}
            </Link>
            <Link className={buttonVariants({ variant: "default" })} href={siteRoutes.register.href}>
              {siteRoutes.register.label}
            </Link>
          </>
        )}
      </div>

      <style jsx>{`
        .site-header {
          position: relative;
          min-height: 88px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 24px;
          border-bottom: 1px solid #e8e6dc;
        }

        .site-header-left,
        .site-header-right {
          flex: 1;
          display: flex;
          align-items: center;
        }

        .site-header-right {
          justify-content: flex-end;
          gap: 10px;
        }

        :global(.site-brand) {
          display: inline-flex;
          align-items: center;
          color: #141413;
          font-family: "Iowan Old Style", "Yu Mincho", "Hiragino Mincho ProN", Georgia, serif;
          font-size: 25px;
          font-weight: 600;
          letter-spacing: 0.04em;
          line-height: 1;
          white-space: nowrap;
          text-decoration: none;
          text-transform: uppercase;
          transition: color 0.18s ease, opacity 0.18s ease;
        }

        :global(.site-brand:visited),
        :global(.site-brand:active) {
          color: #141413;
          text-decoration: none;
        }

        :global(.site-brand:hover) {
          color: #c96442;
          text-decoration: none;
        }

        nav {
          position: absolute;
          left: 50%;
          transform: translateX(-50%);
          display: inline-flex;
          align-items: center;
          gap: 30px;
        }

        nav :global(a) {
          color: #5e5d59;
          font-size: 15px;
          font-weight: 700;
          background: transparent;
          text-decoration: none;
          transition: color 0.2s ease;
        }

        nav :global(a:visited) {
          color: #5e5d59;
        }

        nav :global(a:hover),
        nav :global(a.active),
        nav :global(a.active:visited) {
          color: #141413;
          text-decoration: none;
        }

        :global(.account-chip) {
          min-height: 46px;
          display: inline-flex;
          align-items: center;
          gap: 10px;
          max-width: 230px;
          border-radius: 14px;
          padding: 5px 12px 5px 6px;
          color: #141413;
          background: rgba(250, 249, 245, 0.78);
          box-shadow: 0 0 0 1px #d8d5ca;
          text-decoration: none;
        }

        :global(.account-chip:hover),
        :global(.account-chip.active) {
          background: #faf9f5;
          text-decoration: none;
        }

        .account-avatar {
          display: grid;
          width: 34px;
          height: 34px;
          flex: 0 0 auto;
          place-items: center;
          border-radius: 10px;
          color: #faf9f5;
          background: #c96442;
          font-weight: 850;
        }

        .account-copy {
          min-width: 0;
          display: grid;
          gap: 2px;
        }

        .account-copy strong,
        .account-copy small {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .account-copy strong {
          font-size: 13px;
          line-height: 1;
        }

        .account-copy small {
          color: #6a6861;
          font-size: 11px;
          line-height: 1;
        }

        @media (max-width: 980px) {
          .site-header {
            position: static;
            display: grid;
            grid-template-columns: 1fr;
            justify-items: start;
            gap: 16px;
            padding: 20px 0;
          }

          nav {
            position: static;
            transform: none;
            flex-wrap: wrap;
            gap: 14px 20px;
          }

          .site-header-right {
            justify-content: flex-start;
            flex-wrap: wrap;
          }
        }
      `}</style>
    </header>
  );
}

function clearSession() {
  window.localStorage.removeItem("aijinapi_session_token");
  window.localStorage.removeItem("aijinapi_user");
  window.localStorage.removeItem("aijinapi_latest_customer_key");
}

function readStoredUser() {
  const raw = window.localStorage.getItem("aijinapi_user");
  if (!raw) return null;

  try {
    return JSON.parse(raw) as PublicUser;
  } catch {
    return null;
  }
}
