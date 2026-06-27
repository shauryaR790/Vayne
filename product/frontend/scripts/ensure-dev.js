const fs = require("fs");
const path = require("path");
const os = require("os");
const { execSync } = require("child_process");

const frontendRoot = path.join(__dirname, "..");
const DEV_PORT = process.env.PORT || "3000";

const cacheDirs = [
  path.join(frontendRoot, ".next"),
  path.join(frontendRoot, "node_modules", ".cache"),
  path.join(frontendRoot, "node_modules", ".cache", "vayne-next"),
  path.join(frontendRoot, "..", ".vayne-next"),
  path.join(os.homedir(), "AppData", "Local", "vayne-next-cache"),
];

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function rmPath(target) {
  if (!fs.existsSync(target)) return;
  try {
    fs.rmSync(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
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

freePort(DEV_PORT);
sleep(500);

for (const dir of cacheDirs) {
  rmPath(dir);
}

sleep(300);
