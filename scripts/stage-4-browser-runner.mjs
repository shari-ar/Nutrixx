import { spawn } from 'node:child_process';
import { readFile, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEFAULT_WEB_PORT } from '@nutrixx/config/application';

const browserPath = process.argv[2];
const deviceLabel = process.argv[3];
const mode = process.argv[4] === 'local' ? 'run-local' : 'run';
if (!browserPath || !deviceLabel) {
  throw new TypeError(
    'Usage: node scripts/stage-4-browser-runner.mjs <browser-executable> <device-label>',
  );
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = path.join(root, '.temp/stage-4-acceptance');
await mkdir(outputDirectory, { recursive: true });
const profile = await mkdtemp(path.join(outputDirectory, 'browser-profile-'));
const browser = spawn(
  browserPath,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--no-proxy-server',
    '--remote-debugging-port=0',
    `--user-data-dir=${profile}`,
    'about:blank',
  ],
  { windowsHide: true, stdio: 'ignore' },
);

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForDebugPort() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (browser.exitCode !== null)
      throw new TypeError('The browser exited before opening its debug port.');
    try {
      const [port] = (
        await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')
      )
        .trim()
        .split('\n');
      if (/^\d+$/.test(port)) return port;
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
    await delay(200);
  }
  throw new TypeError(
    'The browser did not open a debug port within 30 seconds.',
  );
}

class DevToolsConnection {
  #socket;
  #nextId = 0;
  #pending = new Map();

  constructor(url) {
    this.#socket = new WebSocket(url);
    this.#socket.addEventListener('message', (event) => {
      const response = JSON.parse(event.data);
      const pending = this.#pending.get(response.id);
      if (!pending) return;
      this.#pending.delete(response.id);
      if (response.error) pending.reject(new TypeError(response.error.message));
      else pending.resolve(response.result);
    });
    this.#socket.addEventListener('close', () => {
      for (const pending of this.#pending.values())
        pending.reject(new TypeError('The browser debug connection closed.'));
      this.#pending.clear();
    });
  }

  async ready() {
    if (this.#socket.readyState === WebSocket.OPEN) return;
    await new Promise((resolve, reject) => {
      this.#socket.addEventListener('open', resolve, { once: true });
      this.#socket.addEventListener('error', reject, { once: true });
    });
  }

  command(method, params = {}) {
    const id = ++this.#nextId;
    return new Promise((resolve, reject) => {
      this.#pending.set(id, { resolve, reject });
      this.#socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    this.#socket.close();
  }
}

let connection;
try {
  const port = await waitForDebugPort();
  const response = await fetch(`http://127.0.0.1:${port}/json/list`);
  if (response.status === 403)
    throw new TypeError('Browser debug endpoint returned HTTP 403.');
  if (!response.ok)
    throw new TypeError(
      `Browser debug endpoint returned HTTP ${response.status}.`,
    );
  const pages = await response.json();
  const page = pages.find((item) => item.type === 'page');
  if (!page) throw new TypeError('The browser has no debuggable page.');
  connection = new DevToolsConnection(page.webSocketDebuggerUrl);
  await connection.ready();
  await connection.command('Page.enable');
  await connection.command('Runtime.enable');
  await connection.command('Page.navigate', {
    url: `http://localhost:${String(DEFAULT_WEB_PORT)}/acceptance?${mode}`,
  });

  const deadline = Date.now() + 180_000;
  let outcome = null;
  while (Date.now() < deadline) {
    const evaluated = await connection.command('Runtime.evaluate', {
      expression: `(() => {
        const result = document.querySelector('#stage4-result');
        if (result) return { kind: 'result', value: result.textContent };
        const error = document.querySelector('#stage4-error');
        if (error) return { kind: 'error', value: error.textContent };
        return null;
      })()`,
      returnByValue: true,
    });
    outcome = evaluated.result?.value ?? null;
    if (outcome !== null) break;
    await delay(1_000);
  }
  if (outcome === null)
    throw new TypeError(
      'The browser acceptance page did not finish within 180 seconds.',
    );
  if (outcome.kind === 'error') throw new TypeError(outcome.value);
  const measurement = JSON.parse(outcome.value);
  const report = {
    deviceLabel,
    os: `${os.platform()} ${os.release()} ${os.arch()}`,
    cpu: os.cpus()[0]?.model ?? 'unknown',
    physicalMemoryBytes: os.totalmem(),
    measurement,
  };
  const safeLabel = deviceLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const reportPath = path.join(outputDirectory, `${safeLabel}.json`);
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(reportPath);
  console.log(
    `Worker p95: ${measurement.workerP95Ms} ms; main-thread maximum gap: ${measurement.maxMainThreadGapMs} ms.`,
  );
} finally {
  if (connection) connection.close();
  browser.kill();
}
