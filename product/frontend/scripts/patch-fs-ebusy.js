/**
 * Retry fs operations when OneDrive briefly locks files (Windows EBUSY / EPERM).
 * Loaded via: node -r ./scripts/patch-fs-ebusy.js ...
 */
const fs = require("fs");

const RETRYABLE = new Set(["EBUSY", "EPERM", "EACCES"]);
const MAX_ATTEMPTS = 10;

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function shouldRetry(err) {
  return err && RETRYABLE.has(err.code);
}

function patchSync(methodName) {
  const original = fs[methodName];
  if (typeof original !== "function") return;

  fs[methodName] = function patched(...args) {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      try {
        return original.apply(fs, args);
      } catch (err) {
        if (!shouldRetry(err) || attempt === MAX_ATTEMPTS - 1) throw err;
        sleep(40 * (attempt + 1));
      }
    }
  };
}

function patchCallback(methodName) {
  const original = fs[methodName];
  if (typeof original !== "function") return;

  fs[methodName] = function patched(...args) {
    const cb = args[args.length - 1];
    if (typeof cb !== "function") {
      return original.apply(fs, args);
    }

    const rest = args.slice(0, -1);

    const attempt = (n) => {
      original.call(fs, ...rest, (err, ...results) => {
        if (shouldRetry(err) && n < MAX_ATTEMPTS - 1) {
          setTimeout(() => attempt(n + 1), 40 * (n + 1));
          return;
        }
        cb(err, ...results);
      });
    };

    attempt(0);
  };
}

async function withRetryAsync(fn) {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (!shouldRetry(err) || attempt === MAX_ATTEMPTS - 1) throw err;
      await new Promise((r) => setTimeout(r, 40 * (attempt + 1)));
    }
  }
}

function patchPromise(methodName) {
  const original = fs.promises[methodName];
  if (typeof original !== "function") return;

  fs.promises[methodName] = (...args) =>
    withRetryAsync(() => original.apply(fs.promises, args));
}

[
  "openSync",
  "readFileSync",
  "writeFileSync",
  "appendFileSync",
  "copyFileSync",
  "renameSync",
  "mkdirSync",
  "rmSync",
  "unlinkSync",
].forEach(patchSync);

["open", "readFile", "writeFile", "appendFile", "copyFile", "rename", "mkdir", "rm", "unlink"].forEach(
  patchCallback,
);

["open", "readFile", "writeFile", "appendFile", "copyFile", "rename", "mkdir", "rm", "unlink"].forEach(
  patchPromise,
);
