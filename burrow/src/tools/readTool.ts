import * as vscode from "vscode";
import { curatorRead } from "../client/curatorClient";
import { errorResult, jsonResult } from "./results";

interface ReadInput {
  file: string;
}

export class CuratorReadTool implements vscode.LanguageModelTool<ReadInput> {
  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<ReadInput>,
    _token: vscode.CancellationToken
  ): Promise<vscode.LanguageModelToolResult> {
    try {
      const result = await curatorRead(options.input.file);
      return jsonResult(result);
    } catch (err) {
      return errorResult(err);
    }
  }

  async prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<ReadInput>,
    _token: vscode.CancellationToken
  ): Promise<vscode.PreparedToolInvocation> {
    return {
      invocationMessage: `Reading ${options.input.file}...`,
    };
  }
}
