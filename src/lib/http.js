import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const publicDir = fileURLToPath(new URL("../../public/", import.meta.url));
const vendorFiles = new Map([
  ["/vendor/matter.min.js", fileURLToPath(new URL("../../node_modules/matter-js/build/matter.min.js", import.meta.url))],
  ["/vendor/gsap.min.js", fileURLToPath(new URL("../../node_modules/gsap/dist/gsap.min.js", import.meta.url))],
  ["/vendor/paper-full.min.js", fileURLToPath(new URL("../../node_modules/paper/dist/paper-full.min.js", import.meta.url))]
]);
const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

function setSecurityHeaders(response) {
  response.setHeader("Content-Security-Policy", "default-src 'self'; connect-src 'self' ws: wss:; img-src 'self'; style-src 'self'; script-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
}

function sendJson(response, statusCode, body) {
  setSecurityHeaders(response);
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

export async function handleHttpRequest(request, response, snapshot) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    sendJson(response, 405, { error: "method_not_allowed" });
    return;
  }

  const url = new URL(request.url, "http://localhost");
  if (url.pathname === "/health") {
    sendJson(response, 200, { ok: true });
    return;
  }

  if (url.pathname === "/api/state") {
    sendJson(response, 200, snapshot());
    return;
  }

  const vendorPath = vendorFiles.get(url.pathname);
  if (vendorPath) {
    setSecurityHeaders(response);
    response.writeHead(200, {
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Type": "text/javascript; charset=utf-8"
    });
    createReadStream(vendorPath).pipe(response);
    return;
  }

  const requestedPath = url.pathname === "/" ? "/index.html" : url.pathname;
  const safePath = normalize(requestedPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(publicDir, safePath);

  if (!filePath.startsWith(publicDir)) {
    sendJson(response, 403, { error: "forbidden" });
    return;
  }

  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) {
      throw new Error("not a file");
    }

    setSecurityHeaders(response);
    response.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Type": contentTypes[extname(filePath)] ?? "application/octet-stream"
    });

    if (request.method === "HEAD") {
      response.end();
      return;
    }

    createReadStream(filePath).pipe(response);
  } catch {
    sendJson(response, 404, { error: "not_found" });
  }
}
