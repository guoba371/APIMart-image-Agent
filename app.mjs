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
  ".gif": "image/gif",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".m4v": "video/x-m4v",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".flac": "audio/flac",
  ".ogg": "audio/ogg",
};

const videoModels = ["doubao-seedance-2.0", "wan2.5", "grok-imagine-1.5", "Omni-Flash-Ext"];
const videoModelCapabilities = {
  "doubao-seedance-2.0": {
    imageUrls: true,
    frames: true,
    referenceVideo: true,
    referenceAudio: true,
    generateAudio: true,
    returnLastFrame: true,
  },
  "wan2.5": {
    imageUrls: true,
    frames: false,
    referenceVideo: false,
    referenceAudio: false,
    generateAudio: false,
    returnLastFrame: false,
  },
  "grok-imagine-1.5": {
    imageUrls: true,
    frames: false,
    referenceVideo: false,
    referenceAudio: false,
    generateAudio: false,
    returnLastFrame: false,
  },
  "Omni-Flash-Ext": {
    imageUrls: true,
    frames: false,
    referenceVideo: true,
    referenceAudio: false,
    generateAudio: false,
    returnLastFrame: false,
  },
};

const apimartVideoModelMap = {
  "doubao-seedance-2.0": "doubao-seedance-2.0",
  "wan2.5": "wan2.5-preview",
  "grok-imagine-1.5": "grok-imagine-1.5-video-apimart",
  "Omni-Flash-Ext": "Omni-Flash-Ext",
};

