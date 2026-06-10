import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

import {
  createConfig,
  createNodeRequest,
  getMimeType,
  handleRequest,
  loadEnvFile,
  sendNodeResponse,
} from "./app.mjs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const publicDir = join(__dirname, "public");
const envPath = join(__dirname, ".env");

if (existsSync(envPath)) {
  loadEnvFile((path) => readFileSync(path, "utf8"), envPath, process.env);
}

const config = createConfig(process.env);

const serveStatic = async (request) => {
  const url = new URL(request.url);
  const requested = url.pathname === "/" ? "/index.html" : url.pathname;
  const safePath = normalize(decodeURIComponent(requested))
    .replace(/^[/\\]+/, "")
    .replace(/^(\.\.[/\\])+/, "");
  const filePath = join(publicDir, safePath);

  if (!filePath.startsWith(publicDir) || !existsSync(filePath)) {
    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  }

  const content = await readFile(filePath);
  return new Response(content, {
    status: 200,
    headers: {
      "Content-Type": getMimeType(filePath),
    },
  });
};

async function listener(req, res) {
  const request = await createNodeRequest(req);
  const response = await handleRequest(request, process.env, { serveStatic });
  await sendNodeResponse(res, response);
}

if (process.env.VERCEL !== "1") {
  createServer(listener).listen(config.port, () => {
    console.log(`APIMart image agent is running at http://localhost:${config.port}`);
  });
}

export default listener;
