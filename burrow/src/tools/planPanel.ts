import * as vscode from "vscode";
import { curatorList, curatorTransfer, curatorRead } from "../client/curatorClient";

// ─────────────────────────────────────────────────────────────
//  Types
// ─────────────────────────────────────────────────────────────

interface PlanFile {
  file: string;
  destination: string | null;
  ignore: boolean;
  reason?: string;
}

interface TransferPlan {
  destination_folder: string;
  ignore: boolean;
  reason?: string;
  files: PlanFile[];
}

type InboundMessage =
  | { type: "pickFile" }
  | { type: "save"; plan: TransferPlan }
  | { type: "preview"; plan: TransferPlan }
  | { type: "execute"; plan: TransferPlan }
  | { type: "readFile"; file: string };

// ─────────────────────────────────────────────────────────────
//  Panel
// ─────────────────────────────────────────────────────────────

export class CuratorPlanPanel {
  public static currentPanel: CuratorPlanPanel | undefined;
  private static readonly VIEW_TYPE = "curatorPlanEditor";

  private readonly _panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];
  private _currentFilePath: string | undefined;

  // ── singleton factory ──────────────────────────────────────

  public static createOrShow(extensionUri: vscode.Uri): void {
    const column =
      vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One;

    if (CuratorPlanPanel.currentPanel) {
      CuratorPlanPanel.currentPanel._panel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      CuratorPlanPanel.VIEW_TYPE,
      "Curator — Transfer Plan",
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(extensionUri, "media"),
        ],
      }
    );

    CuratorPlanPanel.currentPanel = new CuratorPlanPanel(panel);
  }

  // ── constructor ────────────────────────────────────────────

  private constructor(panel: vscode.WebviewPanel) {
    this._panel = panel;
    this._panel.iconPath = new vscode.ThemeIcon("database");
    this._panel.webview.html = buildWebviewHtml();

    this._panel.onDidDispose(
      () => this.dispose(),
      null,
      this._disposables
    );

    this._panel.webview.onDidReceiveMessage(
      (msg: InboundMessage) => this._handleMessage(msg),
      null,
      this._disposables
    );
  }

  // ── message router ─────────────────────────────────────────

  private async _handleMessage(msg: InboundMessage): Promise<void> {
    switch (msg.type) {
      case "pickFile":
        return this._pickFile();
      case "save":
        return this._saveFile(msg.plan);
      case "preview":
        return this._preview(msg.plan);
      case "execute":
        return this._execute(msg.plan);
      case "readFile":
        return this._readFile(msg.file);
    }
  }

  // ── file I/O ───────────────────────────────────────────────

  private async _pickFile(): Promise<void> {
    const uris = await vscode.window.showOpenDialog({
      canSelectMany: false,
      filters: { "JSON Plan": ["json"] },
      title: "Open Curator Transfer Plan",
    });

    if (!uris?.length) return;

    const uri = uris[0];
    this._currentFilePath = uri.fsPath;

    try {
      const bytes = await vscode.workspace.fs.readFile(uri);
      const plan: TransferPlan = JSON.parse(
        Buffer.from(bytes).toString("utf-8")
      );
      this._post({ type: "loaded", plan, filePath: uri.fsPath });
    } catch (e) {
      this._postError(`Failed to read file: ${(e as Error).message}`);
    }
  }

  private async _saveFile(plan: TransferPlan): Promise<void> {
    if (!this._currentFilePath) {
      this._postError("No file loaded — open a plan first.");
      return;
    }

    try {
      const uri = vscode.Uri.file(this._currentFilePath);
      const content = Buffer.from(JSON.stringify(plan, null, 2), "utf-8");
      await vscode.workspace.fs.writeFile(uri, content);
      this._post({ type: "saved" });
    } catch (e) {
      this._postError(`Save failed: ${(e as Error).message}`);
    }
  }

  // ── MCP calls ──────────────────────────────────────────────

  private async _preview(plan: TransferPlan): Promise<void> {
    this._post({ type: "loading", message: "Fetching file list from server…" });

    try {
      const includedFiles = plan.files
        .filter((f) => !f.ignore)
        .map((f) => ({ file: f.file }));

      const result = await curatorList(
        includedFiles.length ? includedFiles : undefined
      );

      this._post({ type: "previewResult", result, plan });
    } catch (e) {
      this._postError(`Preview failed: ${(e as Error).message}`);
    }
  }

  private async _execute(plan: TransferPlan): Promise<void> {
    this._post({ type: "loading", message: "Executing transfer…" });

    try {
      const includedFiles = plan.files
        .filter((f) => !f.ignore)
        .map((f) => ({
          file: f.file,
          ...(f.destination ? { destination: f.destination } : {}),
        }));

      const result = await curatorTransfer(
        plan.destination_folder,
        includedFiles
      );

      this._post({ type: "executeResult", result });
    } catch (e) {
      this._postError(`Transfer failed: ${(e as Error).message}`);
    }
  }

  private async _readFile(file: string): Promise<void> {
    try {
      const result = await curatorRead(file);
      this._post({ type: "fileContent", file, content: result });
    } catch (e) {
      this._postError(`Read failed: ${(e as Error).message}`);
    }
  }

  // ── helpers ────────────────────────────────────────────────

  private _post(message: Record<string, unknown>): void {
    this._panel.webview.postMessage(message);
  }

  private _postError(message: string): void {
    this._post({ type: "error", message });
  }

  public dispose(): void {
    CuratorPlanPanel.currentPanel = undefined;
    this._panel.dispose();
    this._disposables.forEach((d) => d.dispose());
    this._disposables = [];
  }
}

