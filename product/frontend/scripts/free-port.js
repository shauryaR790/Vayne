const { execSync } = require("child_process");

const DEV_PORT = process.env.PORT || "3000";

function freePort(port) {
  if (process.platform === "win32") {
    try {
      execSync(
        `powershell -NoProfile -Command "$procs = Get-NetTCPConnection -LocalPort ${port} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique; foreach ($procId in $procs) { if ($procId -and $procId -ne 0) { Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue } }"`,
        { stdio: "ignore" },
      );
    } catch {
      /* port already free */
    }
    return;
  }
  try {
    execSync(`lsof -ti:${port} | xargs kill -9 2>/dev/null`, { stdio: "ignore" });
  } catch {
    /* port already free */
  }
}

freePort(DEV_PORT);
