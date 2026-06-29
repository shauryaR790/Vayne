const path = require("path");
const os = require("os");

const frontendRoot = path.join(__dirname, "..");
const externalCacheRoot = path.join(os.homedir(), "AppData", "Local", "vayne-next-cache");
const externalNextDir = path.join(externalCacheRoot, ".next");
const localNextDir = path.join(frontendRoot, ".next");

/** Relative distDir — Next.js rejects absolute paths on Windows. */
const distDir = path.relative(frontendRoot, externalNextDir).split(path.sep).join("/");

module.exports = {
  frontendRoot,
  externalCacheRoot,
  externalNextDir,
  localNextDir,
  distDir,
};
