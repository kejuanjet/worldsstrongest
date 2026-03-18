const http = require("http");
const { spawn } = require("child_process");
const WebSocket = require("ws");
const fs = require("fs");
const os = require("os");
const path = require("path");

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch (error) {
          reject(error);
        }
      });
    }).on("error", reject);
  });
}

async function main() {
  const edgePath = [
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  ].find((candidate) => fs.existsSync(candidate));

  if (!edgePath) {
    throw new Error("No Edge/Chrome executable found.");
  }

  const userDataDir = path.join(os.tmpdir(), `ws-edge-debug-${Date.now()}`);
  fs.mkdirSync(userDataDir, { recursive: true });

  const targetUrl = process.argv[2] || "http://127.0.0.1:5173";

  const browser = spawn(edgePath, [
    "--headless=new",
    "--disable-gpu",
    "--disable-extensions",
    "--remote-debugging-port=9222",
    `--user-data-dir=${userDataDir}`,
    targetUrl,
  ], {
    stdio: "ignore",
    detached: false,
  });

  try {
    await wait(2500);
    const targets = await getJson("http://127.0.0.1:9222/json/list");
    const target = targets.find((entry) => entry.type === "page" && entry.url.startsWith(targetUrl));
    if (!target?.webSocketDebuggerUrl) {
      throw new Error("Could not find debuggable page target.");
    }
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    let id = 0;

    const send = (method, params = {}) => {
      ws.send(JSON.stringify({ id: ++id, method, params }));
    };

    ws.on("message", (raw) => {
      const msg = JSON.parse(raw);
      if (msg.method === "Runtime.consoleAPICalled") {
        const vals = (msg.params.args || []).map((arg) => arg.value ?? arg.description ?? arg.type);
        console.log("[console]", msg.params.type, ...vals);
      }
      if (msg.method === "Runtime.exceptionThrown") {
        const details = msg.params.exceptionDetails;
        console.log("[exception]", details.text || "", details.exception?.description || details.exception?.value || "");
        for (const frame of details.stackTrace?.callFrames?.slice(0, 10) ?? []) {
          console.log("  at", frame.functionName || "<anonymous>", frame.url, frame.lineNumber + 1, frame.columnNumber + 1);
        }
      }
      if (msg.method === "Log.entryAdded") {
        const entry = msg.params.entry;
        console.log("[log]", entry.level, entry.text, entry.url || "", entry.lineNumber || "");
      }
      if (msg.method === "Network.loadingFailed") {
        console.log("[network-failed]", msg.params.errorText, msg.params.canceled ? "canceled" : "", msg.params.type || "", msg.params.requestId);
      }
      if (msg.method === "Network.responseReceived" && msg.params.response.status >= 400) {
        console.log("[network-response]", msg.params.response.status, msg.params.response.url);
      }
      if (msg.id && msg.result?.result) {
        const value = Object.prototype.hasOwnProperty.call(msg.result.result, "value")
          ? msg.result.result.value
          : msg.result.result.description ?? msg.result.result.type;
        console.log("[eval]", JSON.stringify(value, null, 2));
      }
    });

    await new Promise((resolve) => {
      ws.on("open", resolve);
    });

    send("Runtime.enable");
    send("Page.enable");
    send("Log.enable");
    send("Network.enable");
    send("Page.navigate", { url: targetUrl });

    await wait(20000);
    send("Runtime.evaluate", {
      expression: `(() => ({
        href: location.href,
        loadingText: document.querySelector('.loading-text')?.textContent ?? null,
        loadingHidden: document.getElementById('loadingScreen')?.className ?? null,
        hasMainMenu: !!document.getElementById('mainMenu'),
        body: document.body.innerHTML.slice(0, 2000)
      }))()`,
      returnByValue: true,
    });
    await wait(1000);
    ws.close();
  } finally {
    browser.kill("SIGTERM");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
