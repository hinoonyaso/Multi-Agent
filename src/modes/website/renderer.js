import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const DEFAULT_VIEWPORT = { width: 1280, height: 720 };
const MOBILE_VIEWPORT = { width: 375, height: 667 };

/**
 * Build and run artifact, then capture render diagnostics.
 * @param {Object[]} files - Artifact files ({ path, content })
 * @param {string} outputType - "static_html_css_js" | "react_vite_app"
 * @returns {Promise<{ url: string|null, screenshotBase64: string|null, consoleErrors: string[], mobileViewportIssues: string[], success: boolean }>}
 */
export async function captureRenderDiagnostics(files, outputType) {
  const result = {
    url: null,
    screenshotBase64: null,
    consoleErrors: [],
    mobileViewportIssues: [],
    success: false
  };

  let workDir = null;

  try {
    workDir = await mkdtemp(join(tmpdir(), "website-render-"));
    await writeArtifactFiles(workDir, files);

    const { url, close: closeServer, errors: serverErrors } = await startServer(workDir, files, outputType);
    if (serverErrors?.length) result.consoleErrors.push(...serverErrors);
    if (!url) {
      return result;
    }

    result.url = url;

    const browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });

    try {
      const page = await browser.newPage();

      result.consoleErrors = await captureConsoleErrors(page, url);
      result.screenshotBase64 = await captureScreenshot(page, url, DEFAULT_VIEWPORT);
      result.mobileViewportIssues = await checkMobileViewport(page, url);

      result.success = true;
    } finally {
      await browser.close();
      if (typeof closeServer === "function") closeServer();
    }
  } catch (error) {
    result.error = error?.message ?? String(error);
  } finally {
    if (workDir) {
      try {
        await rm(workDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  return result;
}

async function writeArtifactFiles(workDir, files) {
  if (!Array.isArray(files)) return;

  for (const file of files) {
    if (!file?.path || file.content == null) continue;
    const path = join(workDir, file.path.replace(/\\/g, "/"));
    const dir = path.substring(0, path.lastIndexOf("/"));
    if (dir && dir !== workDir) {
      const { mkdir } = await import("node:fs/promises");
      await mkdir(dir, { recursive: true });
    }
    await writeFile(path, file.content, "utf8");
  }
}

async function startServer(workDir, files, outputType) {
  if (outputType === "react_vite_app") {
    return await startViteServer(workDir);
  }
  return await startStaticServer(workDir, files);
}

/** @typedef {{ url: string, close?: () => void }} ServerResult */

async function startStaticServer(workDir, files) {
  const entrypoint = findEntrypoint(files);
  if (!entrypoint) return null;

  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const path = req.url === "/" ? `/${entrypoint}` : req.url;
      const filePath = join(workDir, path.replace(/^\//, "").replace(/\.\./g, ""));
      if (!existsSync(filePath)) {
        res.writeHead(404);
        res.end();
        return;
      }
      const content = readFileSync(filePath, "utf8");
      const contentType = getContentType(filePath);
      res.writeHead(200, { "Content-Type": contentType });
      res.end(content);
    });
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      resolve({
        url: `http://127.0.0.1:${port}/${entrypoint}`,
        close: () => server.close()
      });
    });
    server.on("error", () => resolve({ url: null }));
  });
}

function getContentType(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".js")) return "application/javascript; charset=utf-8";
  return "text/plain; charset=utf-8";
}

async function startViteServer(workDir) {
  if (!existsSync(join(workDir, "package.json"))) {
    return {
      url: null,
      errors: ["[vite] package.json not found — cannot start Vite dev server"]
    };
  }

  return new Promise((resolve) => {
    const child = spawn(
      process.platform === "win32" ? "npx.cmd" : "npx",
      ["vite", "--host", "127.0.0.1", "--port", "4173", "--strictPort"],
      { cwd: workDir, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, CI: "1" } }
    );

    let resolved = false;
    const errors = [];

    const finish = (result) => {
      if (resolved) return;
      resolved = true;
      resolve(result);
    };

    const tryResolveUrl = (chunk) => {
      const text = String(chunk);
      const match = text.match(/http:\/\/127\.0\.0\.1:(\d+)/);
      if (match) {
        finish({
          url: `http://127.0.0.1:${match[1]}`,
          errors,
          close: () => { try { child.kill("SIGTERM"); } catch {} }
        });
      }
    };

    child.stdout.on("data", tryResolveUrl);
    child.stderr.on("data", (chunk) => {
      tryResolveUrl(chunk);
      const text = String(chunk).trim();
      if (text.toLowerCase().includes("error")) errors.push(`[vite] ${text}`);
    });

    child.on("exit", (code) => {
      if (code !== 0) errors.push(`[vite] Process exited with code ${code} — try running npm install first`);
      finish({ url: null, errors });
    });
    child.on("error", (err) => {
      errors.push(`[vite] Failed to spawn: ${err.message}`);
      finish({ url: null, errors });
    });

    setTimeout(() => {
      errors.push("[vite] Server startup timed out after 15s");
      finish({ url: null, errors });
    }, 15000);
  });
}

function findEntrypoint(files) {
  const candidates = ["index.html", "main.html", "app.html"];
  const paths = (files ?? []).map((f) => f?.path?.replace(/\\/g, "/")).filter(Boolean);
  return candidates.find((c) => paths.some((p) => p.endsWith(c))) ?? paths[0] ?? "index.html";
}

async function captureConsoleErrors(page, url) {
  const errors = [];
  page.on("console", (msg) => {
    const type = msg.type();
    if (type === "error" || type === "warning") {
      const text = msg.text();
      if (text) errors.push(`[${type}] ${text}`);
    }
  });
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 }).catch(() => {});
  return errors;
}

async function captureScreenshot(page, url, viewport = DEFAULT_VIEWPORT) {
  try {
    await page.setViewportSize(viewport);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 }).catch(() => {});
    const buffer = await page.screenshot({ type: "png", fullPage: false });
    return buffer ? buffer.toString("base64") : null;
  } catch {
    return null;
  }
}

async function checkMobileViewport(page, url) {
  const issues = [];
  try {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 }).catch(() => {});

    const overflow = await page.evaluate(() => {
      const doc = document.documentElement;
      const body = document.body;
      const scrollWidth = Math.max(doc.scrollWidth, body?.scrollWidth ?? 0);
      const clientWidth = doc.clientWidth || 375;
      return scrollWidth > clientWidth ? scrollWidth - clientWidth : 0;
    });

    if (overflow > 0) {
      issues.push(`Horizontal overflow detected: ${overflow}px beyond viewport (375px).`);
    }
  } catch (error) {
    issues.push(`Mobile viewport check failed: ${error?.message ?? "unknown"}`);
  }
  return issues;
}
