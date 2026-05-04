import * as vscode from "vscode";
import { CuratorInitTool } from "./tools/initTool";
import { CuratorListTool } from "./tools/listTool";
import { CuratorReadTool } from "./tools/readTool";
import { CuratorTransferTool } from "./tools/transferTool";

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.lm.registerTool("curator_init", new CuratorInitTool()),
    vscode.lm.registerTool("curator_list", new CuratorListTool()),
    vscode.lm.registerTool("curator_read", new CuratorReadTool()),
    vscode.lm.registerTool("curator_transfer", new CuratorTransferTool())
  );

  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBar.text = "$(database) Curator";
  statusBar.tooltip = "Curator MCP tools are active in Copilot";
  statusBar.command = "workbench.action.openSettings";
  statusBar.show();
  context.subscriptions.push(statusBar);

  console.log("Curator Copilot Tools: activated");
}

export function deactivate(): void {}
