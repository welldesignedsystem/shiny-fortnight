import * as vscode from "vscode";
import { curatorTransfer } from "../client/curatorClient";
import { errorResult, jsonResult } from "./results";

interface TransferInput {
  destination_folder: string;
  files: Array<{ file: string; destination?: string }>;
}

export class CuratorTransferTool
  implements vscode.LanguageModelTool<TransferInput>
{
  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<TransferInput>,
    _token: vscode.CancellationToken
  ): Promise<vscode.LanguageModelToolResult> {
    try {
      const { destination_folder, files } = options.input;
      const result = await curatorTransfer(destination_folder, files);
      return jsonResult(result);
    } catch (err) {
      return errorResult(err);
    }
  }

  async prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<TransferInput>,
    _token: vscode.CancellationToken
  ): Promise<vscode.PreparedToolInvocation> {
    const count = options.input.files?.length ?? 0;
    return {
      invocationMessage: `Transferring ${count} file(s) to ${options.input.destination_folder}...`,
      confirmationMessages: {
        title: "Curator: Transfer Files",
        message: new vscode.MarkdownString(
          `Copy **${count}** file(s) to \`${options.input.destination_folder}\`?`
        ),
      },
    };
  }
}
