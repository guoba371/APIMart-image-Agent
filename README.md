# APIMart Image Agent

Local web UI for generating images and videos through APIMart.

## Local Start

```powershell
cd "E:\Vibe Coding项目集\apimart image agent\apimart-image-agent"
npm install
.\start.ps1
```

Then open:

```text
http://localhost:8787
```

You can also start it directly:

```powershell
node server.mjs
```

On macOS, if direct access to APIMart times out but your local proxy is listening on
`127.0.0.1:7897`, start with:

```bash
npm run dev:proxy
```

## Config

Create `.env` from `.env.example`:

```text
APIMART_API_KEY=your-apimart-api-key
APIMART_API_URL=https://api.apimart.ai
APIMART_MODEL=gpt-image-2
APIMART_VIDEO_MODEL=doubao-seedance-2.0
PORT=8787
```

If the user enters an API key in the UI, the request will use that key first. Otherwise it falls back to the project-level `APIMART_API_KEY`.

## Cloudflare Deploy

This project supports Cloudflare Workers plus static assets from `public/`.

1. Install dependencies:

   ```powershell
   npm install
   ```

2. Log in to Cloudflare:

   ```powershell
   npx wrangler login
   ```

3. Set the secret used by the shared project balance endpoint:

   ```powershell
   npx wrangler secret put APIMART_API_KEY
   ```

4. Optional runtime variables can be configured in the Cloudflare dashboard or `wrangler.toml`:

   - `APIMART_API_URL`
   - `APIMART_MODEL`
   - `APIMART_VIDEO_MODEL`

5. Deploy:

   ```powershell
   npm run cf:deploy
   ```

6. Preview the Worker locally:

   ```powershell
   npm run cf:dev
   ```

## APIMart Flow

1. `POST /v1/images/generations` submits an image task.
2. The server reads `data[0].task_id`.
3. `GET /v1/tasks/{task_id}` polls task status.
4. When completed, the page displays image URLs from `data.result.images`.

Docs:

- [APIMart GPT Image Generation](https://docs.apimart.ai/cn/api-reference/images/gpt-image-2/generation)
- [APIMart Task Status](https://docs.apimart.ai/cn/api-reference/tasks/status)
