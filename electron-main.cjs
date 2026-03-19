// Ensure Electron runs as Electron, not Node.js
delete process.env.ELECTRON_RUN_AS_NODE;

const { app, BrowserWindow, shell } = require("electron");
const { spawn } = require("child_process");

// Parse command line arguments
const args = process.argv.slice(2);
let VITE_URL = process.env.GAME_URL || "http://localhost:5173/";
let PORT = 5173;

args.forEach(arg => {
  if (arg.startsWith('--vite-url=')) {
    VITE_URL = arg.replace('--vite-url=', '');
  }
  if (arg.startsWith('--port=')) {
    PORT = parseInt(arg.replace('--port=', ''), 10);
  }
});

let viteProcess = null;
let mainWindow = null;

// Start Vite dev server
function startViteServer() {
  return new Promise((resolve, reject) => {
    console.log(`[*] Starting Vite server on port ${PORT}...`);
    
    viteProcess = spawn('node', ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', PORT.toString()], {
      cwd: process.cwd(),
      stdio: 'pipe',
      shell: true
    });

    viteProcess.stdout.on('data', (data) => {
      const str = data.toString();
      console.log('[vite]', str.trim());
      
      // Check if Vite is ready
      if (str.includes('Local:') || str.includes('ready')) {
        setTimeout(() => resolve(), 1000);
      }
    });

    viteProcess.stderr.on('data', (data) => {
      const str = data.toString();
      console.error('[vite]', str.trim());
    });

    viteProcess.on('error', (err) => {
      console.error('[!] Failed to start Vite:', err);
      reject(err);
    });

    viteProcess.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        console.log(`[!] Vite exited with code ${code}`);
        reject(new Error(`Vite exited with code ${code}`));
      }
    });

    // Fallback: resolve after timeout if Vite doesn't signal ready
    setTimeout(() => {
      if (!mainWindow) {
        console.log('[*] Vite should be ready (timeout)');
        resolve();
      }
    }, 5000);
  });
}

function createWindow() {
  console.log(`[*] Creating window with URL: ${VITE_URL}`);
  
  const win = new BrowserWindow({
    width: 1600,
    height: 960,
    minWidth: 1280,
    minHeight: 720,
    autoHideMenuBar: true,
    backgroundColor: "#05070c",
    webPreferences: {
      contextIsolation: true,
      sandbox: false,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  win.loadURL(VITE_URL);
  
  // Open DevTools in development
  // win.webContents.openDevTools();
  
  return win;
}

// App event handlers
app.commandLine.appendSwitch("disable-renderer-backgrounding");

app.whenReady().then(async () => {
  try {
    await startViteServer();
    mainWindow = createWindow();
    
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        mainWindow = createWindow();
      }
    });
  } catch (err) {
    console.error('[!] Failed to start:', err);
    app.quit();
  }
});

app.on("window-all-closed", () => {
  if (viteProcess) {
    console.log('[*] Stopping Vite server...');
    viteProcess.kill();
  }
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (viteProcess) {
    viteProcess.kill();
  }
});
