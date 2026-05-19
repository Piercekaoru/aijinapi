"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import type { Language } from "@/lib/i18n-core";
import { SiteFooter } from "../components/SiteFooter";
import { SiteHeader } from "../components/SiteHeader";

const defaultBackendUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/+$/, "") ?? "/api/backend";

type ModelListResponse = {
  data?: Array<{ id?: string }>;
};

const copyZh: Record<string, string> = {
  title: "API 调试台",
  label: "接口调试",
  apiBaseURL: "接口地址",
  apiKey: "API Key",
  model: "模型",
  message: "消息",
  send: "发送请求",
  loadModels: "获取模型列表",
  waiting: "等待请求",
  loadingModels: "正在读取模型列表...",
  loadingChatStream: "正在读取流式响应...",
  loadingChat: "正在请求聊天接口...",
  requestFailed: "请求失败",
  response: "响应",
  placeholder: "输入接口地址和 API Key，即可获取模型或发送请求。",
  defaultMessage: "用三句话介绍 OpenAchieve 的接入方式。",
};

const copyEn: Record<string, string> = {
  title: "API Playground",
  label: "API testing",
  apiBaseURL: "Base URL",
  apiKey: "API Key",
  model: "Model",
  message: "Message",
  send: "Send request",
  loadModels: "Load models",
  waiting: "Waiting",
  loadingModels: "Loading model list...",
  loadingChatStream: "Reading streaming response...",
  loadingChat: "Requesting chat completion...",
  requestFailed: "Request failed",
  response: "Response",
  placeholder: "Enter a Base URL and API key to load models or send a request.",
  defaultMessage: "Explain how to integrate OpenAchieve in three sentences.",
};

function translate(language: Language, key: string) {
  const shortKey = key.split(".").at(-1) ?? key;
  const dictionary = language === "en" ? copyEn : copyZh;
  return dictionary[key] ?? dictionary[shortKey] ?? key;
}