export function createConfig(env = {}) {
  return {
    apiKey: String(env.APIMART_API_KEY || "").trim(),
    apiUrl: String(env.APIMART_API_URL || "https://api.apimart.ai").replace(/\/+$/, ""),
    model: String(env.APIMART_MODEL || "gpt-image-2").trim(),
    videoModel: String(env.APIMART_VIDEO_MODEL || "doubao-seedance-2.0").trim(),
    deepseekApiKey: String(env.DEEPSEEK_API_KEY || "").trim(),
    deepseekApiUrl: String(env.DEEPSEEK_API_URL || "https://api.deepseek.com").replace(/\/+$/, ""),
    deepseekModel: String(env.DEEPSEEK_MODEL || "deepseek-v4-flash").trim(),
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
        videoModels,
        videoModelCapabilities,
        hasDeepSeekApiKey: Boolean(config.deepseekApiKey),
        deepseekModel: config.deepseekModel,
        hasApiKey: Boolean(config.apiKey),
      });
    }

    if (request.method === "GET" && url.pathname === "/api/account/token-balance") {
      return await handleBalance(request, config, "/v1/balance");
    }

    if (request.method === "GET" && url.pathname === "/api/account/user-balance") {
      return await handleBalance(request, config, "/v1/user/balance");
    }

    if (request.method === "GET" && url.pathname === "/api/account/project-balance") {
      return await handleProjectBalance(config);
    }

    if (request.method === "POST" && url.pathname === "/api/generate") {
      const body = await readJsonRequest(request);
      return await handleGenerate(request, config, body);
    }

    if (request.method === "POST" && url.pathname === "/api/videos/generate") {
      const body = await readJsonRequest(request);
      return await handleVideoGenerate(request, config, body);
    }

    if (request.method === "POST" && url.pathname === "/api/prompts/generate") {
      const body = await readJsonRequest(request);
      return await handlePromptGenerate(config, body);
    }

    if (request.method === "POST" && url.pathname === "/api/uploads/images") {
      return await handleImageUpload(request, config);
    }

    if (request.method === "GET" && url.pathname.startsWith("/api/tasks/")) {
      const taskId = decodeURIComponent(url.pathname.replace("/api/tasks/", ""));
      return await handleTaskStatus(request, config, taskId);
    }

    if (request.method === "GET" && options.serveStatic) {
      return await options.serveStatic(request);
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
  const videoUrls = normalizeStringArray(body.videoUrls);
  const audioUrls = normalizeStringArray(body.audioUrls);
  const hasFrameInput = Boolean(firstFrameUrl || lastFrameUrl);
  const hasImageInput = imageUrls.length || hasFrameInput;
  const hasMediaInput = hasImageInput || videoUrls.length || audioUrls.length;

  if (!prompt && !hasMediaInput) {
    return jsonResponse(400, { error: "Prompt or at least one reference image, video, or audio URL is required" });
  }

  if (hasFrameInput && (videoUrls.length || audioUrls.length)) {
    return jsonResponse(400, { error: "First/last frame mode cannot be combined with reference video or audio URLs." });
  }

  const mediaUrlError = validateReferenceMedia({ imageUrls, videoUrls, audioUrls });
  if (mediaUrlError) {
    return jsonResponse(400, { error: mediaUrlError });
  }

  const modelResult = resolveVideoModel(body.model, config.videoModel);
  if (modelResult.error) {
    return jsonResponse(400, { error: modelResult.error });
  }

  const capabilityError = validateVideoModelCapabilities(modelResult.model, {
    hasFrameInput,
    imageUrls,
    videoUrls,
    audioUrls,
    generateAudio: body.generateAudio,
    returnLastFrame: body.returnLastFrame,
  });
  if (capabilityError) {
    return jsonResponse(400, { error: capabilityError });
  }

  const modelRequestError = validateVideoModelRequest(modelResult.model, {
    prompt,
    videoType: String(body.videoType || "text").trim(),
    size: String(body.size || "").trim(),
    resolution: String(body.resolution || "").trim(),
    duration: Number(body.duration),
    imageUrls,
    videoUrls,
  });
  if (modelRequestError) {
    return jsonResponse(400, { error: modelRequestError });
  }

  const capabilities = videoModelCapabilities[modelResult.model];
  const upstreamModel = apimartVideoModelMap[modelResult.model] || modelResult.model;
  const payload = buildVideoPayload(modelResult.model, upstreamModel, body, {
    prompt,
    imageUrls,
    videoUrls,
  });

  if (capabilities.generateAudio) payload.generate_audio = toBoolean(body.generateAudio);
  if (capabilities.returnLastFrame) payload.return_last_frame = toBoolean(body.returnLastFrame);

  const seed = Number.parseInt(body.seed, 10);
  if (!Number.isNaN(seed)) payload.seed = seed;

  if (capabilities.frames && (firstFrameUrl || lastFrameUrl)) {
    payload.image_with_roles = [];
    if (firstFrameUrl) payload.image_with_roles.push({ url: firstFrameUrl, role: "first_frame" });
    if (lastFrameUrl) payload.image_with_roles.push({ url: lastFrameUrl, role: "last_frame" });
  } else if (capabilities.imageUrls && imageUrls.length) {
    payload.image_urls = getVideoModelImageUrls(modelResult.model, imageUrls);
    if (modelResult.model === "Omni-Flash-Ext" && payload.image_urls.length === 3) {
      payload.generation_type = "reference";
    }
  }

  if (!hasFrameInput) {
    if (capabilities.referenceVideo && videoUrls.length) payload.video_urls = getVideoModelVideoUrls(modelResult.model, videoUrls);
    if (capabilities.referenceAudio && audioUrls.length) payload.audio_urls = audioUrls.slice(0, 3);
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

async function handlePromptGenerate(config, body) {
  if (!config.deepseekApiKey) {
    return jsonResponse(400, { error: "DeepSeek API key is not configured. Please set DEEPSEEK_API_KEY on the server." });
  }

  const context = normalizePromptContext(body);
  if (!context.product && !context.idea) {
    return jsonResponse(400, { error: "Product, service name, or idea is required." });
  }

  const data = await callDeepSeek(config, {
    model: config.deepseekModel,
    messages: [
      {
        role: "system",
        content: [
          "你是 Seedance 2.0 / Wan 2.5 营销视频提示词专家。",
          "只输出严格 JSON，不要 Markdown，不要代码块。",
          "JSON 字段必须是 fullPrompt、compactPrompt、paramAdvice。",
          "提示词要适合中文营销广告、招商宣传、信息流短视频。",
          "必须包含主体、场景、运动、镜头、美学、风格、音频、限制。",
          "不要生成真实可识别真人脸、平台侵权 UI、二维码、联系方式、水印或杂乱小字。",
        ].join("\n"),
      },
      {
        role: "user",
        content: buildDeepSeekPromptRequest(context),
      },
    ],
    temperature: 0.7,
    response_format: { type: "json_object" },
  });

  const content = data?.choices?.[0]?.message?.content || "";
  const generated = parsePromptAgentJson(content);
  return jsonResponse(200, {
    fullPrompt: generated.fullPrompt,
    compactPrompt: generated.compactPrompt,
    paramAdvice: generated.paramAdvice,
    model: config.deepseekModel,
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
  let response;
  try {
    response = await fetch(`${config.apiUrl}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        ...(options.headers || {}),
      },
    });
  } catch (error) {
    const wrapped = new Error(`APIMart network request failed: ${error.message || error}`);
    wrapped.statusCode = 502;
    wrapped.userMessage = `APIMart 网络请求失败：${error.message || error}`;
    wrapped.code = error.code || error.cause?.code || null;
    wrapped.raw = {
      cause: error.cause?.message || null,
      path,
    };
    throw wrapped;
  }

  const text = await response.text();
  const data = parseJsonOrThrow(text, `APIMart returned non-JSON response (${response.status})`);

  if (!response.ok || (data.code && Number(data.code) >= 400)) {
    throw normalizeApimartError(response.status, data);
  }

  return data;
}

async function callDeepSeek(config, payload) {
  let response;
  try {
    response = await fetch(`${config.deepseekApiUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.deepseekApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    const wrapped = new Error(`DeepSeek network request failed: ${error.message || error}`);
    wrapped.statusCode = 502;
    wrapped.userMessage = `DeepSeek 网络请求失败：${error.message || error}`;
    wrapped.code = error.code || error.cause?.code || null;
    throw wrapped;
  }

  const text = await response.text();
  const data = parseJsonOrThrow(text, `DeepSeek returned non-JSON response (${response.status})`);
  if (!response.ok) {
    const error = new Error(data?.error?.message || data?.message || `DeepSeek request failed (${response.status})`);
    error.statusCode = response.status;
    error.userMessage = error.message;
    error.raw = data;
    throw error;
  }

  return data;
}

function normalizePromptContext(body = {}) {
  return {
    idea: String(body.idea || "").trim(),
    product: String(body.product || "").trim(),
    audience: String(body.audience || "").trim(),
    goal: String(body.goal || "").trim(),
    duration: clampInt(body.duration, 5, 15, 8),
    size: String(body.size || "9:16").trim(),
    model: String(body.model || "doubao-seedance-2.0").trim(),
    style: String(body.style || "viral").trim(),
    rhythm: String(body.rhythm || "beat").trim(),
    audio: String(body.audio || "voice").trim(),
    voice: String(body.voice || "沉稳有力的中文男声").trim(),
    benefits: normalizeStringArray(body.benefits).slice(0, 5),
    offer: String(body.offer || "").trim(),
    cta: String(body.cta || "").trim(),
    restrictions: normalizeStringArray(body.restrictions),
  };
}

function buildDeepSeekPromptRequest(context) {
  return [
    "请基于以下结构化信息，生成 Seedance 2.0 / Wan 2.5 视频提示词。",
    "返回 JSON：",
    "{",
    '  "fullPrompt": "完整分镜版，按时间轴输出 0-2s、2-4s 等结构",',
    '  "compactPrompt": "压缩投喂版，适合模型不稳定时使用",',
    '  "paramAdvice": "参数建议，包含 model、duration、size、generate_audio、参考素材建议"',
    "}",
    "",
    `用户自由需求：${context.idea || "无"}`,
    `产品/服务：${context.product || context.idea}`,
    `目标用户：${context.audience || "未指定，请合理推断"}`,
    `视频目标：${context.goal || "营销转化"}`,
    `时长：${context.duration}s`,
    `比例：${context.size}`,
    `视频模型：${context.model}`,
    `风格：${context.style}`,
    `节奏：${context.rhythm}`,
    `音频：${context.audio}`,
    `旁白：${context.voice}`,
    `卖点：${context.benefits.join("；") || "请根据产品合理提炼 3 条"}`,
    `优惠/利益点：${context.offer || "请根据场景合理生成"}`,
    `CTA：${context.cta || "请给出清晰行动号召"}`,
    `限制词：${context.restrictions.join("；") || "核心文字清晰可读，不要杂乱小字，不要平台侵权 UI，不要真实可识别真人脸"}`,
    "",
    "要求：",
    "1. fullPrompt 必须是中文，适合直接粘贴到视频生成模型。",
    "2. 按时长自动切分 4 段左右分镜，每段包含画面、核心大字、运动/转场、旁白或音频节奏。",
    "3. compactPrompt 不超过 fullPrompt 的 45%，但保留关键信息。",
    "4. paramAdvice 要明确 generate_audio true/false；如果 audio 是 silent 或 voice 是不需要旁白，则建议 false。",
    "5. 不要复刻任何第三方平台 UI，不要输出多余解释。",
  ].join("\n");
}

function parsePromptAgentJson(content) {
  try {
    const parsed = JSON.parse(stripJsonFence(content));
    return {
      fullPrompt: String(parsed.fullPrompt || "").trim(),
      compactPrompt: String(parsed.compactPrompt || "").trim(),
      paramAdvice: String(parsed.paramAdvice || "").trim(),
    };
  } catch (error) {
    const wrapped = new Error("DeepSeek returned invalid prompt JSON.");
    wrapped.statusCode = 502;
    wrapped.userMessage = "DeepSeek 返回的提示词 JSON 无法解析，请重试。";
    wrapped.raw = content;
    throw wrapped;
  }
}

function stripJsonFence(value) {
  return String(value || "")
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
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

function resolveVideoModel(requestedModel, configuredModel) {
  const explicitModel = String(requestedModel || "").trim();
  if (explicitModel) {
    if (videoModels.includes(explicitModel)) return { model: explicitModel };
    return { error: `Unsupported video model: ${explicitModel}. Supported models: ${videoModels.join(", ")}` };
  }

  const defaultModel = String(configuredModel || "").trim();
  return { model: videoModels.includes(defaultModel) ? defaultModel : "doubao-seedance-2.0" };
}

function validateVideoModelCapabilities(model, input) {
  const capabilities = videoModelCapabilities[model];
  if (!capabilities) return `Unsupported video model: ${model}. Supported models: ${videoModels.join(", ")}`;

  const unsupported = [];
  if (input.hasFrameInput && !capabilities.frames) unsupported.push("first/last frame");
  if (input.videoUrls.length && !capabilities.referenceVideo) unsupported.push("reference video");
  if (input.audioUrls.length && !capabilities.referenceAudio) unsupported.push("reference audio");
  if (toBoolean(input.generateAudio) && !capabilities.generateAudio) unsupported.push("generated audio");
  if (toBoolean(input.returnLastFrame) && !capabilities.returnLastFrame) unsupported.push("return last frame");

  if (!unsupported.length) return "";
  return `${getVideoModelLabel(model)} does not support ${unsupported.join(", ")}. Please switch to Seedance 2.0 or remove those parameters.`;
}

function getVideoModelLabel(model) {
  if (model === "doubao-seedance-2.0") return "Seedance 2.0";
  if (model === "wan2.5") return "Wan 2.5";
  if (model === "grok-imagine-1.5") return "Grok Imagine 1.5";
  if (model === "Omni-Flash-Ext") return "Omni-Flash-Ext";
  return model;
}

function buildVideoPayload(model, upstreamModel, body, input) {
  const size = String(body.size || "16:9").trim() || "16:9";
  const resolution = String(body.resolution || "720p").trim() || "720p";
  const payload = {
    model: upstreamModel,
    prompt: input.prompt,
  };

  if (model === "grok-imagine-1.5") {
    payload.duration = clampInt(body.duration, 6, 30, 6);
    payload.size = size;
    payload.quality = ["480p", "720p"].includes(resolution) ? resolution : "720p";
    return payload;
  }

  if (model === "Omni-Flash-Ext") {
    if (!input.videoUrls.length) payload.duration = Number(body.duration);
    payload.resolution = resolution.toLowerCase();
    payload.aspect_ratio = size === "adaptive" ? "16:9" : size;
    return payload;
  }

  payload.duration = model === "wan2.5"
    ? normalizeWanDuration(body.duration)
    : clampInt(body.duration, 4, 15, 5);
  payload.resolution = resolution;
  if (model !== "wan2.5") payload.size = size;
  return payload;
}

function getVideoModelImageUrls(model, imageUrls) {
  if (model === "wan2.5") return imageUrls.slice(0, 1);
  if (model === "grok-imagine-1.5") return imageUrls.slice(0, 7);
  if (model === "Omni-Flash-Ext") return imageUrls.slice(0, 3);
  return imageUrls.slice(0, 9);
}

function getVideoModelVideoUrls(model, videoUrls) {
  if (model === "Omni-Flash-Ext") return videoUrls.slice(0, 1);
  return videoUrls.slice(0, 3);
}

function validateReferenceMedia({ imageUrls, videoUrls, audioUrls }) {
  if (videoUrls.length > 3) return "参考视频最多 3 个，请按 APIMart 文档减少 video_urls 数量。";
  if (audioUrls.length > 3) return "参考音频最多 3 个，请按 APIMart 文档减少 audio_urls 数量。";
  if (audioUrls.length && !imageUrls.length && !videoUrls.length) {
    return "参考音频不能单独使用，请同时提供参考图片或参考视频。";
  }

  const invalidVideo = videoUrls.find((url) => !isSupportedReferenceUrl(url, "video"));
  if (invalidVideo) {
    return `参考视频 URL 格式不符合文档要求：${invalidVideo}。请填写 APIMart 可直接访问的 http(s) 视频 URL 或 asset:// 资源。`;
  }

  const invalidAudio = audioUrls.find((url) => !isSupportedReferenceUrl(url, "audio"));
  if (invalidAudio) {
    return `参考音频 URL 格式不符合文档要求：${invalidAudio}。请填写 APIMart 可直接访问的 http(s) 音频 URL 或 asset:// 资源。`;
  }

  return "";
}

function validateVideoModelRequest(model, input) {
  if (model === "wan2.5") {
    if (input.imageUrls.length > 1) {
      return "Wan 2.5 图生视频按文档只支持 1 张参考图，请只保留一个 image_urls。";
    }
    if (input.videoType === "image" && !input.imageUrls.length) {
      return "Wan 2.5 图生视频需要提供 1 张参考图。";
    }
    if (![5, 10].includes(Number(input.duration))) {
      return "Wan 2.5 按文档只支持 5 秒或 10 秒，请调整 duration。";
    }
    if (input.size === "adaptive") {
      return "Wan 2.5 不支持 adaptive 比例，请改成 16:9、9:16、1:1、4:3、3:4 或 21:9。";
    }
  }

  if (model === "grok-imagine-1.5") {
    if (!input.prompt) {
      return "Grok Imagine 1.5 按文档需要提供 prompt。";
    }
    const duration = Number(input.duration);
    if (!Number.isInteger(duration) || duration < 6 || duration > 30) {
      return "Grok Imagine 1.5 按文档只支持 6-30 秒整数时长，请调整 duration。";
    }
    if (!["16:9", "9:16", "1:1", "3:2", "2:3"].includes(input.size || "16:9")) {
      return "Grok Imagine 1.5 按文档只支持 16:9、9:16、1:1、3:2 或 2:3 比例。";
    }
    if (!["480p", "720p"].includes(input.resolution || "720p")) {
      return "Grok Imagine 1.5 按文档只支持 480p 或 720p quality。";
    }
    if (input.imageUrls.length > 7) {
      return "Grok Imagine 1.5 图生视频按文档最多支持 7 张参考图，请减少 image_urls。";
    }
  }

  if (model === "Omni-Flash-Ext") {
    if (!input.prompt) {
      return "Omni-Flash-Ext 按文档需要提供 prompt。";
    }
    if (!input.videoUrls.length && ![4, 6, 8, 10].includes(Number(input.duration))) {
      return "Omni-Flash-Ext 按文档只支持 4、6、8 或 10 秒；参考视频模式不需要 duration。";
    }
    if (!["720p", "1080p", "4k"].includes(String(input.resolution || "720p").toLowerCase())) {
      return "Omni-Flash-Ext 按文档只支持 720p、1080p 或 4k 分辨率。";
    }
    if (![0, 1, 3].includes(input.imageUrls.length)) {
      return "Omni-Flash-Ext 按文档只支持 0、1 或 3 张参考图，不支持 2 张图。";
    }
    if (input.videoUrls.length > 1) {
      return "Omni-Flash-Ext 按文档最多支持 1 个参考视频。";
    }
    if (input.size === "adaptive") {
      return "Omni-Flash-Ext 不建议使用 adaptive，请改成 16:9 或 9:16。";
    }
  }

  return "";
}

function normalizeWanDuration(value) {
  return Number(value) === 10 ? 10 : 5;
}

function isSupportedReferenceUrl(value, kind) {
  const url = String(value || "").trim();
  if (/^asset:\/\/[\w./:-]+$/i.test(url)) return true;
  if (!/^https?:\/\//i.test(url)) return false;
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) return false;
    const pathname = parsed.pathname.toLowerCase();
    if (!pathname.includes(".")) return true;
    const videoExts = [".mp4", ".mov", ".webm", ".m4v"];
    const audioExts = [".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg"];
    const allowed = kind === "video" ? videoExts : audioExts;
    return allowed.some((ext) => pathname.endsWith(ext));
  } catch {
    return false;
  }
}

function toBoolean(value) {
  return value === true || value === "true" || value === "on" || value === "1" || value === 1;
}
