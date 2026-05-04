import * as vscode from "vscode";

const MCP_PROTOCOL_VERSION = "2025-06-18";

interface JsonRpcResponse {
  jsonrpc?: string;
  id?: string | number | null;
  result?: unknown;
  error?: {
    code?: number;
    message?: string;
    data?: unknown;
  };
}

let nextRequestId = 1;
let sessionId: string | undefined;
let sessionServerUrl: string | undefined;

function getConfig() {
  const cfg = vscode.workspace.getConfiguration("curator");
  const rawUrl = process.env.CURATOR_SERVER_URL || process.env.CURATOR_HOST || cfg.get<string>("serverUrl");
  let serverUrl = rawUrl ? rawUrl.trim().replace(/\/$/, "") : "http://127.0.0.1:8000";

  if (!/\/mcp$/.test(serverUrl)) {
    serverUrl = `${serverUrl}/mcp`;
  }

  return {
    serverUrl,
    configPath: cfg.get<string>("configPath") ?? "config.yaml",
  };
}

function createHeaders(includeSession = true): HeadersInit {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  };

  if (includeSession && sessionId) {
    headers["mcp-session-id"] = sessionId;
  }

  return headers;
}

function createRequestBody(method: string, params?: unknown, id: string | null = String(nextRequestId++)): string {
  return JSON.stringify({
    jsonrpc: "2.0",
    ...(id === null ? {} : { id }),
    method,
    ...(params === undefined ? {} : { params }),
  });
}

async function parseJsonRpcResponse(response: Response): Promise<JsonRpcResponse> {
  const text = await response.text();
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("text/event-stream")) {
    const dataLines = text
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice("data:".length).trim())
      .filter((line) => line && line !== "[DONE]");

    if (!dataLines.length) {
      return {};
    }

    return JSON.parse(dataLines[dataLines.length - 1]) as JsonRpcResponse;
  }

  if (!text.trim()) {
    return {};
  }

  return JSON.parse(text) as JsonRpcResponse;
}

function throwIfJsonRpcError(payload: JsonRpcResponse): void {
  if (!payload.error) {
    return;
  }

  const suffix = payload.error.data ? ` ${JSON.stringify(payload.error.data)}` : "";
  throw new Error(`Curator MCP error (${payload.error.code ?? "unknown"}): ${payload.error.message}${suffix}`);
}

async function postJsonRpc(
  serverUrl: string,
  method: string,
  params?: unknown,
  includeSession = true,
  isNotification = false
): Promise<JsonRpcResponse> {
  const response = await fetch(serverUrl, {
    method: "POST",
    headers: createHeaders(includeSession),
    body: createRequestBody(method, params, isNotification ? null : undefined),
  });

  const responseSessionId = response.headers.get("mcp-session-id");
  if (responseSessionId) {
    sessionId = responseSessionId;
    sessionServerUrl = serverUrl;
  }

  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText);
    throw new Error(`Curator server error (${response.status}): ${text}`);
  }

  const payload = await parseJsonRpcResponse(response);
  throwIfJsonRpcError(payload);
  return payload;
}

async function ensureSession(serverUrl: string): Promise<void> {
  if (sessionId && sessionServerUrl === serverUrl) {
    return;
  }

  sessionId = undefined;
  sessionServerUrl = undefined;

  await postJsonRpc(
    serverUrl,
    "initialize",
    {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: {
        name: "burrow",
        version: "0.0.4",
      },
    },
    false
  );

  await postJsonRpc(
    serverUrl,
    "notifications/initialized",
    undefined,
    true,
    true
  );
}

async function callTool(toolName: string, params: Record<string, unknown>): Promise<unknown> {
  const { serverUrl, configPath } = getConfig();

  // Inject config_path into every call unless the caller already set it
  if (!("config_path" in params)) {
    params = { ...params, config_path: configPath };
  }

  await ensureSession(serverUrl);
  const response = await postJsonRpc(serverUrl, "tools/call", {
    name: toolName,
    arguments: params,
  });

  return response.result;
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
