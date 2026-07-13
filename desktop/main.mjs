import {randomBytes} from "node:crypto";
import {mkdir} from "node:fs/promises";
import path from "node:path";
import {app, BrowserWindow, dialog, session, shell} from "electron";
import {defaultDataDir, loadConfig} from "../lib/config.mjs";
import {isAllowedExternalUrl, isSameOriginUrl} from "../lib/url-policy.mjs";
import {startMarketingServer} from "../server.mjs";

const WINDOW_OPTIONS = {
  width: 1440,
  height: 920,
  minWidth: 1080,
  minHeight: 720,
  backgroundColor: "#f4f5f1",
  show: false,
  title: "Marketing Research Companion",
  webPreferences: {
    contextIsolation: true,
    sandbox: true,
    nodeIntegration: false,
    webSecurity: true,
    allowRunningInsecureContent: false,
    spellcheck: true,
    partition: "persist:marketing-research-companion"
  }
};
const SMOKE_MODE = process.env.MARKETING_DESKTOP_SMOKE === "1";

if (!app.commandLine.hasSwitch("user-data-dir")) app.setPath("userData", defaultDataDir());

let mainWindow = null;
let productServer = null;
let productOrigin = null;
let quitting = false;
const securedWindows = new WeakSet();

function focusMainWindow() {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function secureWindow(window) {
  if (securedWindows.has(window)) return;
  securedWindows.add(window);
  const contents = window.webContents;
  contents.setWindowOpenHandler(({url}) => {
    if (productOrigin && isSameOriginUrl(url, productOrigin)) {
      return {action: "allow", overrideBrowserWindowOptions: {...WINDOW_OPTIONS, parent: window, width: 1260, height: 900, show: true}};
    }
    if (isAllowedExternalUrl(url)) void shell.openExternal(url);
    return {action: "deny"};
  });
  contents.on("will-navigate", (event, url) => {
    if (productOrigin && isSameOriginUrl(url, productOrigin)) return;
    event.preventDefault();
    if (isAllowedExternalUrl(url)) void shell.openExternal(url);
  });
  contents.on("will-attach-webview", (event) => event.preventDefault());
}

async function startProduct() {
  const rootDir = app.getAppPath();
  const dataDir = app.getPath("userData");
  const workDir = path.join(dataDir, "workspace");
  await mkdir(workDir, {recursive: true, mode: 0o700});
  const config = loadConfig({
    rootDir,
    env: {
      ...process.env,
      MARKETING_DISTRIBUTION: "desktop",
      DATA_DIR: dataDir,
      WORK_DIR: workDir,
      HOST: "127.0.0.1",
      PORT: process.env.PORT || "8787"
    }
  });
  const desktopSessionToken = randomBytes(32).toString("base64url");
  const started = await startMarketingServer({config, desktopSessionToken, managedService: false});
  productServer = started;
  productOrigin = `http://${started.config.host}:${started.config.port}`;

  const productSession = session.fromPartition("persist:marketing-research-companion");
  const canWriteClipboard = (contents, permission) => Boolean(contents) && permission === "clipboard-sanitized-write"
    && isSameOriginUrl(contents.getURL(), productOrigin);
  productSession.setPermissionRequestHandler((contents, permission, callback) => callback(canWriteClipboard(contents, permission)));
  productSession.setPermissionCheckHandler((contents, permission) => canWriteClipboard(contents, permission));
  productSession.on("will-download", (event, item) => {
    if (!item.getURL().startsWith(`blob:${productOrigin}/`) || item.getMimeType() !== "application/json") event.preventDefault();
  });
  productSession.webRequest.onBeforeSendHeaders({urls: [`${productOrigin}/*`]}, (details, callback) => {
    callback({requestHeaders: {...details.requestHeaders, "X-Marketing-Desktop-Session": desktopSessionToken}});
  });
  productSession.webRequest.onBeforeRequest({urls: ["<all_urls>"]}, (details, callback) => {
    const allowed = details.url.startsWith(productOrigin + "/")
      || details.url === productOrigin + "/"
      || details.url.startsWith(`blob:${productOrigin}/`);
    callback({cancel: !allowed});
  });
}

function createMainWindow() {
  mainWindow = new BrowserWindow(WINDOW_OPTIONS);
  secureWindow(mainWindow);
  mainWindow.once("ready-to-show", () => { if (!SMOKE_MODE) mainWindow?.show(); });
  mainWindow.on("closed", () => { mainWindow = null; });
  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    if (!quitting && details.reason !== "clean-exit") mainWindow?.reload();
  });
  if (SMOKE_MODE) mainWindow.webContents.once("did-finish-load", async () => {
    try {
      const result = await mainWindow.webContents.executeJavaScript(`(async () => {
        const request = {
          product: "24~47개월 어린이집 낮잠용 토들러 베개",
          stage: "토들러 24~47개월",
          taskId: "voc",
          taskLabel: "VOC 기반 상품 개발",
          decision: "샘플 제작 여부",
          context: "데스크톱 설치물 스모크 테스트",
          evidence: ["고객 VOC", "경쟁 제품"],
          vocText: "세탁이 편해요\\n높이가 조금 높아요",
          sourceUrls: [],
          depth: "quick",
          chartPlan: [{evidenceId: "voc", evidenceLabel: "고객 VOC", chartType: "bar", chartLabel: "막대 차트"}]
        };
        const config = await fetch("/api/config").then((response) => response.json());
        const createdResponse = await fetch("/api/research", {method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify(request)});
        if (!createdResponse.ok) throw new Error("research " + createdResponse.status);
        const created = await createdResponse.json();
        let job = created.job;
        for (let attempt = 0; attempt < 100; attempt += 1) {
          await new Promise((resolve) => setTimeout(resolve, 50));
          job = await fetch("/api/jobs/" + created.job.id).then((response) => response.json()).then((payload) => payload.job);
          if (["completed", "completed_with_warnings", "failed"].includes(job.status)) break;
        }
        if (!["completed", "completed_with_warnings"].includes(job.status)) throw new Error("job " + job.status);
        const report = await fetch(job.reportUrl).then((response) => response.text());
        const marker = {id: "desktop-smoke", title: "설치물 저장 검증"};
        await fetch("/api/ui-state", {method: "PUT", headers: {"content-type": "application/json"}, body: JSON.stringify({orders: [marker], chartPreferences: {voc: "bar"}})});
        const state = await fetch("/api/ui-state").then((response) => response.json());
        return {
          title: document.title,
          hasWorkForm: Boolean(document.querySelector("#workForm")),
          rendererProcess: typeof window.process,
          rendererRequire: typeof window.require,
          distribution: config.distribution,
          selfUpdate: config.capabilities.selfUpdate,
          jobStatus: job.status,
          reportReopened: report.includes("대표 보고"),
          statePersisted: state.orders.some((item) => item.id === marker.id),
          documentHeight: document.documentElement.scrollHeight
        };
      })()`, true);
      console.log("DESKTOP_SMOKE_RESULT=" + JSON.stringify(result));
      await closeProduct();
      app.exit(0);
    } catch (error) {
      console.error("DESKTOP_SMOKE_ERROR=" + (error?.stack || error?.message || String(error)));
      await closeProduct();
      app.exit(1);
    }
  });
  void mainWindow.loadURL(productOrigin + "/");
}

async function closeProduct() {
  if (!productServer) return;
  const current = productServer;
  productServer = null;
  await current.shutdown();
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", focusMainWindow);
  app.whenReady().then(async () => {
    try {
      await startProduct();
      createMainWindow();
    } catch (error) {
      dialog.showErrorBox("Marketing Research Companion을 시작할 수 없습니다", error?.message || String(error));
      app.quit();
    }
  });
}

app.on("activate", () => {
  if (!mainWindow && productOrigin) createMainWindow();
});

app.on("browser-window-created", (_event, window) => secureWindow(window));

app.on("window-all-closed", () => app.quit());

app.on("before-quit", (event) => {
  if (quitting || !productServer) return;
  event.preventDefault();
  quitting = true;
  void closeProduct().finally(() => app.quit());
});
