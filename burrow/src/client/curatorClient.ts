import * as vscode from "vscode";

function getConfig() {
  const cfg = vscode.workspace.getConfiguration("curator");
  return {
    serverUrl: (cfg.get<string>("serverUrl") ?? "http://localhost:8000").replace(/\/$/, ""),
    configPath: cfg.get<string>("configPath") ?? "config.yaml",
  };
}

async function callTool(toolName: string, params: Record<string, unknown>): Promise<unknown> {
  const { serverUrl, configPath } = getConfig();

  // Inject config_path into every call unless the caller already set it
  if (!("config_path" in params)) {
    params = { ...params, config_path: configPath };
  }

  const url = `${serverUrl}/tools/${toolName}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText);
    throw new Error(`Curator server error (${response.status}): ${text}`);
  }

  return response.json();
}

export async function curatorInit(configPath?: string): Promise<unknown> {
  return callTool("init", configPath ? { config_path: configPath } : {});
}

export async function curatorList(
  files?: Array<{ file: string }>,
  metadata?: Record<string, string>
): Promise<unknown> {
  const request: Record<string, unknown> = {};
  if (files) request.files = files;
  if (metadata) request.metadata = metadata;
  return callTool("list", { request: Object.keys(request).length ? request : null });
}

export async function curatorRead(file: string): Promise<unknown> {
  return callTool("read", { request: { file } });
}

export async function curatorTransfer(
  destinationFolder: string,
  files: Array<{ file: string; destination?: string }>
): Promise<unknown> {
  return callTool("transfer", {
    request: { destination_folder: destinationFolder, files },
  });
}
