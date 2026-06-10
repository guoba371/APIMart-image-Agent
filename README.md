# APIMart Image Agent

Local web UI for generating images through APIMart `gpt-image-2`.

## Start

```powershell
cd "E:\Vibe Coding项目集\Test\apimart-image-agent"
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

## Config

Edit `.env`:

```text
APIMART_API_KEY=your-apimart-api-key
APIMART_API_URL=https://api.apimart.ai
APIMART_MODEL=gpt-image-2
PORT=8787
```

## APIMart Flow

1. `POST /v1/images/generations` submits an image task.
2. The server reads `data[0].task_id`.
3. `GET /v1/tasks/{task_id}` polls task status.
4. When completed, the page displays image URLs from `data.result.images`.

Docs:

- https://docs.apimart.ai/cn/api-reference/images/gpt-image-2/generation
- https://docs.apimart.ai/cn/api-reference/tasks/status
