import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";

import { handleRequest } from "../app.mjs";

test("explicit unsupported video model is rejected before calling APIMart", async () => {
  const api = await startFakeApimart();
  try {
    const response = await callVideoGenerate(api.url, {
      model: "bad-model",
      prompt: "test prompt",
      duration: 5,
    });

    assert.equal(response.status, 400);
    assert.match(response.body.error, /Unsupported video model/);
    assert.equal(api.requests.length, 0);
  } finally {
    await api.close();
  }
});

test("wan2.5 rejects Seedance-only reference audio parameters", async () => {
  const api = await startFakeApimart();
  try {
    const response = await callVideoGenerate(api.url, {
      model: "wan2.5",
      prompt: "test prompt",
      duration: 5,
      imageUrls: ["https://example.com/reference.jpg"],
      audioUrls: ["https://example.com/reference.mp3"],
    });

    assert.equal(response.status, 400);
    assert.match(response.body.error, /Wan 2\.5.*reference audio/i);
    assert.equal(api.requests.length, 0);
  } finally {
    await api.close();
  }
});

test("wan2.5 payload omits unsupported audio and last-frame flags", async () => {
  const api = await startFakeApimart();
  try {
    const response = await callVideoGenerate(api.url, {
      model: "wan2.5",
      prompt: "test prompt",
      duration: 5,
      generateAudio: false,
      returnLastFrame: false,
    });

    assert.equal(response.status, 200);
    assert.equal(api.requests.length, 1);
    const payload = JSON.parse(api.requests[0].body);
    assert.equal(payload.model, "wan2.5");
    assert.equal(Object.hasOwn(payload, "generate_audio"), false);
    assert.equal(Object.hasOwn(payload, "return_last_frame"), false);
  } finally {
    await api.close();
  }
});

test("Seedance 2.0 still submits supported reference audio parameters", async () => {
  const api = await startFakeApimart();
  try {
    const response = await callVideoGenerate(api.url, {
      model: "doubao-seedance-2.0",
      prompt: "test prompt",
      duration: 5,
      imageUrls: ["https://example.com/reference.jpg"],
      audioUrls: ["https://example.com/reference.mp3"],
      generateAudio: true,
      returnLastFrame: true,
    });

    assert.equal(response.status, 200);
    assert.equal(api.requests.length, 1);
    const payload = JSON.parse(api.requests[0].body);
    assert.deepEqual(payload.image_urls, ["https://example.com/reference.jpg"]);
    assert.deepEqual(payload.audio_urls, ["https://example.com/reference.mp3"]);
    assert.equal(payload.generate_audio, true);
    assert.equal(payload.return_last_frame, true);
  } finally {
    await api.close();
  }
});

async function callVideoGenerate(apiUrl, body) {
  const request = new Request("http://local/api/videos/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const response = await handleRequest(request, {
    APIMART_API_KEY: "test-key",
    APIMART_API_URL: apiUrl,
  });
  return {
    status: response.status,
    body: await response.json(),
  };
}

async function startFakeApimart() {
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
      res.end(JSON.stringify({ data: [{ task_id: "task_mock" }] }));
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
