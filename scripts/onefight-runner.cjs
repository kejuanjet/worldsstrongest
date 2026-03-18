const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const WebSocket = require("ws");

const DEFAULT_PORT = 4173;
const DEFAULT_DEBUG_PORT = 9222;
const VITE_READY_TIMEOUT_MS = 60000;
const GAME_READY_TIMEOUT_MS = 120000;
const RESULTS_ROOT = path.resolve(process.cwd(), "test-results", "onefight");
const IDLE_STATES = new Set(["IDLE", "IDLE_COMBAT", "STANCE_IDLE", "SWORD_IDLE"]);
const ACTIVE_ATTACK_STATES = ["ATTACK", "HEAVY", "BLAST", "BEAM", "RUSH", "COMBO", "PUNCH", "KICK", "SLASH"];

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function slug(value) {
  return String(value).replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase();
}

function nowStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function parseArgs(argv) {
  const args = {
    character: "AYO",
    opponent: "RAYNE",
    zone: "TRAINING_GROUND",
    port: DEFAULT_PORT,
    debugPort: DEFAULT_DEBUG_PORT,
    headless: true,
  };

  for (const raw of argv.slice(2)) {
    if (!raw.startsWith("--")) continue;
    const [key, value] = raw.slice(2).split("=", 2);
    if (value == null) {
      if (key === "headed") args.headless = false;
      continue;
    }
    if (key === "character") args.character = value;
    if (key === "opponent") args.opponent = value;
    if (key === "zone") args.zone = value;
    if (key === "port") args.port = Number(value) || DEFAULT_PORT;
    if (key === "debug-port") args.debugPort = Number(value) || DEFAULT_DEBUG_PORT;
  }

  return args;
}

function httpGet(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        resolve({
          statusCode: res.statusCode || 0,
          body: data,
        });
      });
    }).on("error", reject);
  });
}

async function waitForHttpOk(url, timeoutMs) {
  const start = Date.now();
  let lastError = null;
  while ((Date.now() - start) < timeoutMs) {
    try {
      const res = await httpGet(url);
      if (res.statusCode >= 200 && res.statusCode < 500) {
        return res;
      }
      lastError = new Error(`Unexpected HTTP ${res.statusCode} from ${url}`);
    } catch (error) {
      lastError = error;
    }
    await wait(500);
  }
  throw lastError || new Error(`Timed out waiting for ${url}`);
}

