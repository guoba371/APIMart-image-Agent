import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const publicDir = join(__dirname, "public");

loadEnv(join(__dirname, ".env"));

const config = {
  apiKey: process.env.APIMART_API_KEY,
  apiUrl: (process.env.APIMART_API_URL || "https://api.apimart.ai").replace(/\/+$/, ""),
  model: process.env.APIMART_MODEL || "gpt-image-2",
  videoModel: process.env.APIMART_VIDEO_MODEL || "doubao-seedance-2.0",
  port: Number(process.env.PORT || 8787),
};

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

export default async function handler(req, res) {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);

    if (req.method === "GET" && url.pathname === "/api/config") {
      return sendJson(res, 200, {
        apiUrl: config.apiUrl,
        model: config.model,
        videoModel: config.videoModel,
        hasApiKey: Boolean(config.apiKey),
      });
    }

    if (req.method === "GET" && url.pathname === "/api/account/token-balance") {
      return handleBalance(req, res, "/v1/balance");
    }

    if (req.method === "GET" && url.pathname === "/api/account/user-balance") {
      return handleBalance(req, res, "/v1/user/balance");
    }

    if (req.method === "GET" && url.pathname === "/api/account/project-balance") {
      return handleProjectBalance(res);
    }

    if (req.method === "POST" && url.pathname === "/api/generate") {
      const body = await readJson(req);
      return handleGenerate(req, res, body);
    }

    if (req.method === "POST" && url.pathname === "/api/videos/generate") {
      const body = await readJson(req);
      return handleVideoGenerate(req, res, body);
    }

    if (req.method === "POST" && url.pathname === "/api/uploads/images") {
      return handleImageUpload(req, res);
    }

    if (req.method === "GET" && url.pathname.startsWith("/api/tasks/")) {
      const taskId = decodeURIComponent(url.pathname.replace("/api/tasks/", ""));
      return handleTaskStatus(req, res, taskId);
    }

    if (req.method === "GET") {
      return serveStatic(res, url.pathname);
    }

    return sendJson(res, 405, { error: "Method not allowed" });
  } catch (error) {
    return sendJson(res, error.statusCode || 500, {
      error: error.userMessage || error.message || "Server error",
      code: error.code || null,
      type: error.type || null,
      requestId: error.requestId || null,
      traceId: error.traceId || null,
      safetyViolations: error.safetyViolations || [],
      raw: error.raw || null,
    });
  }
}

if (process.env.VERCEL !== "1") {
  createServer(handler).listen(config.port, () => {
    console.log(`APIMart image agent is running at http://localhost:${config.port}`);
  });
}

async function handleGenerate(req, res, body) {
  const apiKey = getRequestApiKey(req);
  if (!apiKey) {
    return sendJson(res, 400, { error: "Please enter an APIMart API Key before submitting." });
  }

  const prompt = String(body.prompt || "").trim();
  if (!prompt) {
    return sendJson(res, 400, { error: "Prompt is required" });
  }

  const payload = {
    model: config.model,
    prompt,
    n: clampInt(body.n, 1, 4, 1),
    size: body.size || "16:9",
    resolution: body.resolution || "2k",
  };

  const referenceImages = normalizeStringArray(body.referenceImages || body.imageUrls);
  if (referenceImages.length) {
    payload.image_urls = referenceImages.slice(0, 16);
  }

  const maskUrl = String(body.maskUrl || "").trim();
  if (maskUrl) {
    payload.mask_url = maskUrl;
  }

  const data = await callApimart("/v1/images/generations", apiKey, {
    method: "POST",
    body: JSON.stringify(payload),
  });

  const taskId = data?.data?.[0]?.task_id;
  if (!taskId) {
    return sendJson(res, 502, {
      error: "APIMart did not return a task_id",
      upstream: data,
    });
  }

  return sendJson(res, 200, { taskId, submitted: data });
}

