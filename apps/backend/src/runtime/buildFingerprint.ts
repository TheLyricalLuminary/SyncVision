import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const DIST_INDEX = path.resolve(__dirname, "../index.js");

function getGitCommit(): string {
  try {
    return execSync("git rev-parse HEAD", { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
  } catch {
    return "unknown";
  }
}

function getDistMtime(): number {
  try {
    return fs.statSync(DIST_INDEX).mtimeMs;
  } catch {
    return 0;
  }
}

export function assertRuntimeCoherency(): void {
  const runtimeMtime = getDistMtime();
  const startedAt = Date.now();
  const gitCommit = getGitCommit();

  // Snapshot fingerprint at process start
  const fingerprint = {
    pid: process.pid,
    build: new Date(runtimeMtime).toISOString(),
    git: gitCommit,
    startedAt: new Date(startedAt).toISOString(),
  };

  console.log(
    `[RUNTIME] pid=${fingerprint.pid} build=${fingerprint.build} git=${fingerprint.git.slice(0, 12)} startedAt=${fingerprint.startedAt}`
  );

  // Store mtime at startup; re-check periodically to catch hot-rebuild without restart
  const POLL_INTERVAL_MS = 30_000;
  const timer = setInterval(() => {
    const currentMtime = getDistMtime();
    if (currentMtime > runtimeMtime + 1000) {
      console.error(
        `[RUNTIME] STALE_RUNTIME_PROCESS_DETECTED — dist rebuilt at ${new Date(currentMtime).toISOString()} but process started from build at ${new Date(runtimeMtime).toISOString()}. Restart the server to load the new build.`
      );
      process.exitCode = 1;
      process.exit(1);
    }
  }, POLL_INTERVAL_MS);

  // Don't keep the process alive just for this
  timer.unref();
}