function findBrowserExecutable() {
  const candidates = [
    process.env.ONEFIGHT_BROWSER,
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  ].filter(Boolean);

  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

function startViteServer(port) {
  const viteBin = path.resolve(process.cwd(), "node_modules", "vite", "bin", "vite.js");
  if (!fs.existsSync(viteBin)) {
    throw new Error("Vite is not installed. Run npm install first.");
  }

  const proc = spawn(process.execPath, [viteBin, "--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
    cwd: process.cwd(),
    stdio: ["ignore", "pipe", "pipe"],
  });

  proc.stdout.on("data", (chunk) => process.stdout.write(`[vite] ${chunk}`));
  proc.stderr.on("data", (chunk) => process.stderr.write(`[vite] ${chunk}`));

  return proc;
}

function startBrowser(executable, targetUrl, debugPort, headless) {
  const userDataDir = path.join(os.tmpdir(), `onefight-browser-${Date.now()}`);
  ensureDir(userDataDir);
  const args = [
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${userDataDir}`,
    "--disable-extensions",
    "--disable-background-networking",
    "--disable-sync",
    "--disable-popup-blocking",
    "--window-size=1600,900",
  ];
  if (headless) {
    args.push("--headless=new", "--disable-gpu");
  }
  args.push("about:blank");

  const proc = spawn(executable, args, {
    cwd: process.cwd(),
    stdio: "ignore",
  });

  proc.once("exit", () => {
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true });
    } catch {}
  });

  return { proc, userDataDir, targetUrl };
}

async function fetchJson(url) {
  const res = await httpGet(url);
  return JSON.parse(res.body);
}

class CdpClient {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.nextId = 0;
    this.pending = new Map();
    this.eventListeners = new Map();
  }

  async connect() {
    await new Promise((resolve, reject) => {
      this.ws.once("open", resolve);
      this.ws.once("error", reject);
    });

    this.ws.on("message", (raw) => {
      const msg = JSON.parse(raw);
      if (msg.id) {
        const pending = this.pending.get(msg.id);
        if (!pending) return;
        this.pending.delete(msg.id);
        if (msg.error) pending.reject(new Error(msg.error.message || "CDP error"));
        else pending.resolve(msg.result);
        return;
      }
      const handlers = this.eventListeners.get(msg.method);
      if (!handlers) return;
      for (const handler of handlers) {
        try {
          handler(msg.params || {});
        } catch (error) {
          console.warn(`[onefight] event handler failed for ${msg.method}:`, error);
        }
      }
    });
  }

  send(method, params = {}) {
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }), (error) => {
        if (error) {
          this.pending.delete(id);
          reject(error);
        }
      });
    });
  }

  on(method, handler) {
    const list = this.eventListeners.get(method) || [];
    list.push(handler);
    this.eventListeners.set(method, list);
  }

  async close() {
    try {
      await new Promise((resolve) => {
        this.ws.once("close", resolve);
        this.ws.close();
      });
    } catch {}
  }
}

async function connectToBrowser(debugPort, timeoutMs) {
  const start = Date.now();
  let lastError = null;
  while ((Date.now() - start) < timeoutMs) {
    try {
      const targets = await fetchJson(`http://127.0.0.1:${debugPort}/json/list`);
      const page = targets.find((entry) => entry.type === "page");
      if (page?.webSocketDebuggerUrl) {
        const client = new CdpClient(page.webSocketDebuggerUrl);
        await client.connect();
        return client;
      }
    } catch (error) {
      lastError = error;
    }
    await wait(500);
  }
  throw lastError || new Error("Timed out waiting for browser debug target.");
}

function buildEval(expression) {
  return `(async () => {
    try {
      const __value = (${expression});
      return await (typeof __value === "function" ? __value() : __value);
    } catch (error) {
      return { __evalError: String(error?.stack || error) };
    }
  })()`;
}

async function evaluate(client, expression) {
  const result = await client.send("Runtime.evaluate", {
    expression: buildEval(expression),
    awaitPromise: true,
    returnByValue: true,
  });
  const value = result?.result?.value;
  if (value && value.__evalError) {
    throw new Error(value.__evalError);
  }
  return value;
}

function keyParts(code) {
  if (/^Key[A-Z]$/.test(code)) {
    const char = code.slice(3).toLowerCase();
    return { key: char, code };
  }
  if (/^Digit\d$/.test(code)) {
    return { key: code.slice(5), code };
  }
  const map = {
    Space: { key: " ", code: "Space" },
    ShiftLeft: { key: "Shift", code: "ShiftLeft" },
    ShiftRight: { key: "Shift", code: "ShiftRight" },
    Backspace: { key: "Backspace", code: "Backspace" },
    Escape: { key: "Escape", code: "Escape" },
  };
  return map[code] || { key: code, code };
}

async function dispatchKey(client, type, code) {
  const { key } = keyParts(code);
  const expression = `() => {
    const payload = { key: ${JSON.stringify(key)}, code: ${JSON.stringify(code)}, bubbles: true, cancelable: true };
    const target = document.activeElement || document.body || window;
    target.dispatchEvent(new KeyboardEvent(${JSON.stringify(type)}, payload));
    window.dispatchEvent(new KeyboardEvent(${JSON.stringify(type)}, payload));
    return true;
  }`;
  return evaluate(client, expression);
}

