# MEMORY

## 项目

- 项目名：APIMart-image-Agent
- 工作目录：/Users/sai/Desktop/Vibe Coding项目实践/APIMart-image-Agent
- 创建/更新日期：2026-06-18
- 技术栈：Node.js ESM HTTP server + static frontend；支持 APIMart 图片/视频接口、DeepSeek 提示词生成、Vercel/Cloudflare 部署配置。

## 已知约束

- 会话开始先读取 `AGENTS.md` 和 `MEMORY.md`。
- 缺少模板目录时，用用户当前提供的项目规则生成本地 `AGENTS.md`。
- 凭据只记录位置，不记录值。
- 应用运行需要服务端环境变量 `DEEPSEEK_API_KEY`；截图报错显示当前服务端未配置该变量。
- 本地 DeepSeek API key 存放位置：`.env.local`，不要提交到 Git；用户已在聊天中暴露过该 key，建议后续轮换。
- 代码来源：GitHub `guoba371/APIMart-image-Agent`；源码已复制到当前目录，但 `.git` 元数据因沙盒限制未写入。
- 本地 Node 服务端只自动读取 `.env`，不读取 `.env.local`；已从 `.env.local` 复制出 `.env` 供本地启动读取。
- 本地 APIMart API key 存放位置：`.env`，不要提交到 Git；用户已在聊天中暴露过该 key，建议后续轮换。
- `server.mjs` 原本无条件启用 Windows PowerShell 请求兜底，macOS 会报 `spawn powershell.exe ENOENT`；已改为仅 Windows 启用。
- 2026-06-18 诊断：`/api/config` 显示 `hasApiKey: true`、`hasDeepSeekApiKey: true`；但本机直连 `https://api.apimart.ai` 和 `/v1/user/balance` 超时。DNS 解析到 `104.244.43.228`，系统代理为空，结论是当前网络到 APIMart 443 不通，不是 key 未配置。
- 本机 `127.0.0.1:7897` 代理端口可用；通过该代理访问 `https://api.apimart.ai` 成功返回 HTTP 响应。已新增 `npm run dev:proxy`，用 Node 24 的 `--use-env-proxy` 让服务端请求 APIMart 走代理。
- 2026-06-18 后续现象：在代理模式可连通 APIMart 的前提下，生成接口仍可能收到 APIMart 上游 `503 Please wait and try again later`。这表示请求已到 APIMart，但其服务暂时不可用，不是本地 key、代理或代码未启动。
- 对照 `wan2.5` 文档后已修正本地请求约束：UI 仍用 `wan2.5` 作为本地选择值，但发往 APIMart 时映射为 `wan2.5-preview`；同时收紧为最多 1 张参考图、去掉 `size`、禁用 `adaptive`，并把时长限制为离散值 `5` 或 `10` 秒，不允许 `8` 秒。
- 2026-06-29 新增视频模型：本地选择值 `grok-imagine-1.5` 映射到 APIMart `grok-imagine-1.5-video-apimart`，请求字段用 `size`、`duration`、`quality`，不发送 `resolution`；支持比例 `16:9/9:16/1:1/3:2/2:3`、时长 `6-30` 秒、质量 `480p/720p`、最多 7 张参考图。
- 2026-06-29 新增视频模型：`Omni-Flash-Ext` 直传同名模型，UI 的 `size` 发往上游时映射为 `aspect_ratio`；支持分辨率 `720p/1080p/4k`、时长 `4/6/8/10` 秒、参考图数量只允许 `0/1/3`，3 张图时发送 `generation_type: reference`；参考视频最多 1 个，且参考视频模式不发送 `duration`。
- 2026-06-18 发布阻塞：当前工作目录没有 `.git`，已在 `/private/tmp/APIMart-image-Agent-download` 生成提交 `f11b91d (Fix local networking and wan2.5 constraints)`；但推送到 GitHub 因本机网络无法连接 `github.com:443` 失败。
- 2026-06-18 Cloudflare 部署阻塞：`wrangler deploy` 可启动，但当前 Cloudflare 认证无法自动获取 account ID；需要重新 `wrangler login`，或在 `wrangler.toml` / 环境变量中提供 `account_id` / `CLOUDFLARE_ACCOUNT_ID`。
- 2026-06-29 已通过临时 clone `/private/tmp/APIMart-image-Agent-push` 将代码推送到 GitHub `guoba371/APIMart-image-Agent` 的 `main` 分支，提交 `376dc8c Add Grok and Omni video models`；本地项目目录仍是后续重新 `git init` 产生的空历史状态，不要直接在该 `.git` 上继续发布。
- 2026-06-29 Cloudflare：`npx wrangler deploy --dry-run` 打包通过；真实 `npx wrangler deploy` 仍失败在 `Failed to automatically retrieve account IDs for the logged in user`，当前环境未检测到 `CLOUDFLARE_` / `CF_` 变量名。需要重新 `npx wrangler login`，或用临时 `CLOUDFLARE_ACCOUNT_ID` 环境变量部署。
- 2026-06-29 再次重试 Cloudflare 部署：`npx wrangler whoami` 仍无法自动获取 account ID；`npx wrangler deploy --dry-run` 仍通过；真实 `npx wrangler deploy` 仍因同一 account ID/登录态问题失败。
- 2026-06-29 第三次重试 Cloudflare 部署：`npx wrangler deploy --dry-run` 仍通过，真实 `npx wrangler deploy` 仍失败在同一个 `Failed to automatically retrieve account IDs for the logged in user`；需要用户先修复 Cloudflare 登录态或提供临时 `CLOUDFLARE_ACCOUNT_ID`。
- 2026-06-29 Cloudflare 登录授权恢复后部署成功：`npx wrangler deploy` 发布 `apimart-image-agent` 到 `https://apimart-image-agent.guoshanming1990-45d.workers.dev`，Version ID `5aeb6291-6189-4304-816a-0b19753e038a`。本机直连 workers.dev 会超时，需通过 `127.0.0.1:7897` 代理验证；代理验证 `/` 包含 Grok/Omni 新模型，`/api/config` 返回新模型列表。线上当前未配置 `APIMART_API_KEY` / `DEEPSEEK_API_KEY`，`/api/config` 显示 `hasApiKey:false`、`hasDeepSeekApiKey:false`。
- 2026-06-29 用户要求改部署到 Cloudflare `1326156839@qq.com's Account`；重新 `npx wrangler login` 后账号为 `1326156839@qq.com`，Account ID `4cc840f10ba6df0ac1780e90159074d0`。`npx wrangler deploy` 发布成功：`https://apimart-image-agent.1326156839.workers.dev`，Version ID `bbc10202-d20a-4d53-a32b-87ef7a520e95`。代理验证 `/` 包含 Grok/Omni 新模型，`/api/config` 返回新模型列表，且 `hasApiKey:true`、`hasDeepSeekApiKey:false`。
- 2026-07-11 图片生成新增 `nano-banana-pro`（上游映射 `gemini-3-pro-image-preview-official`）、`doubao-seedream-5-0-pro`、`gpt-image-2-official`；服务端按模型限制分辨率、生成张数和参考图数量。新增 `/api/audio/speech`，使用 `gpt-4o-mini-tts` 同步透传二进制音频，支持 6 种音色和 WAV/Opus/AAC/FLAC/PCM。
- 2026-07-11 已将图片模型、TTS 和移动端模式切换优化推送到 GitHub `guoba371/APIMart-image-Agent` 的 `main`，提交 `7be830e`（基于 `376dc8c` 追加，保留历史）。Cloudflare 部署到 `https://apimart-image-agent.1326156839.workers.dev`，Version ID `f8739068-9261-4936-bd7f-b0e43072d492`；线上 `/api/config` 验证四个图片模型生效，`hasApiKey:true`、`hasDeepSeekApiKey:false`。
- 2026-07-11 APIMart 图片任务可能返回嵌套错误 `OutputImageSensitiveContentDetected`，含义是生成结果被上游安全审核拦截，不一定是提示词本身违规；服务端已将其归一化为中文可操作提示并提取 Request ID，前端不再重复展示原始 JSON，同时自动生成降敏提示词。

## 待确认

- 暂无。
