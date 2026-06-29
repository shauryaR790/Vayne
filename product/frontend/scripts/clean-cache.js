const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const { frontendRoot, externalCacheRoot, localNextDir } = require("./paths");

const DEV_PORT = process.env.PORT || "3000";

const dirsToRemove = [
  localNextDir,
  path.join(frontendRoot, "node_modules", ".cache"),
  path.join(frontendRoot, "node_modules", ".cache", "vayne-next"),
  path.join(frontendRoot, "..", ".vayne-next"),
  externalCacheRoot,
];

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
  }
}

freePort(DEV_PORT);
for (const dir of dirsToRemove) {
  rmPath(dir);
}
console.log("VAYNE frontend cache cleared.");