async function handleVideoGenerate(req, res, body) {
  const apiKey = getRequestApiKey(req);
  if (!apiKey) {
    return sendJson(res, 400, { error: "Please enter an APIMart API Key before submitting." });
  }

  const prompt = String(body.prompt || "").trim();
  const firstFrameUrl = String(body.firstFrameUrl || "").trim();
  const lastFrameUrl = String(body.lastFrameUrl || "").trim();
  const imageUrls = normalizeStringArray(body.imageUrls);
  const hasImageInput = imageUrls.length || firstFrameUrl || lastFrameUrl;

  if (!prompt && !hasImageInput) {
    return sendJson(res, 400, { error: "Prompt or at least one image URL is required" });
  }

  const payload = {
    model: String(body.model || config.videoModel),
    prompt,
    duration: clampInt(body.duration, 4, 15, 5),
    size: body.size || "16:9",
    resolution: body.resolution || "720p",
    generate_audio: toBoolean(body.generateAudio),
    return_last_frame: toBoolean(body.returnLastFrame),
  };

  const seed = Number.parseInt(body.seed, 10);
  if (!Number.isNaN(seed)) payload.seed = seed;

  if (firstFrameUrl || lastFrameUrl) {
    payload.image_with_roles = [];
    if (firstFrameUrl) payload.image_with_roles.push({ url: firstFrameUrl, role: "first_frame" });
    if (lastFrameUrl) payload.image_with_roles.push({ url: lastFrameUrl, role: "last_frame" });
  } else if (imageUrls.length) {
    payload.image_urls = imageUrls.slice(0, 9);
  }

  const data = await callApimart("/v1/videos/generations", apiKey, {
    method: "POST",
    body: JSON.stringify(payload),
  });

  const taskId = data?.data?.[0]?.task_id;
  if (!taskId) {
    return sendJson(res, 502, {
      error: "APIMart did not return a task_id",
      upstream: data,
    });
  }

  return sendJson(res, 200, { taskId, submitted: data });
}

async function handleImageUpload(req, res) {
  const apiKey = getRequestApiKey(req);
  if (!apiKey) {
    return sendJson(res, 400, { error: "Please enter an APIMart API Key before uploading." });
  }

  const contentType = req.headers["content-type"] || "";
  if (!contentType.toLowerCase().includes("multipart/form-data")) {
    return sendJson(res, 400, { error: "Image upload must use multipart/form-data" });
  }

  const response = await fetch(`${config.apiUrl}/v1/uploads/images`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": contentType,
    },
    body: req,
    duplex: "half",
  });

  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`APIMart upload returned non-JSON response (${response.status}): ${text.slice(0, 300)}`);
  }

  if (!response.ok || (data.code && Number(data.code) >= 400)) {
    throw normalizeApimartError(response.status, data);
  }

  return sendJson(res, 200, data);
}

async function handleTaskStatus(req, res, taskId) {
  const apiKey = getRequestApiKey(req);
  if (!apiKey) {
    return sendJson(res, 400, { error: "Please enter an APIMart API Key before polling tasks." });
  }

  if (!taskId || taskId.includes("/") || taskId.includes("\\")) {
    return sendJson(res, 400, { error: "Valid task id is required" });
  }

  const data = await callApimart(`/v1/tasks/${encodeURIComponent(taskId)}`, apiKey);
  const task = data?.data || {};
  const images = extractImages(task);
  const videos = extractVideos(task);
  const lastFrames = extractLastFrames(task);

  return sendJson(res, 200, {
    taskId,
    status: task.status || "unknown",
    progress: task.progress ?? null,
    cost: task.cost ?? null,
    actualTime: task.actual_time ?? null,
    error: task.error || null,
    images,
    videos,
    lastFrames,
    thumbnailUrl: task?.result?.thumbnail_url || task?.thumbnail_url || null,
    raw: data,
  });
}

async function handleBalance(req, res, path) {
  const apiKey = getRequestApiKey(req);
  if (!apiKey) {
    return sendJson(res, 400, { error: "Please enter an APIMart API Key before checking balance." });
  }

  const data = await callApimart(path, apiKey);
  return sendJson(res, 200, {
    success: Boolean(data?.success),
    remainBalance: data?.remain_balance ?? null,
    usedBalance: data?.used_balance ?? null,
    unlimitedQuota: Boolean(data?.unlimited_quota),
    message: data?.message || null,
    raw: data,
  });
}

async function handleProjectBalance(res) {
  if (!config.apiKey) {
    return sendJson(res, 400, { error: "Project APIMART_API_KEY is not configured." });
  }

  const data = await callApimart("/v1/user/balance", config.apiKey);
  return sendJson(res, 200, {
    success: Boolean(data?.success),
    remainBalance: data?.remain_balance ?? null,
    usedBalance: data?.used_balance ?? null,
    unlimitedQuota: Boolean(data?.unlimited_quota),
    message: data?.message || null,
    raw: data,
  });
}

function getRequestApiKey(req) {
  const headerKey = req.headers["x-apimart-api-key"];
  const userKey = Array.isArray(headerKey) ? headerKey[0] : headerKey;
  return String(userKey || config.apiKey || "").trim();
}

