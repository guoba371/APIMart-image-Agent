import assert from "node:assert/strict";
import test from "node:test";

import { handleRequest } from "../app.mjs";

test("Nano banana Pro maps to official Gemini image model and uppercase resolution", async () => {
  await withFetch(async (_url, init) => {
    const payload = JSON.parse(init.body);
    assert.equal(payload.model, "gemini-3-pro-image-preview-official");
    assert.equal(payload.resolution, "2K");
    assert.equal(payload.n, 1);
    return json({ code: 200, data: [{ task_id: "nano-task" }] });
  }, async () => {
    const response = await generate({ model: "nano-banana-pro", prompt: "test", resolution: "2k", n: 4 });
    assert.equal(response.status, 200);
  });
});

test("Seedream rejects unsupported 4K before calling APIMart", async () => {
  await withFetch(() => { throw new Error("must not fetch"); }, async () => {
    const response = await generate({ model: "doubao-seedream-5-0-pro", prompt: "test", resolution: "4k" });
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /1K, 2K/);
  });
});

test("GPT Image 2 official sends the official model", async () => {
  await withFetch(async (_url, init) => {
    assert.equal(JSON.parse(init.body).model, "gpt-image-2-official");
    return json({ code: 200, data: [{ task_id: "official-task" }] });
  }, async () => assert.equal((await generate({ model: "gpt-image-2-official", prompt: "test" })).status, 200));
});

test("TTS proxies binary audio with validated parameters", async () => {
  await withFetch(async (url, init) => {
    assert.match(url, /\/v1\/audio\/speech$/);
    assert.deepEqual(JSON.parse(init.body), {
      model: "gpt-4o-mini-tts", input: "你好", voice: "nova", response_format: "opus", speed: 1.25,
    });
    return new Response(new Uint8Array([1, 2, 3]), { headers: { "Content-Type": "audio/opus" } });
  }, async () => {
    const request = new Request("http://local/api/audio/speech", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: "你好", voice: "nova", responseFormat: "opus", speed: 1.25 }),
    });
    const response = await handleRequest(request, env());
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "audio/opus");
    assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [1, 2, 3]);
  });
});

function generate(body) {
  return handleRequest(new Request("http://local/api/generate", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  }), env());
}

function env() {
  return { APIMART_API_KEY: "test-key", APIMART_API_URL: "https://api.example.test" };
}

function json(body) {
  return new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
}

async function withFetch(mock, run) {
  const original = globalThis.fetch;
  globalThis.fetch = mock;
  try { await run(); } finally { globalThis.fetch = original; }
}
