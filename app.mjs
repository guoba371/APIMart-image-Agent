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

export function createConfig(env = {}) {
  return {
    apiKey: String(env.APIMART_API_KEY || "").trim(),
    apiUrl: String(env.APIMART_API_URL || "https://api.apimart.ai").replace(/\/+$/, ""),
    model: String(env.APIMART_MODEL || "gpt-image-2").trim(),
    videoModel: String(env.APIMART_VIDEO_MODEL || "doubao-seedance-2.0").trim(),
    port: Number(env.PORT || 8787),
  };
}

export async function handleRequest(request, env = {}, options = {}) {
  const config = createConfig(env);
  const url = new URL(request.url);

  try {
    if (request.method === "GET" && url.pathname === "/api/config") {
      return jsonResponse(200, {
        apiUrl: config.apiUrl,
        model: config.model,
        videoModel: config.videoModel,
        hasApiKey: Boolean(config.apiKey),
      });
    }

    if (request.method === "GET" && url.pathname === "/api/account/token-balance") {
      return handleBalance(request, config, "/v1/balance");
    }

    if (request.method === "GET" && url.pathname === "/api/account/user-balance") {
      return handleBalance(request, config, "/v1/user/balance");
    }

    if (request.method === "GET" && url.pathname === "/api/account/project-balance") {
      return handleProjectBalance(config);
    }

    if (request.method === "POST" && url.pathname === "/api/generate") {
      const body = await readJsonRequest(request);
      return handleGenerate(request, config, body);
    }

    if (request.method === "POST" && url.pathname === "/api/videos/generate") {
      const body = await readJsonRequest(request);
      return handleVideoGenerate(request, config, body);
    }

    if (request.method === "POST" && url.pathname === "/api/uploads/images") {
      return handleImageUpload(request, config);
    }

    if (request.method === "GET" && url.pathname.startsWith("/api/tasks/")) {
      const taskId = decodeURIComponent(url.pathname.replace("/api/tasks/", ""));
      return handleTaskStatus(request, config, taskId);
    }

    if (request.method === "GET" && options.serveStatic) {
      return options.serveStatic(request);
    }

    return jsonResponse(405, { error: "Method not allowed" });
  } catch (error) {
    return jsonResponse(error.statusCode || 500, {
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

export async function createNodeRequest(req) {
  const origin = `http://${req.headers.host || "localhost"}`;
  const init = {
    method: req.method,
    headers: req.headers,
  };

  if (req.method && !["GET", "HEAD"].includes(req.method.toUpperCase())) {
    init.body = req;
    init.duplex = "half";
  }

  return new Request(new URL(req.url || "/", origin), init);
}

export async function sendNodeResponse(nodeRes, response) {
  const headers = {};
  response.headers.forEach((value, key) => {
    headers[key] = value;
  });

  nodeRes.writeHead(response.status, headers);

  if (!response.body) {
    nodeRes.end();
    return;
  }

  const arrayBuffer = await response.arrayBuffer();
  nodeRes.end(Buffer.from(arrayBuffer));
}

export function loadEnvFile(readTextFile, path, targetEnv) {
  const text = readTextFile(path);
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, "");
    if (!targetEnv[key]) targetEnv[key] = value;
  }
}

export function getMimeType(pathname) {
  const lastDot = pathname.lastIndexOf(".");
  if (lastDot === -1) return "application/octet-stream";
  return mimeTypes[pathname.slice(lastDot).toLowerCase()] || "application/octet-stream";
}

async function handleGenerate(request, config, body) {
  const apiKey = getRequestApiKey(request, config);
  if (!apiKey) {
    return jsonResponse(400, { error: "Please enter an APIMart API Key before submitting." });
  }

  const prompt = String(body.prompt || "").trim();
  if (!prompt) {
    return jsonResponse(400, { error: "Prompt is required" });
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

  const data = await callApimart("/v1/images/generations", apiKey, config, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const taskId = data?.data?.[0]?.task_id;
  if (!taskId) {
    return jsonResponse(502, {
      error: "APIMart did not return a task_id",
      upstream: data,
    });
  }

  return jsonResponse(200, { taskId, submitted: data });
}

async function handleVideoGenerate(request, config, body) {
  const apiKey = getRequestApiKey(request, config);
  if (!apiKey) {
    return jsonResponse(400, { error: "Please enter an APIMart API Key before submitting." });
  }

  const prompt = String(body.prompt || "").trim();
  const firstFrameUrl = String(body.firstFrameUrl || "").trim();
  const lastFrameUrl = String(body.lastFrameUrl || "").trim();
  const imageUrls = normalizeStringArray(body.imageUrls);
  const hasImageInput = imageUrls.length || firstFrameUrl || lastFrameUrl;

  if (!prompt && !hasImageInput) {
    return jsonResponse(400, { error: "Prompt or at least one image URL is required" });
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

  const data = await callApimart("/v1/videos/generations", apiKey, config, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const taskId = data?.data?.[0]?.task_id;
  if (!taskId) {
    return jsonResponse(502, {
      error: "APIMart did not return a task_id",
      upstream: data,
    });
  }

  return jsonResponse(200, { taskId, submitted: data });
}

async function handleImageUpload(request, config) {
  const apiKey = getRequestApiKey(request, config);
  if (!apiKey) {
    return jsonResponse(400, { error: "Please enter an APIMart API Key before uploading." });
  }

  const contentType = request.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("multipart/form-data")) {
    return jsonResponse(400, { error: "Image upload must use multipart/form-data" });
  }

  const body = await request.arrayBuffer();
  const response = await fetch(`${config.apiUrl}/v1/uploads/images`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": contentType,
    },
    body,
  });

  const text = await response.text();
  const data = parseJsonOrThrow(text, `APIMart upload returned non-JSON response (${response.status})`);

  if (!response.ok || (data.code && Number(data.code) >= 400)) {
    throw normalizeApimartError(response.status, data);
  }

  return jsonResponse(200, data);
}

async function handleTaskStatus(request, config, taskId) {
  const apiKey = getRequestApiKey(request, config);
  if (!apiKey) {
    return jsonResponse(400, { error: "Please enter an APIMart API Key before polling tasks." });
  }

  if (!taskId || taskId.includes("/") || taskId.includes("\\")) {
    return jsonResponse(400, { error: "Valid task id is required" });
  }

  const data = await callApimart(`/v1/tasks/${encodeURIComponent(taskId)}`, apiKey, config);
  const task = data?.data || {};

  return jsonResponse(200, {
    taskId,
    status: task.status || "unknown",
    progress: task.progress ?? null,
    cost: task.cost ?? null,
    actualTime: task.actual_time ?? null,
    error: task.error || null,
    images: extractImages(task),
    videos: extractVideos(task),
    lastFrames: extractLastFrames(task),
    thumbnailUrl: task?.result?.thumbnail_url || task?.thumbnail_url || null,
    raw: data,
  });
}

async function handleBalance(request, config, path) {
  const apiKey = getRequestApiKey(request, config);
  if (!apiKey) {
    return jsonResponse(400, { error: "Please enter an APIMart API Key before checking balance." });
  }

  const data = await callApimart(path, apiKey, config);
  return balanceResponse(data);
}

async function handleProjectBalance(config) {
  if (!config.apiKey) {
    return jsonResponse(400, { error: "Project APIMART_API_KEY is not configured." });
  }

  const data = await callApimart("/v1/user/balance", config.apiKey, config);
  return balanceResponse(data);
}

function balanceResponse(data) {
  return jsonResponse(200, {
    success: Boolean(data?.success),
    remainBalance: data?.remain_balance ?? null,
    usedBalance: data?.used_balance ?? null,
    unlimitedQuota: Boolean(data?.unlimited_quota),
    message: data?.message || null,
    raw: data,
  });
}

function getRequestApiKey(request, config) {
  const userKey = request.headers.get("x-apimart-api-key");
  return String(userKey || config.apiKey || "").trim();
}

async function callApimart(path, apiKey, config, options = {}) {
  const response = await fetch(`${config.apiUrl}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      ...(options.headers || {}),
    },
  });

  const text = await response.text();
  const data = parseJsonOrThrow(text, `APIMart returned non-JSON response (${response.status})`);

  if (!response.ok || (data.code && Number(data.code) >= 400)) {
    throw normalizeApimartError(response.status, data);
  }

  return data;
}

function parseJsonOrThrow(text, prefix) {
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`${prefix}: ${text.slice(0, 300)}`);
  }
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
    `命中分类: ${labels}`,
    "建议改写: 去掉露骨、性暗示、未成年人、裸露、身体挑逗、敏感姿势等描述，改成服装、场景、光线、构图、画风、镜头语言。",
  ];

  if (requestId) tips.push(`Request ID: ${requestId}`);
  if (traceId) tips.push(`Trace ID: ${traceId}`);
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

async function readJsonRequest(request) {
  const text = await request.text();
  return text ? JSON.parse(text) : {};
}

function jsonResponse(status, data) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
  });
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
