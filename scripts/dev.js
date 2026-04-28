#!/usr/bin/env node

const { spawn } = require('child_process');
const http = require('http');
const net = require('net');

const preferredBackendPort = Number(process.env.PORT || process.env.BACKEND_PORT || 4000);
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const children = new Set();
let shuttingDown = false;

function log(message) {
  process.stdout.write(`[dev] ${message}\n`);
}

function isBackendHealthy(port) {
  return new Promise((resolve) => {
    const req = http.get(
      {
        host: '127.0.0.1',
        port,
        path: '/health/live',
        timeout: 800,
      },
      (res) => {
        res.resume();
        resolve(res.statusCode >= 200 && res.statusCode < 300);
      },
    );

    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    req.on('error', () => resolve(false));
  });
}

function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, '127.0.0.1');
  });
}

async function findBackendPort(startPort) {
  for (let port = startPort; port < startPort + 20; port += 1) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No open backend port found from ${startPort} to ${startPort + 19}`);
}

function spawnNpm(args, env) {
  const child = spawn(npmCmd, args, {
    cwd: process.cwd(),
    env: { ...process.env, ...env },
    stdio: 'inherit',
  });
  children.add(child);

  child.on('exit', (code, signal) => {
    children.delete(child);
    if (!shuttingDown && code && code !== 0) {
      log(`${args.join(' ')} exited with code ${code}${signal ? ` (${signal})` : ''}`);
      shutdown(code);
    }
  });

  return child;
}

function shutdown(code = 0) {
  shuttingDown = true;
  for (const child of children) {
    child.kill('SIGTERM');
  }
  process.exit(code);
}

async function main() {
  let backendPort = preferredBackendPort;
  let shouldStartBackend = true;

  if (await isBackendHealthy(preferredBackendPort)) {
    shouldStartBackend = false;
    log(`Using existing backend on http://localhost:${preferredBackendPort}`);
  } else if (!(await isPortAvailable(preferredBackendPort))) {
    backendPort = await findBackendPort(preferredBackendPort + 1);
    log(`Port ${preferredBackendPort} is busy, starting backend on http://localhost:${backendPort}`);
  }

  const sharedFrontendEnv = {
    VITE_DEV_PROXY_TARGET: `http://localhost:${backendPort}`,
    VITE_WS_URL: `http://localhost:${backendPort}`,
  };

  if (shouldStartBackend) {
    spawnNpm(['run', 'dev', '--prefix', 'backend'], { PORT: String(backendPort) });
  }

  spawnNpm(['run', 'dev', '--prefix', 'frontend'], sharedFrontendEnv);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

main().catch((error) => {
  log(error.message || String(error));
  process.exit(1);
});
