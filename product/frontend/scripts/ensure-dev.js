const fs = require("fs");
const path = require("path");
const http = require("http");
const { execSync, spawn } = require("child_process");

const { frontendRoot, externalCacheRoot, localNextDir } = require("./paths");

const DEV_PORT = process.env.PORT || "3000";
const BACKEND_PORT = process.env.VAYNE_BACKEND_PORT || "8000";
const repoRoot = path.resolve(frontendRoot, "..", "..");

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function rmPath(target) {
  if (!fs.existsSync(target)) return;
  try {
    fs.rmSync(target, { recursive: true, force: true, maxRetries: 8, retryDelay: 400 });
  } catch {
    execSync(
      `powershell -NoProfile -Command "Remove-Item -LiteralPath '${target.replace(/'/g, "''")}' -Recurse -Force -ErrorAction SilentlyContinue"`,
      { stdio: "ignore" },
    );
  }
}

function freePort(port) {
  if (process.platform === "win32") {
    try {
      execSync(
        `powershell -NoProfile -Command "$procs = Get-NetTCPConnection -LocalPort ${port} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique; foreach ($procId in $procs) { if ($procId -and $procId -ne 0) { Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue } }"`,
        { stdio: "ignore" },
      );
    } catch {
      /* port free */
    }
    return;
  }
  try {
    execSync(`lsof -ti:${port} | xargs kill -9 2>/dev/null`, { stdio: "ignore" });
  } catch {
    /* port free */
  }
}

function isCorruptNextCache(nextDir) {
  if (!fs.existsSync(nextDir)) return false;
  const probe = path.join(nextDir, "package.json");
  if (!fs.existsSync(probe)) return false;
  try {
    fs.readlinkSync(probe);
  } catch (err) {
    if (err && (err.code === "EINVAL" || err.code === "ENOENT")) return true;
  }
  return false;
}

freePort(DEV_PORT);
sleep(400);

// Drop stale external-cache experiment if present.
rmPath(externalCacheRoot);

if (process.env.VAYNE_CLEAN === "1" || isCorruptNextCache(localNextDir)) {
  if (isCorruptNextCache(localNextDir)) {
    console.log("Removing corrupted .next cache (OneDrive/symlink issue)…");
  }
  rmPath(localNextDir);
  rmPath(path.join(frontendRoot, "node_modules", ".cache"));
}

sleep(200);

function checkBackend(timeoutMs = 600) {
  return new Promise((resolve) => {
    const req = http.get(
      `http://127.0.0.1:${BACKEND_PORT}/api/health`,
      { timeout: timeoutMs },
      (res) => {
        res.resume();
        resolve(res.statusCode === 200);
      },
    );
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function ensureBackend() {
  if (process.env.VAYNE_SKIP_BACKEND === "1") return;
  if (await checkBackend()) return;

  console.log(`Starting VANE backend on http://127.0.0.1:${BACKEND_PORT} …`);
  const py = process.platform === "win32" ? "python" : "python3";
  const child = spawn(
    py,
    ["-m", "uvicorn", "product.backend.main:app", "--reload", "--port", BACKEND_PORT],
    {
      cwd: repoRoot,
      detached: true,
      stdio: "ignore",
      shell: process.platform === "win32",
    },
  );
  child.unref();

  for (let attempt = 0; attempt < 40; attempt += 1) {
    await new Promise((r) => setTimeout(r, 500));
    if (await checkBackend()) {
      console.log("VANE backend ready.");
      return;
    }
  }

  console.warn(
    `Backend did not respond on port ${BACKEND_PORT}. Start manually:\n` +
      `  python -m uvicorn product.backend.main:app --reload --port ${BACKEND_PORT}`,
  );
}

void ensureBackend();
