import * as vscode from "vscode";
import { curatorList } from "../client/curatorClient";
import { errorResult, jsonResult } from "./results";

interface ListInput {
  files?: Array<{ file: string }>;
  metadata?: Record<string, string>;
}

export class CuratorListTool implements vscode.LanguageModelTool<ListInput> {
  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<ListInput>,
    _token: vscode.CancellationToken
  ): Promise<vscode.LanguageModelToolResult> {
    try {
      const result = await curatorList(options.input.files, options.input.metadata);
      return jsonResult(result);
    } catch (err) {
      return errorResult(err);
    }
  }

  async prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<ListInput>,
    _token: vscode.CancellationToken
  ): Promise<vscode.PreparedToolInvocation> {
    const fileCount = options.input.files?.length;
    const invocationMessage = fileCount
      ? `Validating ${fileCount} file(s) in Curator manifest...`
      : "Fetching Curator file manifest...";
    return { invocationMessage };
  }
}
