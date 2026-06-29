import { createServer } from "node:http";
import { spawn } from "node:child_process";
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
if (process.platform === "win32") {
  installLocalApimartFetchFallback(config.apiUrl);
}

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
  try {
    const request = await createNodeRequest(req);
    const response = await handleRequest(request, process.env, { serveStatic });
    await sendNodeResponse(res, response);
  } catch (error) {
    const body = JSON.stringify({
      error: error.userMessage || error.message || "Local server error",
      code: error.code || error.cause?.code || null,
      raw: {
        cause: error.cause?.message || null,
      },
    });
    res.writeHead(error.statusCode || 500, {
      "Content-Type": "application/json; charset=utf-8",
    });
    res.end(body);
  }
}

if (process.env.VERCEL !== "1") {
  createServer(listener).listen(config.port, () => {
    console.log(`APIMart image agent is running at http://localhost:${config.port}`);
  });
}

export default listener;

function installLocalApimartFetchFallback(apiUrl) {
  const apiOrigin = new URL(apiUrl).origin;
  const nativeFetch = globalThis.fetch.bind(globalThis);

  globalThis.fetch = async (resource, init = {}) => {
    const url = typeof resource === "string" ? resource : resource?.url;
    try {
      return await nativeFetch(resource, init);
    } catch (error) {
      if (!url || !String(url).startsWith(apiOrigin)) throw error;
      console.warn(`Native fetch to APIMart failed on Windows, retrying through PowerShell: ${error.message}`);
      return powershellFetch(String(url), init);
    }
  };
}

async function powershellFetch(url, init = {}) {
  const headers = headersToObject(init.headers || {});
  const bodyBuffer = init.body === undefined || init.body === null
    ? null
    : Buffer.from(init.body instanceof ArrayBuffer ? init.body : String(init.body));

  const request = {
    url,
    method: init.method || "GET",
    headers,
    bodyBase64: bodyBuffer ? bodyBuffer.toString("base64") : "",
  };

  const script = `
$ErrorActionPreference = "Stop"
$raw = [Console]::In.ReadToEnd()
$req = $raw | ConvertFrom-Json
$headers = @{}
if ($req.headers) {
  foreach ($prop in $req.headers.PSObject.Properties) {
    if ($prop.Name -ne "content-type") {
      $headers[$prop.Name] = [string]$prop.Value
    }
  }
}
$contentType = "application/json"
if ($req.headers -and $req.headers.PSObject.Properties.Name -contains "content-type") {
  $contentType = [string]$req.headers."content-type"
}
$params = @{
  Uri = [string]$req.url
  Method = [string]$req.method
  Headers = $headers
  UseBasicParsing = $true
  TimeoutSec = 180
}
if ($req.bodyBase64) {
  $params.Body = [Convert]::FromBase64String([string]$req.bodyBase64)
  $params.ContentType = $contentType
}
function Convert-Headers($headers) {
  $out = @{}
  if ($headers) {
    foreach ($key in $headers.AllKeys) {
      $out[$key] = [string]$headers[$key]
    }
  }
  return $out
}
try {
  $resp = Invoke-WebRequest @params
  [Console]::Out.Write((@{
    status = [int]$resp.StatusCode
    headers = Convert-Headers $resp.Headers
    body = [string]$resp.Content
  } | ConvertTo-Json -Compress -Depth 6))
} catch {
  $response = $_.Exception.Response
  if ($response) {
    $reader = New-Object IO.StreamReader($response.GetResponseStream())
    $body = $reader.ReadToEnd()
    [Console]::Out.Write((@{
      status = [int]$response.StatusCode
      headers = Convert-Headers $response.Headers
      body = [string]$body
    } | ConvertTo-Json -Compress -Depth 6))
  } else {
    [Console]::Error.Write($_.Exception.Message)
    exit 1
  }
}
`;

  const encoded = Buffer.from(script, "utf16le").toString("base64");
  const result = await runPowerShell(encoded, JSON.stringify(request));
  const payload = JSON.parse(result.stdout);
  return new Response(payload.body || "", {
    status: payload.status || 502,
    headers: payload.headers || {},
  });
}

function runPowerShell(encodedCommand, stdin) {
  return new Promise((resolve, reject) => {
    const child = spawn("powershell.exe", [
      "-NoProfile",
      "-NonInteractive",
      "-EncodedCommand",
      encodedCommand,
    ], {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(stderr || `PowerShell fetch failed with exit code ${code}`));
      }
    });
    child.stdin.end(stdin);
  });
}

function headersToObject(headers) {
  if (headers instanceof Headers) {
    return Object.fromEntries(headers.entries());
  }
  if (Array.isArray(headers)) {
    return Object.fromEntries(headers);
  }
  return Object.fromEntries(
    Object.entries(headers || {}).map(([key, value]) => [key.toLowerCase(), String(value)]),
  );
}
