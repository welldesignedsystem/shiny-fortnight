import * as vscode from "vscode";

export function jsonResult(data: unknown): vscode.LanguageModelToolResult {
  return new vscode.LanguageModelToolResult([
    new vscode.LanguageModelTextPart(JSON.stringify(data, null, 2)),
  ]);
}

export function errorResult(err: unknown): vscode.LanguageModelToolResult {
  const message = err instanceof Error ? err.message : String(err);
  return new vscode.LanguageModelToolResult([
    new vscode.LanguageModelTextPart(JSON.stringify({ error: message })),
  ]);
}
