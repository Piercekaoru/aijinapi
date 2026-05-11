const http = require("http");

const server = http.createServer((req, res) => {
  const auth = req.headers.authorization || "";
  if (auth !== "Bearer local-upstream-key") {
    res.writeHead(401, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: { message: "bad upstream key" } }));
    return;
  }

  if (req.method === "GET" && req.url === "/models") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        object: "list",
        data: [
          { id: "qwen3.6-plus", object: "model", owned_by: "mock-opencode" },
          { id: "kimi-k2.6", object: "model", owned_by: "mock-opencode" },
        ],
      }),
    );
    return;
  }

  if (req.method === "POST" && req.url === "/chat/completions") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      const payload = body ? JSON.parse(body) : {};
      if (payload.stream) {
        res.writeHead(200, {
          "content-type": "text/event-stream",
          "cache-control": "no-cache",
        });
        res.write(
          'data: {"id":"mock-stream","object":"chat.completion.chunk","choices":[{"delta":{"content":"AIJinAPI "},"index":0}]}\n\n',
        );
        res.write(
          'data: {"id":"mock-stream","object":"chat.completion.chunk","choices":[{"delta":{"content":"联调成功"},"index":0}]}\n\n',
        );
        res.end("data: [DONE]\n\n");
        return;
      }

      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          id: "mock-chat",
          object: "chat.completion",
          model: payload.model || "qwen3.6-plus",
          choices: [
            {
              index: 0,
              message: {
                role: "assistant",
                content: "AIJinAPI 后端联调成功。",
              },
              finish_reason: "stop",
            },
          ],
        }),
      );
    });
    return;
  }

  res.writeHead(404, { "content-type": "application/json" });
  res.end(JSON.stringify({ error: { message: "not found" } }));
});

server.listen(18080, "127.0.0.1", () => {
  console.log("mock upstream listening on http://127.0.0.1:18080");
});