// ─────────────────────────────────────────────────────────────
//  Webview HTML
// ─────────────────────────────────────────────────────────────

function buildWebviewHtml(): string {
  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy"
  content="default-src 'none';
           style-src  'unsafe-inline' https://fonts.googleapis.com;
           font-src   https://fonts.gstatic.com;
           script-src 'unsafe-inline';">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&family=Syne:wght@600;800&display=swap" rel="stylesheet">
<title>Curator Transfer Plan</title>
<style>
/* ── reset & tokens ──────────────────────────────────────── */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --bg:        var(--vscode-editor-background, #0d0f11);
  --surface:   var(--vscode-sideBar-background, #151820);
  --surface2:  var(--vscode-editorWidget-background, #1c2130);
  --border:    var(--vscode-panel-border, #262d3f);
  --text:      var(--vscode-editor-foreground, #cdd5ef);
  --text-dim:  var(--vscode-descriptionForeground, #6b7a99);
  --accent:    var(--vscode-textLink-foreground, #4f7cff);
  --accent-bg: color-mix(in srgb, var(--accent) 12%, transparent);
  --green:     #3ddc84;
  --green-bg:  color-mix(in srgb, #3ddc84 12%, transparent);
  --red:       #ff5f57;
  --red-bg:    color-mix(in srgb, #ff5f57 10%, transparent);
  --yellow:    #ffcc00;
  --mono:      'JetBrains Mono', 'Fira Code', monospace;
  --sans:      'Syne', var(--vscode-font-family, sans-serif);
  --radius:    8px;
}

html, body { height: 100%; }
body {
  background: var(--bg);
  color: var(--text);
  font-family: var(--mono);
  font-size: 12px;
  line-height: 1.6;
  overflow-x: hidden;
}

/* ── layout ──────────────────────────────────────────────── */
.shell { display: flex; flex-direction: column; height: 100vh; }

/* ── top bar ─────────────────────────────────────────────── */
.topbar {
  display: flex; align-items: center; gap: 12px;
  padding: 10px 16px;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}
.topbar-brand {
  font-family: var(--sans); font-weight: 800; font-size: 15px;
  letter-spacing: -.3px;
  background: linear-gradient(120deg, var(--text) 40%, var(--accent));
  -webkit-background-clip: text; -webkit-text-fill-color: transparent;
  white-space: nowrap;
}
.topbar-file {
  flex: 1; font-size: 11px; color: var(--text-dim);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.topbar-actions { display: flex; gap: 8px; flex-shrink: 0; }

/* ── tab bar ─────────────────────────────────────────────── */
.tabbar {
  display: flex; gap: 0;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}
.tab {
  padding: 8px 18px; font-size: 11px; font-weight: 600;
  letter-spacing: .06em; text-transform: uppercase;
  color: var(--text-dim); cursor: pointer;
  border-bottom: 2px solid transparent;
  transition: color .15s, border-color .15s;
  display: flex; align-items: center; gap: 6px;
  user-select: none;
}
.tab:hover { color: var(--text); }
.tab.active { color: var(--accent); border-bottom-color: var(--accent); }
.tab .badge {
  background: var(--accent-bg); color: var(--accent);
  border-radius: 10px; padding: 1px 6px; font-size: 10px;
}

/* ── main content ────────────────────────────────────────── */
.content {
  flex: 1; overflow-y: auto; padding: 20px 18px 80px;
}
.view { display: none; }
.view.active { display: block; }

/* ── buttons ─────────────────────────────────────────────── */
.btn {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 6px 14px; border-radius: 5px;
  border: 1px solid var(--border);
  background: var(--surface2); color: var(--text-dim);
  font-family: var(--mono); font-size: 11px; font-weight: 600;
  cursor: pointer; transition: all .12s; white-space: nowrap;
  letter-spacing: .03em;
}
.btn:hover { border-color: var(--accent); color: var(--accent); background: var(--accent-bg); }
.btn.primary { background: var(--accent); color: #fff; border-color: var(--accent); }
.btn.primary:hover { filter: brightness(1.1); }
.btn.danger { background: var(--red-bg); color: var(--red); border-color: var(--red); }
.btn:disabled { opacity: .35; cursor: not-allowed; pointer-events: none; }
.btn svg { flex-shrink: 0; }

/* ── empty state ─────────────────────────────────────────── */
.empty {
  display: flex; flex-direction: column; align-items: center;
  justify-content: center; gap: 14px; padding: 80px 20px;
  text-align: center;
}
.empty-icon { font-size: 36px; }
.empty p { color: var(--text-dim); max-width: 300px; line-height: 1.8; }

/* ── toast ───────────────────────────────────────────────── */
#toast {
  position: fixed; top: 14px; right: 14px; z-index: 9999;
  padding: 9px 16px; border-radius: 6px; font-size: 11px; font-weight: 700;
  opacity: 0; transform: translateY(-6px) scale(.97);
  transition: all .2s ease; pointer-events: none;
}
#toast.show { opacity: 1; transform: none; }
#toast.ok   { background: var(--green); color: #000; }
#toast.err  { background: var(--red);   color: #fff; }
#toast.info { background: var(--accent); color: #fff; }

/* ── plan meta card ──────────────────────────────────────── */
.meta-card {
  background: var(--surface); border: 1px solid var(--border);
  border-radius: var(--radius); padding: 16px 18px; margin-bottom: 20px;
}
.meta-grid { display: grid; grid-template-columns: 120px 1fr; gap: 8px 14px; align-items: start; }
.ml { font-size: 10px; text-transform: uppercase; letter-spacing: .08em; color: var(--text-dim); padding-top: 3px; }
.mv { word-break: break-all; }
.mv.path { color: var(--accent); font-size: 11px; }

/* ── ignore toggle pill ──────────────────────────────────── */
.itoggle {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 4px 10px; border-radius: 20px; border: 1px solid;
  font-family: var(--mono); font-size: 11px; font-weight: 600;
  cursor: pointer; transition: all .15s; background: transparent;
}
.itoggle.included { border-color: var(--green); color: var(--green); background: var(--green-bg); }
.itoggle.ignored  { border-color: var(--red);   color: var(--red);   background: var(--red-bg); }
.itoggle .dot {
  width: 6px; height: 6px; border-radius: 50%; background: currentColor;
}

/* ── section head ────────────────────────────────────────── */
.section-head {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 12px;
}
.section-title {
  font-family: var(--sans); font-weight: 600; font-size: 11px;
  text-transform: uppercase; letter-spacing: .1em; color: var(--text-dim);
}
.section-stats { font-size: 11px; color: var(--text-dim); }

/* ── file cards ──────────────────────────────────────────── */
#file-list { display: flex; flex-direction: column; gap: 8px; }

.fcard {
  background: var(--surface); border: 1px solid var(--border);
  border-radius: var(--radius); overflow: hidden;
  transition: border-color .15s;
}
.fcard:hover { border-color: color-mix(in srgb, var(--accent) 30%, var(--border)); }
.fcard.ignored { opacity: .5; }

.fcard-head {
  display: flex; align-items: center; gap: 10px;
  padding: 11px 14px; cursor: pointer; user-select: none;
}
.fcard-icon { font-size: 13px; flex-shrink: 0; }
.fcard-path { flex: 1; font-size: 11px; overflow: hidden; }
.fcard-path .dir { color: var(--text-dim); }
.fcard-path .name { color: var(--text); }
.fcard-chevron { color: var(--text-dim); font-size: 9px; transition: transform .15s; flex-shrink: 0; }
.fcard.open .fcard-chevron { transform: rotate(180deg); }

.fcard-body {
  display: none; padding: 0 14px 14px;
  border-top: 1px solid var(--border);
}
.fcard.open .fcard-body { display: block; }

.detail-grid { display: grid; grid-template-columns: 100px 1fr; gap: 6px 12px; padding-top: 12px; }
.dl { font-size: 10px; text-transform: uppercase; letter-spacing: .07em; color: var(--text-dim); padding-top: 2px; }
.dv { font-size: 11px; word-break: break-all; }
.dv.null-val { color: var(--text-dim); font-style: italic; }
.dv.reason-text { line-height: 1.7; color: var(--text-dim); }
.dv.dest-path { color: var(--accent); }

/* ── preview view ────────────────────────────────────────── */
.server-file-list { display: flex; flex-direction: column; gap: 6px; }
.sfile {
  display: flex; align-items: center; gap: 10px;
  padding: 9px 14px; background: var(--surface);
  border: 1px solid var(--border); border-radius: 6px; font-size: 11px;
}
.sfile .sfile-name { flex: 1; }
.sfile .sfile-tag {
  font-size: 10px; padding: 2px 8px; border-radius: 10px; font-weight: 600;
  white-space: nowrap;
}
.tag-included { background: var(--green-bg); color: var(--green); border: 1px solid var(--green); }
.tag-ignored  { background: var(--red-bg);   color: var(--red);   border: 1px solid var(--red); }
.tag-unknown  { background: var(--accent-bg); color: var(--accent); border: 1px solid var(--accent); }

/* ── execute view ────────────────────────────────────────── */
.exec-log {
  background: var(--surface); border: 1px solid var(--border);
  border-radius: var(--radius); padding: 16px;
  font-size: 11px; line-height: 1.9; white-space: pre-wrap;
  word-break: break-all; min-height: 200px;
}
.exec-log .log-success { color: var(--green); }
.exec-log .log-error   { color: var(--red); }
.exec-log .log-info    { color: var(--accent); }
.exec-log .log-muted   { color: var(--text-dim); }

/* ── loading overlay ─────────────────────────────────────── */
.loading-bar {
  display: none; align-items: center; gap: 10px;
  padding: 12px 16px; margin-bottom: 16px;
  background: var(--accent-bg); border: 1px solid var(--accent);
  border-radius: var(--radius); font-size: 11px; color: var(--accent);
}
.loading-bar.show { display: flex; }
@keyframes spin { to { transform: rotate(360deg); } }
.spinner {
  width: 14px; height: 14px; border: 2px solid var(--accent);
  border-top-color: transparent; border-radius: 50%;
  animation: spin .7s linear infinite; flex-shrink: 0;
}

/* ── bottom action bar ───────────────────────────────────── */
.action-bar {
  position: fixed; bottom: 0; left: 0; right: 0;
  background: linear-gradient(to top, var(--bg) 60%, transparent);
  padding: 16px 18px 18px;
  display: flex; gap: 10px; justify-content: flex-end;
  z-index: 100;
}

/* ── scrollbar ───────────────────────────────────────────── */
::-webkit-scrollbar { width: 5px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
</style>
</head>
<body>
<div class="shell">

  <!-- top bar -->
  <div class="topbar">
    <span class="topbar-brand">curator</span>
    <span class="topbar-file" id="file-label">no plan loaded</span>
    <div class="topbar-actions">
      <button class="btn" id="btn-open">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
        </svg>
        Open Plan
      </button>
    </div>
  </div>

  <!-- tab bar -->
  <div class="tabbar">
    <div class="tab active" data-tab="plan">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
        <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
      </svg>
      Plan
    </div>
    <div class="tab" data-tab="preview" id="tab-preview">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
      Preview
      <span class="badge" id="preview-badge" style="display:none"></span>
    </div>
    <div class="tab" data-tab="execute" id="tab-execute">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
        <polygon points="5 3 19 12 5 21 5 3"/>
      </svg>
      Execute
    </div>
  </div>

  <!-- content -->
  <div class="content">

    <!-- ── PLAN VIEW ──────────────────────────────────── -->
    <div class="view active" id="view-plan">
      <div id="plan-empty" class="empty">
        <div class="empty-icon">📋</div>
        <p>Open a <strong>curator transfer plan</strong> JSON to start editing ignore flags.</p>
        <button class="btn primary" id="btn-open-empty">Open JSON</button>
      </div>

      <div id="plan-loaded" style="display:none">
        <!-- meta -->
        <div class="meta-card">
          <div class="meta-grid">
            <span class="ml">destination</span>
            <span class="mv path" id="meta-dest">—</span>

            <span class="ml">plan ignore</span>
            <span class="mv">
              <button class="itoggle" id="meta-ignore">
                <span class="dot"></span>
                <span id="meta-ignore-label">included</span>
              </button>
            </span>

            <span class="ml">reason</span>
            <span class="mv" id="meta-reason" style="color:var(--text-dim)">—</span>
          </div>
        </div>

        <!-- file list -->
        <div class="section-head">
          <span class="section-title">Files</span>
          <span class="section-stats" id="file-stats"></span>
        </div>
        <div id="file-list"></div>
      </div>
    </div>

    <!-- ── PREVIEW VIEW ───────────────────────────────── -->
    <div class="view" id="view-preview">
      <div class="loading-bar" id="preview-loading">
        <div class="spinner"></div>
        <span id="loading-msg">Fetching from server…</span>
      </div>
      <div id="preview-empty" class="empty">
        <div class="empty-icon">🔍</div>
        <p>Run a preview to see what the server knows about your plan's files.</p>
        <button class="btn primary" id="btn-preview-run">Fetch Preview</button>
      </div>
      <div id="preview-result" style="display:none">
        <div class="section-head" style="margin-bottom:14px">
          <span class="section-title">Server File List</span>
          <button class="btn" id="btn-preview-refresh">↻ Refresh</button>
        </div>
        <div class="server-file-list" id="server-list"></div>
      </div>
    </div>

    <!-- ── EXECUTE VIEW ───────────────────────────────── -->
    <div class="view" id="view-execute">
      <div class="loading-bar" id="execute-loading">
        <div class="spinner"></div>
        <span>Executing transfer…</span>
      </div>
      <div id="execute-idle" class="empty">
        <div class="empty-icon">⚡</div>
        <p>Execute the transfer for all <strong>included</strong> files in the plan.</p>
        <button class="btn danger" id="btn-exec-run">Run Transfer</button>
      </div>
      <div id="execute-result" style="display:none">
        <div class="section-head" style="margin-bottom:14px">
          <span class="section-title">Transfer Log</span>
          <button class="btn" id="btn-exec-again">↻ Run Again</button>
        </div>
        <div class="exec-log" id="exec-log"></div>
      </div>
    </div>

  </div><!-- /content -->

  <!-- action bar -->
  <div class="action-bar" id="action-bar" style="display:none">
    <div style="display:flex;gap:10px" id="plan-actions">
      <button class="btn" id="btn-ignore-all">Ignore All</button>
      <button class="btn" id="btn-include-all">Include All</button>
      <button class="btn" id="btn-save">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
          <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
          <polyline points="17 21 17 13 7 13 7 21"/>
          <polyline points="7 3 7 8 15 8"/>
        </svg>
        Save
      </button>
      <button class="btn primary" id="btn-go-preview">Preview →</button>
    </div>
    <div style="display:flex;gap:10px;display:none" id="preview-actions">
      <button class="btn primary" id="btn-go-execute">Execute →</button>
    </div>
  </div>

</div><!-- /shell -->

<div id="toast"></div>

<script>
// ── VS Code API ──────────────────────────────────────────────
const vscode = acquireVsCodeApi();

// ── state ────────────────────────────────────────────────────
let plan = null;
let currentTab = 'plan';

// ── helpers ──────────────────────────────────────────────────
const $ = id => document.getElementById(id);

function post(msg)  { vscode.postMessage(msg); }
function esc(s)     { return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function toast(msg, type = 'ok') {
  const t = $('toast');
  t.textContent = msg;
  t.className = 'show ' + type;
  clearTimeout(t._tid);
  t._tid = setTimeout(() => { t.className = ''; }, 2600);
}

function loading(id, show, msg) {
  const el = $(id);
  el.classList.toggle('show', show);
  if (msg) { const span = el.querySelector('span'); if (span) span.textContent = msg; }
}

// ── tabs ─────────────────────────────────────────────────────
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => switchTab(tab.dataset.tab));
});

function switchTab(name) {
  currentTab = name;
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + name));

  $('plan-actions').style.display    = (name === 'plan'    && plan) ? 'flex' : 'none';
  $('preview-actions').style.display = (name === 'preview' && plan) ? 'flex' : 'none';
  $('action-bar').style.display = (name !== 'execute' && plan) ? 'flex' : 'none';
}

// ── open file ────────────────────────────────────────────────
['btn-open', 'btn-open-empty'].forEach(id => {
  $(id)?.addEventListener('click', () => post({ type: 'pickFile' }));
});

// ── save ─────────────────────────────────────────────────────
$('btn-save').addEventListener('click', () => {
  if (!plan) return;
  post({ type: 'save', plan });
});

// ── bulk toggles ─────────────────────────────────────────────
$('btn-ignore-all').addEventListener('click', () => {
  if (!plan) return;
  plan.files.forEach(f => f.ignore = true);
  renderFiles(); updateStats(); toast('All ignored', 'err');
});
$('btn-include-all').addEventListener('click', () => {
  if (!plan) return;
  plan.files.forEach(f => f.ignore = false);
  renderFiles(); updateStats(); toast('All included', 'ok');
});

// ── navigate to preview / execute ────────────────────────────
$('btn-go-preview').addEventListener('click', () => {
  switchTab('preview');
  if (plan) runPreview();
});
$('btn-go-execute').addEventListener('click', () => switchTab('execute'));
$('btn-preview-run').addEventListener('click', runPreview);
$('btn-preview-refresh').addEventListener('click', runPreview);
$('btn-exec-run').addEventListener('click', runExecute);
$('btn-exec-again').addEventListener('click', runExecute);

function runPreview() {
  if (!plan) { toast('Load a plan first', 'err'); return; }
  loading('preview-loading', true);
  $('preview-empty').style.display = 'none';
  $('preview-result').style.display = 'none';
  post({ type: 'preview', plan });
}

function runExecute() {
  if (!plan) { toast('Load a plan first', 'err'); return; }
  loading('execute-loading', true);
  $('execute-idle').style.display = 'none';
  $('execute-result').style.display = 'none';
  post({ type: 'execute', plan });
}

// ── top-level ignore ─────────────────────────────────────────
$('meta-ignore').addEventListener('click', () => {
  if (!plan) return;
  plan.ignore = !plan.ignore;
  renderMetaIgnore();
});
function renderMetaIgnore() {
  const ignored = plan.ignore;
  $('meta-ignore').className = 'itoggle ' + (ignored ? 'ignored' : 'included');
  $('meta-ignore-label').textContent = ignored ? 'ignored' : 'included';
}

// ── render plan ──────────────────────────────────────────────
function renderPlan() {
  if (!plan) return;
  $('plan-empty').style.display = 'none';
  $('plan-loaded').style.display = 'block';
  $('action-bar').style.display = 'flex';
  $('plan-actions').style.display = 'flex';

  $('meta-dest').textContent   = plan.destination_folder || '—';
  $('meta-reason').textContent = plan.reason || '—';
  renderMetaIgnore();
  renderFiles();
  updateStats();
}

function renderFiles() {
  const list = $('file-list');
  list.innerHTML = '';
  plan.files.forEach((f, i) => list.appendChild(makeCard(f, i)));
}

function updateStats() {
  const total    = plan.files.length;
  const ignored  = plan.files.filter(f => f.ignore).length;
  const included = total - ignored;
  $('file-stats').textContent = included + ' included · ' + ignored + ' ignored';
  $('preview-badge').textContent = included;
  $('preview-badge').style.display = 'inline';
}

function makeCard(f, i) {
  const card = document.createElement('div');
  card.className = 'fcard' + (f.ignore ? ' ignored' : '');

  const parts = f.file.split('/');
  const name  = parts.pop();
  const dir   = parts.join('/') + (parts.length ? '/' : '');

  card.innerHTML = \`
    <div class="fcard-head">
      <span class="fcard-icon">\${f.ignore ? '🚫' : '📄'}</span>
      <span class="fcard-path">
        <span class="dir">\${esc(dir)}</span><span class="name">\${esc(name)}</span>
      </span>
      <button class="itoggle \${f.ignore ? 'ignored' : 'included'}" data-idx="\${i}">
        <span class="dot"></span>
        <span>\${f.ignore ? 'ignored' : 'included'}</span>
      </button>
      <span class="fcard-chevron">▼</span>
    </div>
    <div class="fcard-body">
      <div class="detail-grid">
        <span class="dl">source</span>
        <span class="dv">\${esc(f.file)}</span>

        <span class="dl">destination</span>
        \${f.destination
          ? \`<span class="dv dest-path">\${esc(f.destination)}</span>\`
          : \`<span class="dv null-val">null — not copied</span>\`
        }

        <span class="dl">reason</span>
        <span class="dv reason-text">\${esc(f.reason || '—')}</span>
      </div>
    </div>
  \`;

  // toggle ignore
  card.querySelector('.itoggle').addEventListener('click', e => {
    e.stopPropagation();
    plan.files[i].ignore = !plan.files[i].ignore;
    const f2 = plan.files[i];
    const btn = card.querySelector('.itoggle');
    btn.className = 'itoggle ' + (f2.ignore ? 'ignored' : 'included');
    btn.querySelector('span:last-child').textContent = f2.ignore ? 'ignored' : 'included';
    card.querySelector('.fcard-icon').textContent = f2.ignore ? '🚫' : '📄';
    card.className = 'fcard' + (card.classList.contains('open') ? ' open' : '') + (f2.ignore ? ' ignored' : '');
    updateStats();
  });

  // expand / collapse
  card.querySelector('.fcard-head').addEventListener('click', () => {
    card.classList.toggle('open');
  });

  return card;
}

// ── render preview ───────────────────────────────────────────
function renderPreview(result) {
  loading('preview-loading', false);
  $('preview-empty').style.display   = 'none';
  $('preview-result').style.display  = 'block';
  $('preview-actions').style.display = 'flex';
  $('action-bar').style.display = 'flex';

  const list = $('server-list');
  list.innerHTML = '';

  // result from curatorList — normalise to array of file names
  let files = [];
  try {
    const raw = typeof result === 'string' ? JSON.parse(result) : result;
    const content = raw?.content ?? raw;
    if (Array.isArray(content)) {
      const text = content.find(c => c.type === 'text')?.text;
      if (text) {
        const parsed = JSON.parse(text);
        files = parsed?.files ?? parsed ?? [];
      }
    } else if (content?.files) {
      files = content.files;
    }
  } catch { files = []; }

  const planFileNames = new Set(plan.files.map(f => f.file));
  const ignoredFiles  = new Set(plan.files.filter(f => f.ignore).map(f => f.file));

  if (!files.length) {
    list.innerHTML = '<div style="color:var(--text-dim);font-size:11px;padding:12px">No files returned from server.</div>';
    return;
  }

  files.forEach(fileObj => {
    const name = typeof fileObj === 'string' ? fileObj : (fileObj?.file ?? JSON.stringify(fileObj));
    const inPlan   = planFileNames.has(name);
    const isIgnored = ignoredFiles.has(name);

    let tagClass, tagLabel;
    if (!inPlan)      { tagClass = 'tag-unknown';  tagLabel = 'not in plan'; }
    else if (isIgnored) { tagClass = 'tag-ignored'; tagLabel = 'ignored'; }
    else                { tagClass = 'tag-included'; tagLabel = 'included'; }

    const el = document.createElement('div');
    el.className = 'sfile';
    el.innerHTML = \`
      <span class="fcard-icon">\${isIgnored ? '🚫' : '📄'}</span>
      <span class="sfile-name">\${esc(name)}</span>
      <span class="sfile-tag \${tagClass}">\${tagLabel}</span>
    \`;
    list.appendChild(el);
  });
}

// ── render execute ───────────────────────────────────────────
function renderExecute(result) {
  loading('execute-loading', false);
  $('execute-idle').style.display   = 'none';
  $('execute-result').style.display = 'block';

  const log = $('exec-log');
  let output = '';
  try {
    const raw = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
    const parsed = JSON.parse(raw);
    const content = parsed?.content ?? parsed;
    if (Array.isArray(content)) {
      const text = content.find(c => c.type === 'text')?.text;
      output = text ?? JSON.stringify(content, null, 2);
    } else {
      output = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
    }
  } catch {
    output = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
  }

  // colour the log lines
  log.innerHTML = output.split('\\n').map(line => {
    if (/error|fail|✗/i.test(line))   return \`<span class="log-error">\${esc(line)}</span>\`;
    if (/success|ok|✓|done/i.test(line)) return \`<span class="log-success">\${esc(line)}</span>\`;
    if (/\\[info\\]|transferring|copying/i.test(line)) return \`<span class="log-info">\${esc(line)}</span>\`;
    return \`<span class="log-muted">\${esc(line)}</span>\`;
  }).join('\\n');
}

// ── host messages ────────────────────────────────────────────
window.addEventListener('message', ({ data }) => {
  switch (data.type) {

    case 'loaded':
      plan = data.plan;
      $('file-label').textContent = data.filePath;
      renderPlan();
      toast('Plan loaded', 'ok');
      break;

    case 'saved':
      toast('Saved ✓', 'ok');
      break;

    case 'loading':
      loading('preview-loading', true, data.message);
      loading('execute-loading', true);
      break;

    case 'previewResult':
      renderPreview(data.result);
      switchTab('preview');
      break;

    case 'executeResult':
      renderExecute(data.result);
      break;

    case 'fileContent':
      toast('File read: ' + data.file, 'info');
      break;

    case 'error':
      loading('preview-loading', false);
      loading('execute-loading', false);
      toast(data.message, 'err');
      break;
  }
});
</script>
</body>
</html>`;
}