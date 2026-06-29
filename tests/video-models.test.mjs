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
    assert.equal(payload.model, "wan2.5-preview");
    assert.equal(Object.hasOwn(payload, "generate_audio"), false);
    assert.equal(Object.hasOwn(payload, "return_last_frame"), false);
    assert.equal(Object.hasOwn(payload, "size"), false);
  } finally {
    await api.close();
  }
});

test("wan2.5 image mode rejects more than one reference image before calling APIMart", async () => {
  const api = await startFakeApimart();
  try {
    const response = await callVideoGenerate(api.url, {
      model: "wan2.5",
      videoType: "image",
      prompt: "test prompt",
      duration: 5,
      imageUrls: ["https://example.com/a.jpg", "https://example.com/b.jpg"],
    });

    assert.equal(response.status, 400);
    assert.match(response.body.error, /只支持 1 张参考图/);
    assert.equal(api.requests.length, 0);
  } finally {
    await api.close();
  }
});

test("wan2.5 maps to preview model and keeps allowed 10 second duration", async () => {
  const api = await startFakeApimart();
  try {
    const response = await callVideoGenerate(api.url, {
      model: "wan2.5",
      videoType: "image",
      prompt: "test prompt",
      duration: 10,
      imageUrls: ["https://example.com/reference.jpg"],
    });

    assert.equal(response.status, 200);
    assert.equal(api.requests.length, 1);
    const payload = JSON.parse(api.requests[0].body);
    assert.equal(payload.model, "wan2.5-preview");
    assert.equal(payload.duration, 10);
    assert.deepEqual(payload.image_urls, ["https://example.com/reference.jpg"]);
  } finally {
    await api.close();
  }
});

test("wan2.5 rejects unsupported 8 second duration before calling APIMart", async () => {
  const api = await startFakeApimart();
  try {
    const response = await callVideoGenerate(api.url, {
      model: "wan2.5",
      videoType: "text",
      prompt: "test prompt",
      duration: 8,
    });

    assert.equal(response.status, 400);
    assert.match(response.body.error, /只支持 5 秒或 10 秒/);
    assert.equal(api.requests.length, 0);
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

test("Grok Imagine 1.5 maps UI resolution to quality and keeps supported image references", async () => {
  const api = await startFakeApimart();
  try {
    const response = await callVideoGenerate(api.url, {
      model: "grok-imagine-1.5",
      prompt: "test prompt",
      size: "3:2",
      resolution: "720p",
      duration: 6,
      imageUrls: ["https://example.com/a.jpg", "https://example.com/b.jpg"],
    });

    assert.equal(response.status, 200);
    assert.equal(api.requests.length, 1);
    const payload = JSON.parse(api.requests[0].body);
    assert.equal(payload.model, "grok-imagine-1.5-video-apimart");
    assert.equal(payload.duration, 6);
    assert.equal(payload.size, "3:2");
    assert.equal(payload.quality, "720p");
    assert.equal(Object.hasOwn(payload, "resolution"), false);
    assert.deepEqual(payload.image_urls, ["https://example.com/a.jpg", "https://example.com/b.jpg"]);
  } finally {
    await api.close();
  }
});

test("Grok Imagine 1.5 rejects unsupported duration before calling APIMart", async () => {
  const api = await startFakeApimart();
  try {
    const response = await callVideoGenerate(api.url, {
      model: "grok-imagine-1.5",
      prompt: "test prompt",
      duration: 5,
    });

    assert.equal(response.status, 400);
    assert.match(response.body.error, /6-30 秒/);
    assert.equal(api.requests.length, 0);
  } finally {
    await api.close();
  }
});

test("Grok Imagine 1.5 rejects unsupported quality before calling APIMart", async () => {
  const api = await startFakeApimart();
  try {
    const response = await callVideoGenerate(api.url, {
      model: "grok-imagine-1.5",
      prompt: "test prompt",
      duration: 6,
      resolution: "1080p",
    });

    assert.equal(response.status, 400);
    assert.match(response.body.error, /480p 或 720p/);
    assert.equal(api.requests.length, 0);
  } finally {
    await api.close();
  }
});

test("Omni-Flash-Ext maps size to aspect_ratio and marks 3 images as reference generation", async () => {
  const api = await startFakeApimart();
  try {
    const response = await callVideoGenerate(api.url, {
      model: "Omni-Flash-Ext",
      prompt: "test prompt",
      size: "9:16",
      resolution: "4k",
      duration: 10,
      imageUrls: [
        "https://example.com/scene.jpg",
        "https://example.com/character.jpg",
        "https://example.com/product.jpg",
      ],
    });

    assert.equal(response.status, 200);
    assert.equal(api.requests.length, 1);
    const payload = JSON.parse(api.requests[0].body);
    assert.equal(payload.model, "Omni-Flash-Ext");
    assert.equal(payload.duration, 10);
    assert.equal(payload.resolution, "4k");
    assert.equal(payload.aspect_ratio, "9:16");
    assert.equal(payload.generation_type, "reference");
    assert.equal(Object.hasOwn(payload, "size"), false);
    assert.deepEqual(payload.image_urls, [
      "https://example.com/scene.jpg",
      "https://example.com/character.jpg",
      "https://example.com/product.jpg",
    ]);
  } finally {
    await api.close();
  }
});

test("Omni-Flash-Ext reference video payload omits duration", async () => {
  const api = await startFakeApimart();
  try {
    const response = await callVideoGenerate(api.url, {
      model: "Omni-Flash-Ext",
      prompt: "test prompt",
      size: "16:9",
      resolution: "720p",
      duration: 6,
      videoUrls: ["https://example.com/reference.mp4"],
    });

    assert.equal(response.status, 200);
    assert.equal(api.requests.length, 1);
    const payload = JSON.parse(api.requests[0].body);
    assert.equal(payload.model, "Omni-Flash-Ext");
    assert.equal(Object.hasOwn(payload, "duration"), false);
    assert.equal(payload.aspect_ratio, "16:9");
    assert.deepEqual(payload.video_urls, ["https://example.com/reference.mp4"]);
  } finally {
    await api.close();
  }
});

test("Omni-Flash-Ext rejects unsupported two image references before calling APIMart", async () => {
  const api = await startFakeApimart();
  try {
    const response = await callVideoGenerate(api.url, {
      model: "Omni-Flash-Ext",
      prompt: "test prompt",
      duration: 6,
      imageUrls: ["https://example.com/a.jpg", "https://example.com/b.jpg"],
    });

    assert.equal(response.status, 400);
    assert.match(response.body.error, /0、1 或 3 张参考图/);
    assert.equal(api.requests.length, 0);
  } finally {
    await api.close();
  }
});

test("Omni-Flash-Ext rejects more than one reference video before calling APIMart", async () => {
  const api = await startFakeApimart();
  try {
    const response = await callVideoGenerate(api.url, {
      model: "Omni-Flash-Ext",
      prompt: "test prompt",
      videoUrls: ["https://example.com/a.mp4", "https://example.com/b.mp4"],
    });

    assert.equal(response.status, 400);
    assert.match(response.body.error, /最多支持 1 个参考视频/);
    assert.equal(api.requests.length, 0);
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
