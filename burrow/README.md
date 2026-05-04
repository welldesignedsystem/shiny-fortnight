# Curator Copilot Tools

A VS Code extension that exposes your [Curator MCP](https://github.com/your-org/curator) tools directly to GitHub Copilot's agent — no MCP support required in Copilot.

## Tools registered

| Copilot tool name | Maps to MCP tool | Description |
|---|---|---|
| `curator_init` | `init` | Clone the configured source repo |
| `curator_list` | `list` | Return the filtered file manifest |
| `curator_read` | `read` | Read a single file's content |
| `curator_transfer` | `transfer` | Copy files to a destination folder |

## Requirements

- VS Code 1.90+
- GitHub Copilot extension installed
- Your Curator MCP server running in HTTP mode (`mcp.run(transport="http")`)

## Setup

1. Start your Curator server:
   ```bash
   python -m your_curator_package
   # Server starts at http://localhost:8000 by default
   ```

2. Install this extension (`.vsix`) or run it via `F5` in development.

3. Configure the server URL in settings if needed:
   ```json
   // .vscode/settings.json
   {
     "curator.serverUrl": "http://localhost:8000",
     "curator.configPath": "config.yaml"
   }
   ```

4. Open Copilot Chat, switch to **Agent** mode, and the four Curator tools will be available automatically.

## Usage in Copilot

The agent will call tools automatically based on your prompt. You can also reference them explicitly:

```
@workspace Initialize curator then list all Python files and read the main module.
```

```
Transfer src/utils.py and src/models.py to ~/project/output
```

## Development

Project layout:

```text
src/
  client/      Curator HTTP client
  tools/       Copilot language model tool implementations
  extension.ts VS Code extension activation and tool registration
```

```bash
npm install
npm run compile
npx @vscode/vsce package
rm ../curator/extension/*.vsix
mv curator-copilot-tools*.vsix ../curator/extension
# Press F5 in VS Code to launch Extension Development Host
```

## How it works

Each tool is registered with `vscode.lm.registerTool`. When Copilot's agent decides to call a tool, the extension forwards the call as an HTTP POST to your running Curator server and returns the JSON response back to the model.

The `curator_transfer` tool shows a **confirmation dialog** before copying files, so you always stay in control.
