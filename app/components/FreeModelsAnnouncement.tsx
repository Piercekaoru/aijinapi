"use client";

import { X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { loadPublicFreeModels, modelDisplayName, type PublicFreeModel } from "@/lib/free-models";

const publicPaths = new Set(["/", "/models", "/docs", "/login", "/terms"]);

const sessionStorageKey = "openachieve_free_models_announcement_closed";
const todayStorageKey = "openachieve_free_models_announcement_closed_date";

export function FreeModelsAnnouncement() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const [freeModels, setFreeModels] = useState<PublicFreeModel[]>([]);
  const [catalogFailed, setCatalogFailed] = useState(false);

  const isPublicPage = useMemo(() => publicPaths.has(pathname), [pathname]);

  useEffect(() => {
    if (!isPublicPage) {
      setVisible(false);
      return;
    }

    const hiddenForSession = safeSessionGet(sessionStorageKey) === "1";
    const hiddenToday = safeLocalGet(todayStorageKey) === localDateKey();
    setVisible(!hiddenForSession && !hiddenToday);
  }, [isPublicPage, pathname]);

  useEffect(() => {
    if (!isPublicPage) return;

    const controller = new AbortController();
    loadPublicFreeModels(controller.signal)
      .then((catalog) => {
        setFreeModels(catalog.fail_closed ? [] : catalog.data);
        setCatalogFailed(Boolean(catalog.fail_closed));
      })
      .catch(() => {
        setFreeModels([]);
        setCatalogFailed(true);
      });

    return () => controller.abort();
  }, [isPublicPage, pathname]);

  useEffect(() => {
    if (!visible) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeForSession();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [visible]);

  function closeForSession() {
    safeSessionSet(sessionStorageKey, "1");
    setVisible(false);
  }

  function closeForToday() {
    safeLocalSet(todayStorageKey, localDateKey());
    safeSessionSet(sessionStorageKey, "1");
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="free-model-announcement" role="presentation" onClick={closeForSession}>
      <div
        aria-labelledby="free-model-announcement-title"
        aria-modal="true"
        className="announcement-card"
        role="dialog"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          aria-label="关闭弹窗"
          className="announcement-close"
          type="button"
          onClick={closeForSession}
        >
          <X size={18} aria-hidden="true" />
        </button>

        <div className="announcement-visual">
          <div className="announcement-pill">Free Models</div>
          <p className="announcement-caption">
            {freeModels.length > 0
              ? `当前 Free 可用：${freeModels.map((model) => modelDisplayName(model.id)).join("、")}`
              : "当前免费模型池正在同步 OpenCode Zen"}
          </p>
        </div>

        <div className="announcement-copy">
          <div>
            <p className="announcement-eyebrow">OpenAchieve Free</p>
            <h2 id="free-model-announcement-title">当前可用免费模型</h2>
          </div>
          <p>
            Free 用户每月 500 次请求额度，可调用实时同步的免费模型池。免费模型适合接入验证、轻量实验和非敏感内容探索。
          </p>
        </div>

        <div className="model-list" aria-label="免费模型列表">
          {freeModels.length > 0 ? (
            freeModels.map((model) => (
              <div className="model-item" key={model.id}>
                <strong>{modelDisplayName(model.id)}</strong>
                <code>{model.id}</code>
              </div>
            ))
          ) : (
            <div className="model-item">
              <strong>{catalogFailed ? "暂时不可用" : "正在同步"}</strong>
              <code>{catalogFailed ? "fail-closed" : "syncing"}</code>
            </div>
          )}
        </div>

        <div className="announcement-actions">
          <button className="secondary-action" type="button" onClick={closeForSession}>
            关闭
          </button>
          <button className="primary-action" type="button" onClick={closeForToday}>
            今日不再显示
          </button>
        </div>
      </div>

      <style jsx>{`
        .free-model-announcement {
          position: fixed;
          inset: 0;
          z-index: 80;
          display: grid;
          place-items: center;
          padding: 24px;
          background:
            linear-gradient(135deg, rgb(20 20 19 / 0.38), rgb(20 20 19 / 0.18)),
            rgb(20 20 19 / 0.18);
          backdrop-filter: blur(10px);
        }

        .announcement-card {
          position: relative;
          width: min(100%, 720px);
          max-height: min(780px, calc(100vh - 32px));
          overflow: auto;
          padding: 0;
          border: 1px solid rgb(255 255 255 / 0.55);
          border-radius: 28px;
          background: #fbf7f3;
          box-shadow: 0 28px 100px rgb(20 20 19 / 0.28);
        }

        .announcement-close {
          position: absolute;
          top: 16px;
          right: 16px;
          z-index: 2;
          display: inline-flex;
          width: 40px;
          height: 40px;
          align-items: center;
          justify-content: center;
          border: 1px solid rgb(20 20 19 / 0.12);
          border-radius: 999px;
          background: rgb(255 255 255 / 0.76);
          color: #2b2926;
          cursor: pointer;
          transition:
            background-color 0.18s ease,
            transform 0.18s ease;
        }

        .announcement-close:hover,
        .announcement-close:focus-visible {
          background: #ffffff;
          transform: translateY(-1px);
        }

        .announcement-visual {
          position: relative;
          min-height: 205px;
          display: grid;
          place-items: center;
          padding: 38px 32px;
          background:
            conic-gradient(from 210deg at 72% 6%, #ff6a43, #f589d8, #c7dfff, #fff0a8, #ff6a43),
            linear-gradient(135deg, #cfe0ff 0%, #f58acf 45%, #ff8a55 76%, #f7d477 100%);
          filter: saturate(1.08);
        }

        .announcement-pill {
          display: inline-flex;
          max-width: 100%;
          align-items: center;
          justify-content: center;
          border-radius: 32px;
          background: rgb(255 255 255 / 0.88);
          color: #151414;
          padding: 18px 32px;
          font-size: 34px;
          font-weight: 780;
          line-height: 1;
          box-shadow:
            0 20px 60px rgb(20 20 19 / 0.14),
            inset 0 0 0 1px rgb(255 255 255 / 0.64);
          text-align: center;
          white-space: normal;
        }

        .announcement-caption {
          position: absolute;
          left: 20px;
          right: 20px;
          bottom: 14px;
          max-width: max-content;
          margin: 0 auto;
          border-radius: 10px;
          background: rgb(32 23 20 / 0.84);
          color: #fffaf4;
          padding: 9px 13px;
          font-size: 15px;
          font-weight: 780;
          line-height: 1.35;
          text-align: center;
          overflow-wrap: anywhere;
          box-shadow: 0 14px 32px rgb(20 20 19 / 0.16);
        }

        .announcement-copy {
          display: grid;
          gap: 12px;
          padding: 20px 32px 14px;
          background: #fbf7f3;
        }

        .announcement-eyebrow {
          margin: 0 0 8px;
          color: #c96442;
          font-size: 12px;
          font-weight: 850;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .announcement-copy h2 {
          margin: 0;
          color: #151414;
          font-size: 26px;
          font-weight: 860;
          line-height: 1.1;
          letter-spacing: 0;
        }

        .announcement-copy p {
          margin: 0;
          color: #5f5b55;
          font-size: 14px;
          line-height: 1.58;
        }

        .model-list {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
          padding: 0 32px 16px;
        }

        .model-item {
          display: grid;
          min-width: 0;
          gap: 7px;
          border: 1px solid #e4ded2;
          border-radius: 14px;
          background: #fffdf9;
          padding: 10px 14px;
        }

        .model-item strong {
          min-width: 0;
          color: #171615;
          font-size: 13px;
          font-weight: 820;
          line-height: 1.25;
        }

        .model-item code {
          min-width: 0;
          color: #6f6a63;
          font-family: var(--font-sans), ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: 11px;
          line-height: 1.4;
          overflow-wrap: anywhere;
        }

        .announcement-actions {
          position: sticky;
          bottom: 0;
          z-index: 1;
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 10px;
          border-top: 1px solid #ebe5da;
          padding: 12px 32px 16px;
          background: #fbf7f3;
        }

        .announcement-actions button {
          min-height: 44px;
          border-radius: 999px;
          padding: 0 18px;
          font-size: 14px;
          font-weight: 840;
          line-height: 1;
          white-space: nowrap;
          cursor: pointer;
          transition:
            background-color 0.18s ease,
            border-color 0.18s ease,
            color 0.18s ease,
            transform 0.18s ease;
        }

        .announcement-actions button:hover,
        .announcement-actions button:focus-visible {
          transform: translateY(-1px);
        }

        .secondary-action {
          border: 1px solid #d8d2c6;
          background: #ffffff;
          color: #3d3a36;
        }

        .primary-action {
          border: 1px solid #151414;
          background: #151414;
          color: #fffdf9;
        }

        @media (max-width: 640px) {
          .free-model-announcement {
            padding: 14px;
          }

          .announcement-card {
            border-radius: 22px;
          }

          .announcement-visual {
            min-height: 216px;
            padding: 40px 22px;
          }

          .announcement-pill {
            border-radius: 24px;
            padding: 17px 22px;
            font-size: 28px;
          }

          .announcement-caption {
            left: 12px;
            right: 12px;
            bottom: 12px;
            font-size: 13px;
          }

          .announcement-copy {
            padding: 22px 20px 18px;
          }

          .announcement-copy h2 {
            font-size: 25px;
          }

          .model-list {
            grid-template-columns: 1fr;
            padding: 0 20px 22px;
          }

          .announcement-actions {
            flex-direction: column;
            align-items: stretch;
            padding: 16px 20px 22px;
          }

          .announcement-actions button {
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
}

function localDateKey() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function safeLocalGet(key: string) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeLocalSet(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore storage failures in private browsing or restricted contexts.
  }
}

function safeSessionGet(key: string) {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSessionSet(key: string, value: string) {
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // Ignore storage failures in private browsing or restricted contexts.
  }
}
