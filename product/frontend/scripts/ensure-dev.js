const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const { frontendRoot, externalCacheRoot, localNextDir } = require("./paths");

const DEV_PORT = process.env.PORT || "3000";

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
