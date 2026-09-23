const { app, BrowserWindow, Menu, shell } = require("electron");
const path = require("path");
const fs = require("fs");

// The app URL lives in a small config.json inside the user's data folder,
// NOT inside the packaged app — so changing the URL later (e.g. switching
// from the vercel.app address to a custom domain) is just editing one file,
// no rebuild/reinstall needed.
//
// On first run we seed that file from the config.json bundled with the app.
const userConfigPath = path.join(app.getPath("userData"), "config.json");
const bundledConfigPath = path.join(__dirname, "config.json");

function loadAppUrl() {
  try {
    if (!fs.existsSync(userConfigPath)) {
      fs.mkdirSync(path.dirname(userConfigPath), { recursive: true });
      fs.copyFileSync(bundledConfigPath, userConfigPath);
    }
    const raw = fs.readFileSync(userConfigPath, "utf-8");
    const parsed = JSON.parse(raw);
    if (parsed.appUrl && typeof parsed.appUrl === "string") {
      return parsed.appUrl;
    }
  } catch (err) {
    console.error("Failed to read config.json, falling back to bundled default:", err);
  }
  // Fallback: read straight from the bundled default.
  const bundled = JSON.parse(fs.readFileSync(bundledConfigPath, "utf-8"));
  return bundled.appUrl;
}

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    title: "Magen CMS",
    backgroundColor: "#0b1f3a",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const appUrl = loadAppUrl();
  mainWindow.loadURL(appUrl);

  // Open any target="_blank" links (or window.open calls) in the user's
  // normal browser instead of inside the app window.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  // Keep external navigation (anything not on the CMS domain) in the
  // system browser too, so the desktop app stays focused on the CMS.
  mainWindow.webContents.on("will-navigate", (event, url) => {
    const target = new URL(url);
    const current = new URL(appUrl);
    if (target.origin !== current.origin) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// Minimal menu: just the essentials (reload, dev tools, quit) — no default
// Electron menu clutter for end users.
function buildMenu() {
  const template = [
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Window",
      submenu: [{ role: "minimize" }, { role: "close" }],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(() => {
  buildMenu();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
