import * as vscode from "vscode";
import { curatorInit } from "../client/curatorClient";
import { errorResult, jsonResult } from "./results";

interface InitInput {
  config_path?: string;
}

export class CuratorInitTool implements vscode.LanguageModelTool<InitInput> {
  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<InitInput>,
    _token: vscode.CancellationToken
  ): Promise<vscode.LanguageModelToolResult> {
    try {
      const result = await curatorInit(options.input.config_path);
      return jsonResult(result);
    } catch (err) {
      return errorResult(err);
    }
  }

  async prepareInvocation(
    _options: vscode.LanguageModelToolInvocationPrepareOptions<InitInput>,
    _token: vscode.CancellationToken
  ): Promise<vscode.PreparedToolInvocation> {
    return {
      invocationMessage: "Cloning Curator source repository...",
    };
  }
}
