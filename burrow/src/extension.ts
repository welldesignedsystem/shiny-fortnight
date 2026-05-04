import * as vscode from "vscode";
import { CuratorInitTool } from "./tools/initTool";
import { CuratorListTool } from "./tools/listTool";
import { CuratorReadTool } from "./tools/readTool";
import { CuratorTransferTool } from "./tools/transferTool";
import { CuratorPlanPanel } from "./tools/planPanel";
 
export function activate(context: vscode.ExtensionContext): void {
  // ── MCP tools ──────────────────────────────────────────────
  context.subscriptions.push(
    vscode.lm.registerTool("curator_init", new CuratorInitTool()),
    vscode.lm.registerTool("curator_list", new CuratorListTool()),
    vscode.lm.registerTool("curator_read", new CuratorReadTool()),
    vscode.lm.registerTool("curator_transfer", new CuratorTransferTool())
  );
 
  // ── transfer plan panel command ────────────────────────────
  const openPanelCommand = vscode.commands.registerCommand(
    "curator.openTransferPlan",
    () => CuratorPlanPanel.createOrShow(context.extensionUri)
  );
  context.subscriptions.push(openPanelCommand);
 
  // ── status bar ─────────────────────────────────────────────
  const statusBar = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  statusBar.text = "$(database) Curator";
  statusBar.tooltip = "Open Curator Transfer Plan editor";
  statusBar.command = "curator.openTransferPlan"; // was: workbench.action.openSettings
  statusBar.show();
  context.subscriptions.push(statusBar);
 
  console.log("Curator Copilot Tools: activated");
}
 
export function deactivate(): void {}
 