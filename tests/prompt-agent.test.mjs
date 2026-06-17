import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";

import { handleRequest } from "../app.mjs";

test("DeepSeek prompt generation requires a server-side API key", async () => {
  const response = await callPromptGenerate({}, { product: "GEO", audience: "business owners" });

  assert.equal(response.status, 400);
  assert.match(response.body.error, /DeepSeek API key/i);
});

test("DeepSeek prompt generation returns structured prompt output", async () => {
  const deepseek = await startFakeDeepSeek({
    fullPrompt: "完整分镜版 from deepseek",
    compactPrompt: "压缩投喂版 from deepseek",
    paramAdvice: "duration: 8\nsize: 9:16",
  });

  try {
    const response = await callPromptGenerate(
      {
        DEEPSEEK_API_KEY: "test-deepseek-key",
        DEEPSEEK_API_URL: deepseek.url,
      },
      {
        product: "GEO AI搜索优化代理",
        audience: "企业老板",
        duration: 8,
        size: "9:16",
      },
    );

    assert.equal(response.status, 200);
    assert.equal(response.body.fullPrompt, "完整分镜版 from deepseek");
    assert.equal(response.body.compactPrompt, "压缩投喂版 from deepseek");
    assert.equal(response.body.paramAdvice, "duration: 8\nsize: 9:16");
    assert.equal(deepseek.requests.length, 1);
    assert.equal(deepseek.requests[0].headers.authorization, "Bearer test-deepseek-key");
    assert.match(deepseek.requests[0].body, /GEO AI搜索优化代理/);
  } finally {
    await deepseek.close();
  }
});

test("DeepSeek prompt generation surfaces authentication errors as JSON", async () => {
  const deepseek = await startFakeDeepSeekError(401, {
    error: {
      message: "Authentication Fails",
      type: "authentication_error",
      code: "invalid_request_error",
    },
  });

  try {
    const response = await callPromptGenerate(
      {
        DEEPSEEK_API_KEY: "bad-key",
        DEEPSEEK_API_URL: deepseek.url,
      },
      { product: "GEO", audience: "企业老板" },
    );

    assert.equal(response.status, 401);
    assert.equal(response.body.error, "Authentication Fails");
    assert.deepEqual(response.body.raw.error.type, "authentication_error");
  } finally {
    await deepseek.close();
  }
});

async function callPromptGenerate(env, body) {
  const request = new Request("http://local/api/prompts/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const response = await handleRequest(request, env);
  return {
    status: response.status,
    body: await response.json(),
  };
}

async function startFakeDeepSeek(result) {
  const requests = [];
  const server = createServer((req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      requests.push({
        method: req.method,
        url: req.url,
        headers: req.headers,
        body: Buffer.concat(chunks).toString("utf8"),
      });
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify(result),
            },
          },
        ],
      }));
    });
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  return {
    requests,
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
  };
}

async function startFakeDeepSeekError(status, result) {
  const requests = [];
  const server = createServer((req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      requests.push({
        method: req.method,
        url: req.url,
        headers: req.headers,
        body: Buffer.concat(chunks).toString("utf8"),
      });
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(result));
    });
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  return {
    requests,
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
  };
}
