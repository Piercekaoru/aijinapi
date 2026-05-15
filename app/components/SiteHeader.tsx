"use client";

import Link from "next/link";
import { Menu, X } from "lucide-react";
import { usePathname } from "next/navigation";
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
  const [menuOpen, setMenuOpen] = useState(false);
  const navItems = variant === "workspace" ? workspaceNavItems : publicNavItems;
  const pathname = usePathname();

  const initial = useMemo(() => {
    const source = user?.name || user?.email || "A";
    return source.trim().slice(0, 1).toUpperCase();
  }, [user]);

  useEffect(() => {
    const storedToken = window.localStorage.getItem("openachieve_session_token") ?? "";
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
        window.localStorage.setItem("openachieve_user", JSON.stringify(freshUser));
        setUser(freshUser);
      } catch {
        // Keep cached user when backend is temporarily unavailable.
      }
    }

    void hydrateUser();

    return () => controller.abort();
  }, []);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  function logout() {
    clearSession();
    window.location.href = logoutRedirect;
  }

  function renderAccountActions() {
    return token ? (
      <>
        <Link className={cn("account-chip", active === "account" && "active")} href={siteRoutes.account.href}>
          <span className="account-avatar">{initial}</span>
          <span className="account-copy">
            <strong>{user?.name || "账号总览"}</strong>
            <small>{user?.email || "Key 控制台"}</small>
          </span>
        </Link>
        {variant === "public" && (
          <Link className={buttonVariants({ variant: "default" })} href={siteRoutes.dashboard.href}>
            {siteRoutes.dashboard.label}
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
    );
  }

  return (
    <header className="site-header">
      <div className="site-header-brand">
        <Link className="site-brand" href="/">
          OpenAchieve
        </Link>
      </div>

      <div className="site-header-mobile-controls">
        <button
          className="mobile-menu-button"
          type="button"
          aria-label={menuOpen ? "关闭菜单" : "打开菜单"}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? <X size={18} aria-hidden="true" /> : <Menu size={18} aria-hidden="true" />}
        </button>
      </div>

      <div className="site-header-center">
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
      </div>

      <div className="site-header-right">
        {renderAccountActions()}
      </div>

      <div className={cn("site-mobile-menu", menuOpen && "open")}>
        <nav aria-label="移动端导航">
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
        <div className="mobile-actions">{renderAccountActions()}</div>
      </div>

      <style jsx>{`
        .site-header {
          position: relative;
          min-height: 88px;
          display: grid;
          grid-template-columns: auto 1fr auto;
          align-items: center;
          gap: 24px;
          border-bottom: 1px solid #e8e6dc;
          padding: 0 4px;
          overflow-x: hidden;
        }

        .site-header-brand {
          display: flex;
          align-items: center;
        }

        .site-header-mobile-controls,
        .site-mobile-menu {
          display: none;
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
          transition: color 0.18s ease;
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

        .site-header-center {
          display: flex;
          align-items: center;
          justify-content: center;
        }

        nav {
          display: inline-flex;
          align-items: center;
          gap: 28px;
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

        .site-header-right {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 10px;
        }

        .mobile-menu-button {
          width: 40px;
          height: 40px;
          display: inline-grid;
          place-items: center;
          border: 1px solid #d8d5ca;
          border-radius: 10px;
          color: #141413;
          background: #faf9f5;
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
          background: #f5f4ed;
          box-shadow: 0 0 0 1px #c96442;
        }

        .account-avatar {
          width: 36px;
          height: 36px;
          display: grid;
          place-items: center;
          border-radius: 11px;
          background: #e8e6dc;
          font-size: 15px;
          font-weight: 700;
          color: #4d4c48;
          flex-shrink: 0;
        }

        .account-copy {
          display: grid;
          gap: 1px;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .account-copy strong {
          color: #141413;
          font-size: 14px;
          font-weight: 700;
          line-height: 1;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .account-copy small {
          color: #6a6861;
          font-size: 11px;
          line-height: 1;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        @media (max-width: 980px) {
          .site-header {
            min-height: 72px;
            grid-template-columns: minmax(0, 1fr) auto;
            gap: 12px;
            padding: 14px 0;
            overflow-x: hidden;
          }

          .site-header-brand {
            min-width: 0;
            overflow: hidden;
          }

          .site-header-center,
          .site-header-right {
            display: none;
          }

          .site-header-mobile-controls {
            display: inline-flex;
            align-items: center;
            justify-content: flex-end;
            gap: 8px;
            flex-shrink: 0;
          }

          .site-mobile-menu {
            grid-column: 1 / -1;
            display: none;
            border: 1px solid #d8d5ca;
            border-radius: 14px;
            padding: 12px;
            background: rgba(250, 249, 245, 0.96);
            box-shadow: 0 16px 40px rgba(20, 20, 19, 0.08);
            overflow: hidden;
          }

          .site-mobile-menu.open {
            display: grid;
            gap: 12px;
          }

          .site-mobile-menu nav {
            display: grid;
            gap: 4px;
            width: 100%;
          }

          .site-mobile-menu nav :global(a) {
            min-height: 42px;
            display: flex;
            align-items: center;
            border-radius: 10px;
            padding: 0 10px;
            font-size: 15px;
          }

          .site-mobile-menu nav :global(a:hover),
          .site-mobile-menu nav :global(a.active) {
            background: #eeeadd;
          }

          .mobile-actions {
            display: grid;
            gap: 8px;
            border-top: 1px solid #e8e6dc;
            padding-top: 12px;
          }

          .mobile-actions :global(a:not(.account-chip)),
          .mobile-actions :global(button) {
            width: 100%;
          }

          .mobile-actions :global(.account-chip) {
            width: 100%;
            max-width: none;
          }

          .mobile-actions .account-copy {
            overflow: hidden;
          }
        }

        @media (max-width: 520px) {
          :global(.site-brand) {
            font-size: 22px;
          }

          .site-mobile-menu .account-copy {
            display: grid;
          }

          .site-header-right .account-copy {
            display: none;
          }

          .site-header-right :global(.account-chip) {
            padding: 5px 6px;
          }
        }
      `}</style>
    </header>
  );
}

function readStoredUser(): PublicUser | null {
  try {
    const raw = window.localStorage.getItem("openachieve_user");
    return raw ? (JSON.parse(raw) as PublicUser) : null;
  } catch {
    return null;
  }
}

function clearSession() {
  window.localStorage.removeItem("openachieve_session_token");
  window.localStorage.removeItem("openachieve_user");
}
