"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { SiteFooter } from "../components/SiteFooter";
import { SiteHeader } from "../components/SiteHeader";

const defaultBackendUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/+$/, "") ?? "/api/backend";

type ModelListResponse = {
  data?: Array<{ id?: string }>;
};

export function PlaygroundClient() {
  const [backendUrl, setBackendUrl] = useState(defaultBackendUrl);
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("big-pickle");
  const [message, setMessage] = useState("用三句话介绍 AIJinAPI 的接入方式。");
  const [stream, setStream] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [status, setStatus] = useState("等待请求");
  const [response, setResponse] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setApiKey(window.localStorage.getItem("aijinapi_latest_customer_key") ?? "");
  }, []);

  const normalizedBackendUrl = useMemo(
    () => backendUrl.replace(/\/+$/, ""),
    [backendUrl],
  );

  async function loadModels() {
    setLoading(true);
    setStatus("正在读取模型列表...");
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
      setStatus("请求失败");
      setResponse(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }

  async function submitChat(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setStatus(stream ? "正在读取流式响应..." : "正在请求聊天接口...");
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

      if (stream && res.body) {
        await readStream(res);
      } else {
        const text = await res.text();
        setResponse(prettyJson(text));
      }
    } catch (error) {
      setStatus("请求失败");
      setResponse(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }

  async function readStream(res: Response) {
    const reader = res.body?.getReader();
    if (!reader) return;

    const decoder = new TextDecoder();
    let output = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      output += decoder.decode(value, { stream: true });
      setResponse(output);
    }
  }

  return (
    <main className="playground-page">
      <section className="playground-shell">
        <SiteHeader active="playground" variant="workspace" />

        <section className="playground-head">
          <div>
            <p>Backend Integration</p>
            <h1>API 中转调试台</h1>
          </div>
        </section>

        <div className="playground-grid">
          <form className="panel" onSubmit={submitChat}>
            <label>
              后端地址
              <input
                value={backendUrl}
                onChange={(event) => setBackendUrl(event.target.value)}
                placeholder="/api/backend"
              />
            </label>

            <label>
              客户 API Key
              <input
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder="aijin_xxx"
                type="password"
              />
            </label>

            <div className="row">
              <label>
                模型
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
              测试消息
              <textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                rows={6}
              />
            </label>

            <div className="actions">
              <Button variant="secondary" type="button" onClick={loadModels} disabled={loading || !apiKey}>
                读取模型
              </Button>
              <Button type="submit" disabled={loading || !apiKey || !model || !message}>
                发送请求
              </Button>
            </div>
          </form>

          <section className="panel response-panel">
            <div className="response-head">
              <span>响应</span>
              <code>{status}</code>
            </div>
            <pre>{response || "配置后端地址和客户 key，然后读取模型或发送请求。"}</pre>
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
          color: #e8e6dc;
          font-size: 13px;
          line-height: 1.6;
        }

        @media (max-width: 920px) {
          .playground-page {
            padding: 0 22px 28px;
          }

          .playground-head,
          .playground-grid {
            grid-template-columns: 1fr;
            display: grid;
          }

          .playground-head {
            justify-content: start;
          }

          .playground-grid {
            grid-template-columns: 1fr;
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

function prettyJson(text: string) {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}