async function callApimart(path, apiKey, options = {}) {
  const response = await fetch(`${config.apiUrl}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`APIMart returned non-JSON response (${response.status}): ${text.slice(0, 300)}`);
  }

  if (!response.ok || (data.code && Number(data.code) >= 400)) {
    throw normalizeApimartError(response.status, data);
  }

  return data;
}

function normalizeApimartError(status, data) {
  const upstream = data?.error || data || {};
  const message = upstream.message || data?.message || JSON.stringify(data).slice(0, 500);
  const safetyViolations = [...message.matchAll(/safety_violations=\[([^\]]+)\]/g)]
    .flatMap((match) => match[1].split(",").map((item) => item.trim()).filter(Boolean));
  const requestId = message.match(/request ID ([0-9a-f-]+)/i)?.[1] || null;
  const traceId = message.match(/traceid:\s*([a-z0-9]+)/i)?.[1] || null;
  const isSafetyRejection = message.toLowerCase().includes("safety system") || safetyViolations.length > 0;

  const error = new Error(`APIMart request failed (${status}): ${message}`);
  error.statusCode = isSafetyRejection ? 400 : status || 502;
  error.code = upstream.code || data?.code || null;
  error.type = upstream.type || null;
  error.requestId = requestId;
  error.traceId = traceId;
  error.safetyViolations = safetyViolations;
  error.raw = data;
  error.userMessage = isSafetyRejection
    ? buildSafetyMessage(safetyViolations, requestId, traceId)
    : `APIMart request failed (${status}): ${message}`;
  return error;
}

function buildSafetyMessage(violations, requestId, traceId) {
  const labels = violations.length ? violations.join(", ") : "unknown";
  const tips = [
    "提示词被 APIMart / 上游模型安全系统拦截。",
    `命中分类：${labels}`,
    "建议改写：去掉露骨、性暗示、未成年人、裸露、身体挑逗、敏感姿势等描述，改成服装、场景、光线、构图、画风、镜头语言。",
  ];

  if (requestId) tips.push(`Request ID：${requestId}`);
  if (traceId) tips.push(`Trace ID：${traceId}`);
  return tips.join("\n");
}

function extractImages(task) {
  const records = task?.result?.images || [];
  return records.flatMap((item) => {
    if (Array.isArray(item?.url)) return item.url;
    if (typeof item?.url === "string") return [item.url];
    return [];
  });
}

function extractVideos(task) {
  const records = task?.result?.videos || [];
  return records.flatMap((item) => {
    if (Array.isArray(item?.url)) return item.url;
    if (typeof item?.url === "string") return [item.url];
    if (Array.isArray(item?.video_url)) return item.video_url;
    if (typeof item?.video_url === "string") return [item.video_url];
    if (Array.isArray(item)) return item.filter((url) => typeof url === "string");
    if (typeof item === "string") return [item];
    return [];
  });
}

function extractLastFrames(task) {
  const result = task?.result || {};
  const candidates = [
    result.last_frame_url,
    result.last_frame_image_url,
    result.last_frame,
    ...(Array.isArray(result.last_frames) ? result.last_frames : []),
  ];
  return candidates.flatMap((item) => {
    if (Array.isArray(item?.url)) return item.url;
    if (typeof item?.url === "string") return [item.url];
    if (typeof item === "string") return [item];
    return [];
  });
}

async function serveStatic(res, pathname) {
  const requested = pathname === "/" ? "/index.html" : pathname;
  const safePath = normalize(decodeURIComponent(requested))
    .replace(/^[/\\]+/, "")
    .replace(/^(\.\.[/\\])+/, "");
  const filePath = join(publicDir, safePath);

  if (!filePath.startsWith(publicDir) || !existsSync(filePath)) {
    return sendJson(res, 404, { error: "Not found" });
  }

  const content = await readFile(filePath);
  res.writeHead(200, { "Content-Type": mimeTypes[extname(filePath)] || "application/octet-stream" });
  res.end(content);
}

function sendJson(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
}

function clampInt(value, min, max, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function normalizeStringArray(value) {
  if (!value) return [];
  const list = Array.isArray(value) ? value : [value];
  return list.map((item) => String(item || "").trim()).filter(Boolean);
}

function toBoolean(value) {
  return value === true || value === "true" || value === "on" || value === "1" || value === 1;
}

function loadEnv(path) {
  if (!existsSync(path)) return;
  const text = readFileSync(path, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}
