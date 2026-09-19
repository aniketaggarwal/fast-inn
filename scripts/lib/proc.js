// Process/readiness helpers shared by scripts/demo.js (a dev machine) and
// scripts/serve.js (the container entrypoint).
const { spawn } = require("child_process");
const fs = require("fs");
const net = require("net");
const path = require("path");

function portOpen(port, host = "127.0.0.1") {
  return new Promise((resolve) => {
    const socket = net.connect(port, host);
    socket.once("connect", () => (socket.destroy(), resolve(true)));
    socket.once("error", () => resolve(false));
    socket.setTimeout(1000, () => (socket.destroy(), resolve(false)));
  });
}

async function waitFor(check, label, timeoutMs, onTimeout) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 400));
  }
  onTimeout(`${label} did not become ready in ${timeoutMs / 1000}s`);
}

const healthy = (port) => async () => {
  try {
    return (await fetch(`http://127.0.0.1:${port}/health`)).ok;
  } catch {
    return false;
  }
};

// Owns the child processes: logs to <logDir>/<name>.log, and if any child
// dies the whole thing goes down (a half-running demo is worse than none).
function createSupervisor({ logDir, onFatal }) {
  const children = [];
  fs.mkdirSync(logDir, { recursive: true });

  function launch(name, cmd, args, { cwd, env = {} } = {}) {
    const out = fs.openSync(path.join(logDir, `${name}.log`), "w");
    const child = spawn(cmd, args, { cwd, env: { ...process.env, ...env }, stdio: ["ignore", out, out] });
    child.on("exit", (code) => {
      if (code) onFatal(`${name} exited with code ${code} — see ${path.join(logDir, `${name}.log`)}`);
    });
    children.push(child);
    return child;
  }

  const track = (child) => children.push(child);
  const killAll = () => children.forEach((c) => c.kill("SIGTERM"));

  return { launch, track, killAll };
}

module.exports = { portOpen, waitFor, healthy, createSupervisor };