export function PlaygroundClient() {
  const { language } = useI18n();
  const t = useCallback((key: string) => translate(language, key), [language]);
  const [backendUrl, setBackendUrl] = useState(defaultBackendUrl);
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("big-pickle");
  const [message, setMessage] = useState(() => t("playground.defaultMessage"));
  const [stream, setStream] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [status, setStatus] = useState(t("playground.waiting"));
  const [response, setResponse] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setApiKey(window.localStorage.getItem("openachieve_latest_customer_key") ?? "");
  }, []);

  useEffect(() => {
    setMessage((current) => {
      const defaults = [copyZh.defaultMessage, copyEn.defaultMessage];
      return defaults.includes(current) ? t("playground.defaultMessage") : current;
    });
  }, [language, t]);

  const normalizedBackendUrl = useMemo(
    () => backendUrl.replace(/\/+$/, ""),
    [backendUrl],
  );

  async function loadModels() {
    setLoading(true);
    setStatus(t("playground.loadingModels"));
    setResponse("");

    try {
      const res = await fetch(`${normalizedBackendUrl}/v1/models`, {
        headers: authHeaders(apiKey),
      });
      const text = await res.text();
      setStatus(`${res.status} ${res.statusText}`);
      setResponse(prettyJson(text));

      if (res.ok) {
        const json = JSON.parse(text) as ModelListResponse;
        setModels(
          (json.data ?? [])
            .map((item) => item.id)
            .filter((id): id is string => Boolean(id)),
        );
      }
} catch (error) {
      setStatus(t("playground.requestFailed"));
      setResponse(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }

  async function submitChat(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setStatus(stream ? t("playground.loadingChatStream") : t("playground.loadingChat"));
    setResponse("");

    try {
      const res = await fetch(`${normalizedBackendUrl}/v1/chat/completions`, {
        method: "POST",
        headers: {
          ...authHeaders(apiKey),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          stream,
          messages: [{ role: "user", content: message }],
        }),
      });

      setStatus(`${res.status} ${res.statusText}`);

      if (stream) {
        const reader = res.body?.getReader();
        if (!reader) throw new Error("No response body");
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          setResponse(prettySse(buffer));
        }
      } else {
        const text = await res.text();
        setStatus(`${res.status} ${res.statusText}`);
        setResponse(prettyJson(text));
      }
    } catch (error) {
      setStatus(t("playground.requestFailed"));
      setResponse(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="playground-page">
      <section className="playground-shell">
        <SiteHeader active="playground" variant="workspace" />

        <section className="playground-head">
          <div>
            <p>{t("playground.label")}</p>
            <h1>{t("playground.title")}</h1>
          </div>
        </section>

        <div className="playground-grid">
          <form className="panel" onSubmit={submitChat}>
            <label>
{t("playground.apiBaseURL")}
              <input
                value={backendUrl}
                onChange={(event) => setBackendUrl(event.target.value)}
                placeholder="https://openachieve.asia"
              />
            </label>

            <label>
              {t("playground.apiKey")}
              <input
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder="ak_xxxxxxxxxxxxxxxx"
                type="password"
              />
            </label>

            <div className="row">
              <label>
{t("playground.model")}
                <input
                  list="models"
                  value={model}
                  onChange={(event) => setModel(event.target.value)}
                />
                <datalist id="models">
                  {models.map((item) => (
                    <option value={item} key={item} />
                  ))}
                </datalist>
              </label>

              <label className="switch">
                <input
                  checked={stream}
                  onChange={(event) => setStream(event.target.checked)}
                  type="checkbox"
                />
                stream
              </label>
            </div>

            <label>
              {t("playground.message")}
              <textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                rows={6}
              />
            </label>

            <div className="actions">
              <Button variant="secondary" type="button" onClick={loadModels} disabled={loading || !apiKey}>
{t("playground.loadModels")}
              </Button>
              <Button type="submit" disabled={loading || !apiKey || !model || !message}>
{t("playground.send")}
              </Button>
            </div>
          </form>

          <section className="panel response-panel">
            <div className="response-head">
              <span>{t("playground.response")}</span>
              <code>{status}</code>
            </div>
            <pre>{response || t("playground.placeholder")}</pre>
          </section>
        </div>
      </section>
      <SiteFooter />
      <style jsx>{`
        .playground-page {
          min-height: 100vh;
          padding: 0 36px 40px;
          color: #141413;
          background:
            radial-gradient(circle at 20% 12%, rgba(190, 83, 49, 0.14), transparent 26rem),
            #f5f4ed;
          font-family: -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Noto Sans SC",
            "Microsoft YaHei", system-ui, sans-serif;
        }

        .playground-shell {
          width: min(1180px, 100%);
          margin: 0 auto;
        }
        .playground-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 24px;
        }
        .playground-head p {
          margin: 0 0 8px;
          color: #be5331;
          font-size: 12px;
          font-weight: 800;
          text-transform: uppercase;
        }

        h1 {
          margin: 0;
          font-family: "Iowan Old Style", "Yu Mincho", Georgia, serif;
          font-size: clamp(42px, 5vw, 72px);
          font-weight: 500;
          line-height: 1;
        }

        .playground-grid {
          display: grid;
          grid-template-columns: 420px minmax(0, 1fr);
          gap: 18px;
          min-width: 0;
        }

        .panel {
          border: 1px solid #e0ded4;
          border-radius: 18px;
          padding: 22px;
          background: rgba(250, 249, 245, 0.94);
          box-shadow: 0 18px 54px rgba(20, 20, 19, 0.08);
        }

        label {
          display: grid;
          gap: 7px;
          margin-bottom: 15px;
          color: #4f4d47;
          font-size: 13px;
          font-weight: 750;
        }

        input,
        textarea {
          width: 100%;
          border: 1px solid #d7d4c8;
          border-radius: 12px;
          padding: 12px;
          color: #141413;
          background: #fff;
          font: inherit;
        }

        textarea {
          resize: vertical;
        }

        .row {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 12px;
          align-items: end;
        }

        .switch {
          min-height: 45px;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 15px;
          white-space: nowrap;
        }

        .switch input {
          width: auto;
        }

        .actions {
          display: flex;
          gap: 10px;
        }

        .response-panel {
          min-height: 560px;
          display: grid;
          grid-template-rows: auto 1fr;
          background: #141413;
          color: #faf9f5;
          overflow: hidden;
        }

        .response-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          padding-bottom: 14px;
          border-bottom: 1px solid #30302e;
          font-weight: 850;
        }

        code,
        pre {
          font-family: "SFMono-Regular", Menlo, ui-monospace, monospace;
        }

        code {
          color: #b0aea5;
          font-size: 12px;
        }

        pre {
          margin: 0;
          padding-top: 16px;
          overflow: auto;
          white-space: pre-wrap;
          overflow-wrap: anywhere;
          word-break: break-word;
          color: #e8e6dc;
          font-size: 13px;
          line-height: 1.6;
        }

        @media (max-width: 920px) {
          .playground-page {
            padding: 0 14px 28px;
            overflow-x: hidden;
          }

          .playground-head,
          .playground-grid {
            grid-template-columns: 1fr;
            display: grid;
            min-width: 0;
          }

          .playground-head {
            justify-content: start;
          }

          .playground-grid {
            grid-template-columns: 1fr;
          }

          h1 {
            font-size: clamp(34px, 12vw, 50px);
          }

          .response-panel {
            min-height: 420px;
          }

          .panel {
            min-width: 0;
          }
        }

        @media (max-width: 560px) {
          .playground-page {
            padding: 0 14px 24px;
          }

          .panel {
            border-radius: 12px;
            padding: 16px;
            min-width: 0;
          }

          .row,
          .actions,
          .response-head {
            display: grid;
            grid-template-columns: 1fr;
          }

          .actions :global(button) {
            width: 100%;
          }

          .response-head {
            align-items: start;
          }

          pre {
            max-width: 100%;
            overflow-x: auto;
            white-space: pre-wrap;
            overflow-wrap: anywhere;
            word-break: break-word;
            font-size: 12px;
          }
        }
      `}</style>
    </main>
  );
}

function authHeaders(apiKey: string) {
  return {
    Authorization: `Bearer ${apiKey}`,
  };
}

function prettySse(text: string) {
  return text.replace(/\n\n/g, "\n").trim();
}

function prettyJson(text: string) {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}