async function holdKey(client, code, durationMs) {
  await dispatchKey(client, "keydown", code);
  await wait(durationMs);
  await dispatchKey(client, "keyup", code);
}

async function clickMouse(client, buttonName) {
  const button = buttonName === "right" ? 2 : 0;
  const buttons = buttonName === "right" ? 2 : 1;
  const expression = `() => {
    const canvas = document.getElementById("renderCanvas");
    if (!canvas) return false;
    const rect = canvas.getBoundingClientRect();
    const payload = {
      button: ${button},
      buttons: ${buttons},
      clientX: rect.left + (rect.width / 2),
      clientY: rect.top + (rect.height / 2),
      bubbles: true,
      cancelable: true,
      view: window,
    };
    canvas.focus();
    canvas.dispatchEvent(new MouseEvent("mousemove", payload));
    canvas.dispatchEvent(new MouseEvent("mousedown", payload));
    canvas.dispatchEvent(new MouseEvent("mouseup", payload));
    if (${button} === 2) {
      canvas.dispatchEvent(new MouseEvent("contextmenu", payload));
    }
    return true;
  }`;
  return evaluate(client, expression);
}

async function focusCanvas(client) {
  return evaluate(client, `() => {
    const canvas = document.getElementById("renderCanvas");
    canvas?.focus();
    return !!canvas;
  }`);
}

async function getAutotestStatus(client) {
  return evaluate(client, `() => window.__WS_AUTOTEST__ ?? null`);
}

async function sampleCanvas(client) {
  return evaluate(client, `() => {
    const canvas = document.getElementById("renderCanvas");
    if (!canvas) return null;
    const width = canvas.width || canvas.clientWidth || 0;
    const height = canvas.height || canvas.clientHeight || 0;
    const grid = 12;
    const sample = document.createElement("canvas");
    sample.width = grid;
    sample.height = grid;
    const ctx = sample.getContext("2d", { willReadFrequently: true });
    if (!ctx) return { width, height, unsupported: true };
    ctx.drawImage(canvas, 0, 0, grid, grid);
    const data = ctx.getImageData(0, 0, grid, grid).data;
    let totalLuma = 0;
    let totalVariance = 0;
    const bins = [];
    for (let i = 0; i < data.length; i += 4) {
      const luma = (0.2126 * data[i]) + (0.7152 * data[i + 1]) + (0.0722 * data[i + 2]);
      totalLuma += luma;
      bins.push(Math.round(luma));
    }
    const count = bins.length || 1;
    const avgLuma = totalLuma / count;
    for (const value of bins) {
      const diff = value - avgLuma;
      totalVariance += diff * diff;
    }
    return {
      width,
      height,
      avgLuma: +avgLuma.toFixed(2),
      variance: +(totalVariance / count).toFixed(2),
      hash: bins.slice(0, 48).join("-"),
    };
  }`);
}

async function captureScreenshot(client, outFile) {
  const result = await client.send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
  });
  fs.writeFileSync(outFile, Buffer.from(result.data, "base64"));
  return outFile;
}

async function waitForCondition(label, timeoutMs, pollFn) {
  const start = Date.now();
  let lastValue = null;
  while ((Date.now() - start) < timeoutMs) {
    lastValue = await pollFn();
    if (lastValue?.ok) {
      return lastValue;
    }
    await wait(250);
  }
  throw new Error(`${label} timed out. Last state: ${JSON.stringify(lastValue?.state || lastValue || null)}`);
}

function dist(a, b) {
  if (!a || !b) return 0;
  const dx = (a.x || 0) - (b.x || 0);
  const dy = (a.y || 0) - (b.y || 0);
  const dz = (a.z || 0) - (b.z || 0);
  return Math.sqrt((dx * dx) + (dy * dy) + (dz * dz));
}

function isAttackState(name) {
  if (!name) return false;
  const upper = String(name).toUpperCase();
  return ACTIVE_ATTACK_STATES.some((token) => upper.includes(token));
}

function isIdleState(name) {
  if (!name) return true;
  return IDLE_STATES.has(String(name).toUpperCase());
}

function hasVisibleCharacter(entity) {
  return !!entity && entity.rootEnabled !== false && (entity.visibleMeshCount || 0) > 0;
}

function summarizeCheckpoint(name, status, canvasStats, extra = {}) {
  return {
    name,
    ts: new Date().toISOString(),
    status,
    canvas: canvasStats,
    extra,
  };
}

async function captureCheckpoint(client, runDir, name, extra = {}) {
  const safeName = slug(name);
  const screenshotPath = path.join(runDir, `${safeName}.png`);
  const status = await getAutotestStatus(client);
  const canvasStats = await sampleCanvas(client);
  await captureScreenshot(client, screenshotPath);
  return {
    ...summarizeCheckpoint(name, status, canvasStats, extra),
    screenshotPath,
  };
}

function evaluateResults(checkpoints, consoleEntries, pageErrors) {
  const findings = [];
  const idle = checkpoints.find((entry) => entry.name === "idle-after-countdown");
  const move = checkpoints.find((entry) => entry.name === "movement-forward");
  const light = checkpoints.find((entry) => entry.name === "light-attack");
  const heavy = checkpoints.find((entry) => entry.name === "heavy-attack");
  const blast = checkpoints.find((entry) => entry.name === "blast-or-beam");
  const finale = checkpoints.find((entry) => entry.name === "end-of-sequence");
  const attackFrames = [light, heavy, blast].filter(Boolean);

  const idleState = idle?.status?.entities?.local;
  const opponentIdle = idle?.status?.entities?.opponent;
  if (!idle?.status) {
    findings.push({ severity: "fail", code: "NO_STATUS", message: "Automation status was not published by the game." });
  }
  if (idle?.status?.mainMenuVisible) {
    findings.push({ severity: "fail", code: "MENU_STUCK", message: "Main menu stayed visible instead of launching the match." });
  }
  if (idle?.status && !idle.status.loadingHidden) {
    findings.push({ severity: "fail", code: "LOADING_STUCK", message: "Loading overlay was still visible after the match should have started." });
  }
  if (!hasVisibleCharacter(idleState)) {
    findings.push({ severity: "fail", code: "LOCAL_INVISIBLE", message: "Local fighter was missing or invisible at gameplay start." });
  }
  if (!hasVisibleCharacter(opponentIdle)) {
    findings.push({ severity: "fail", code: "OPPONENT_INVISIBLE", message: "Opponent was missing or invisible at gameplay start." });
  }
  if (idle?.canvas && (idle.canvas.avgLuma < 5 || idle.canvas.variance < 2)) {
    findings.push({ severity: "fail", code: "BLACK_OR_EMPTY_FRAME", message: "Captured gameplay looked nearly empty or black." });
  }

  if (move?.status?.entities?.local && idleState) {
    const movementDistance = dist(move.status.entities.local.position, idleState.position);
    if (movementDistance < 0.75) {
      findings.push({ severity: "fail", code: "NO_MOVEMENT", message: `Local fighter barely moved during the movement checkpoint (${movementDistance.toFixed(2)} units).` });
    }
    if (movementDistance >= 0.75 && isIdleState(move.status.entities.local.animationState)) {
      findings.push({ severity: "warn", code: "MOVEMENT_IDLE_STATE", message: "Character moved, but the animation state still looked idle during locomotion." });
    }
  } else {
    findings.push({ severity: "fail", code: "MISSING_MOVEMENT_CHECKPOINT", message: "Movement checkpoint data was not captured." });
  }

  const sawAttackAnimation = attackFrames.some((frame) => {
    const entity = frame?.status?.entities?.local;
    return isAttackState(entity?.animationState) || entity?.isActionLocked;
  });
  if (!sawAttackAnimation) {
    findings.push({ severity: "warn", code: "ATTACK_STATE_NOT_OBSERVED", message: "No obvious non-idle attack state was observed during the scripted attacks." });
  }

  const attackHashes = attackFrames.map((frame) => frame?.canvas?.hash).filter(Boolean);
  if (attackHashes.length >= 2 && new Set(attackHashes).size === 1) {
    findings.push({ severity: "warn", code: "STATIC_ATTACK_FRAMES", message: "Attack screenshots looked nearly identical across multiple actions; animation may be static or needs manual review." });
  }

  if (finale?.status?.entities?.opponent && !hasVisibleCharacter(finale.status.entities.opponent)) {
    findings.push({ severity: "fail", code: "OPPONENT_LOST", message: "Opponent disappeared by the end of the smoke test." });
  }

  if (pageErrors.length > 0) {
    findings.push({ severity: "warn", code: "PAGE_ERRORS", message: `${pageErrors.length} runtime exception(s) were reported by the page.` });
  }
  const severeConsole = consoleEntries.filter((entry) => {
    if (entry.kind === "exception") return true;
    if (entry.kind === "network-failed" && entry.errorText !== "net::ERR_ABORTED") return true;
    return false;
  });
  if (severeConsole.length > 0) {
    findings.push({ severity: "warn", code: "RUNTIME_WARNINGS", message: `${severeConsole.length} console/network issue(s) were captured during the run.` });
  }

  const failed = findings.some((entry) => entry.severity === "fail");
  const warned = findings.some((entry) => entry.severity === "warn");

  return {
    verdict: failed ? "fail" : warned ? "manual-review" : "pass",
    findings,
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const browserExecutable = findBrowserExecutable();
  if (!browserExecutable) {
    throw new Error("No Edge/Chrome executable found. Set ONEFIGHT_BROWSER if needed.");
  }

  ensureDir(RESULTS_ROOT);
  const runName = `${nowStamp()}-${slug(args.character)}-vs-${slug(args.opponent)}`;
  const runDir = path.join(RESULTS_ROOT, runName);
  ensureDir(runDir);

  const consoleEntries = [];
  const pageErrors = [];
  const checkpoints = [];
  const targetUrl = `http://127.0.0.1:${args.port}/?autostart=onefight&character=${encodeURIComponent(args.character)}&opponent=${encodeURIComponent(args.opponent)}&zone=${encodeURIComponent(args.zone)}&autotest=1`;

  console.log(`[onefight] results: ${runDir}`);
  console.log(`[onefight] target:  ${targetUrl}`);

  const vite = startViteServer(args.port);
  let browser = null;
  let client = null;

  try {
    await waitForHttpOk(`http://127.0.0.1:${args.port}/`, VITE_READY_TIMEOUT_MS);
    browser = startBrowser(browserExecutable, targetUrl, args.debugPort, args.headless);
    client = await connectToBrowser(args.debugPort, 20000);

    client.on("Runtime.consoleAPICalled", (params) => {
      const values = (params.args || []).map((arg) => arg.value ?? arg.description ?? arg.type);
      const entry = {
        ts: new Date().toISOString(),
        kind: "console",
        level: params.type,
        values,
      };
      consoleEntries.push(entry);
      console.log(`[browser:${params.type}]`, ...values);
    });
    client.on("Runtime.exceptionThrown", (params) => {
      const details = params.exceptionDetails || {};
      const entry = {
        ts: new Date().toISOString(),
        kind: "exception",
        text: details.text || details.exception?.description || details.exception?.value || "Runtime exception",
      };
      consoleEntries.push(entry);
      pageErrors.push(entry);
      console.log(`[browser:exception] ${entry.text}`);
    });
    client.on("Network.loadingFailed", (params) => {
      const entry = {
        ts: new Date().toISOString(),
        kind: "network-failed",
        errorText: params.errorText,
        requestId: params.requestId,
        canceled: !!params.canceled,
      };
      consoleEntries.push(entry);
      console.log(`[browser:network-failed] ${params.errorText}`);
    });
    client.on("Log.entryAdded", (params) => {
      const entry = {
        ts: new Date().toISOString(),
        kind: "log",
        level: params.entry?.level,
        text: params.entry?.text,
      };
      consoleEntries.push(entry);
    });

    await client.send("Runtime.enable");
    await client.send("Page.enable");
    await client.send("Network.enable");
    await client.send("Log.enable");
    await client.send("Page.navigate", { url: targetUrl });

    await waitForCondition("page bootstrap", GAME_READY_TIMEOUT_MS, async () => {
      const status = await getAutotestStatus(client);
      return {
        ok: !!status?.started,
        state: status,
      };
    });

    await waitForCondition("active gameplay", GAME_READY_TIMEOUT_MS, async () => {
      const status = await getAutotestStatus(client);
      const local = status?.entities?.local;
      const opponent = status?.entities?.opponent;
      return {
        ok: !!status
          && status.started
          && status.scenarioId === "ONEFIGHT"
          && !status.mainMenuVisible
          && status.loadingHidden
          && !status.countdownActive
          && status.inputEnabled
          && hasVisibleCharacter(local)
          && hasVisibleCharacter(opponent),
        state: status,
      };
    });

    await focusCanvas(client);
    await wait(700);

    checkpoints.push(await captureCheckpoint(client, runDir, "idle-after-countdown"));

    await holdKey(client, "KeyW", 900);
    await wait(120);
    checkpoints.push(await captureCheckpoint(client, runDir, "movement-forward"));

    await holdKey(client, "KeyA", 450);
    await wait(100);
    checkpoints.push(await captureCheckpoint(client, runDir, "movement-strafe"));

    await clickMouse(client, "left");
    await wait(220);
    checkpoints.push(await captureCheckpoint(client, runDir, "light-attack"));

    await clickMouse(client, "right");
    await wait(260);
    checkpoints.push(await captureCheckpoint(client, runDir, "heavy-attack"));

    await dispatchKey(client, "keydown", "KeyQ");
    await wait(180);
    checkpoints.push(await captureCheckpoint(client, runDir, "blast-or-beam"));
    await dispatchKey(client, "keyup", "KeyQ");

    await holdKey(client, "KeyD", 300);
    await wait(150);
    await dispatchKey(client, "keydown", "KeyV");
    await wait(140);
    checkpoints.push(await captureCheckpoint(client, runDir, "rush-combo"));
    await dispatchKey(client, "keyup", "KeyV");

    await wait(600);
    checkpoints.push(await captureCheckpoint(client, runDir, "end-of-sequence"));

    const summary = evaluateResults(checkpoints, consoleEntries, pageErrors);
    const output = {
      generatedAt: new Date().toISOString(),
      launchUrl: targetUrl,
      browserExecutable,
      checkpoints,
      consoleEntries,
      pageErrors,
      summary,
    };
    const summaryPath = path.join(runDir, "result.json");
    fs.writeFileSync(summaryPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");

    console.log(`[onefight] verdict: ${summary.verdict}`);
    console.log(`[onefight] report:   ${summaryPath}`);
    if (summary.findings.length > 0) {
      for (const finding of summary.findings) {
        console.log(`[onefight] ${finding.severity.toUpperCase()} ${finding.code}: ${finding.message}`);
      }
    } else {
      console.log("[onefight] No issues detected by the smoke test.");
    }

    if (summary.verdict === "fail") {
      process.exitCode = 1;
    }
  } finally {
    if (client) {
      await client.close();
    }
    if (browser?.proc && !browser.proc.killed) {
      browser.proc.kill("SIGTERM");
    }
    if (vite && !vite.killed) {
      vite.kill("SIGTERM");
    }
  }
}

main().catch((error) => {
  console.error("[onefight]", error?.stack || error?.message || error);
  process.exitCode = 1;
});
