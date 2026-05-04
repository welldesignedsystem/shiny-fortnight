# Curator — Intelligent Copilot Asset Curation & Sync

> Automatically curate and sync the right Copilot capabilities from your central library into every application repository — intelligently, efficiently, and with human control.

This is a monorepo containing the complete Curator system: a Python MCP server, a VS Code extension, and agent tooling.

---

## 📁 Repository Structure

### [`curator/`](curator/) — Core Python Server

The MCP (Model Context Protocol) server that handles all curation logic:

- **Tech stack:** Python, FastAPI, Docker
- **Key responsibilities:**
  - Stack detection (analyzes `pom.xml`, `package.json`, `pyproject.toml`, etc.)
  - File manifest filtering based on configuration and detected stack
  - File read/transfer operations
- **Configuration:** Defined in `config.yaml`
- **Deployment:** Includes `Dockerfile` for containerized operation

**Learn more:** [curator/README.md](curator/README.md)

### [`burrow/`](burrow/) — VS Code Extension

TypeScript/Node.js extension that bridges Copilot and Curator:

- **Tech stack:** TypeScript, VS Code Extension API
- **Key responsibilities:**
  - Registers 4 Curator tools with GitHub Copilot's agent
  - Forwards Copilot tool calls to the Curator MCP server
  - Shows confirmation dialogs for file transfers (human-in-the-loop)
- **Exposed tools:**
  - `curator_init` — Clone configured source repository
  - `curator_list` — Return filtered file manifest
  - `curator_read` — Read a single file's content
  - `curator_transfer` — Copy files to destination folder

**Learn more:** [burrow/README.md](burrow/README.md)

### [`binky/`](binky/) — Agent Specifications

Specifications and prompts for creating a custom Copilot agent in your repository:

- Describes a two-mode agent (prepare & apply)
- Prepare mode: analyzes codebase and generates a JSON transfer plan
- Apply mode: executes the transfer after user approval

**Learn more:** [binky/README.md](binky/README.md)

---

## 🚀 Quick Start

### Prerequisites

- Python 3.8+
- Node.js 16+
- VS Code 1.90+
- GitHub Copilot extension installed

### Setup

1. **Start the Curator server:**
   ```bash
   cd curator
   python -m curator
   # Server starts at http://localhost:8000 by default
   ```

2. **Build & install the extension:**
   ```bash
   cd burrow
   npm install
   npm run compile
   npx @vscode/vsce package
   # Then install the .vsix file in VS Code or run via F5
   ```

3. **Configure in your app repository:**
   ```json
   // .vscode/settings.json
   {
     "curator.serverUrl": "http://localhost:8000",
     "curator.configPath": "config.yaml"
   }
   ```

4. **Use in Copilot Chat:**
   - Open Copilot Chat
   - Switch to **Agent** mode
   - Reference Curator tools in your prompt

---

## 🎯 How It Works

```
User (Copilot Chat)
        ↓
   [Agent Mode]
        ↓
Burrow Extension (VS Code)
        ↓
    HTTP POST
        ↓
Curator Server (Python MCP)
        ↓
  [Analyze Stack] → [Filter Files] → [Return Results]
        ↓
    HTTP Response
        ↓
   Copilot Agent
        ↓
  [Show Results to User]
```

---

## 📋 Feature Highlights

- **Stack Detection** — Automatically identifies your tech stack from configuration files
- **Intelligent Filtering** — Only syncs Copilot assets relevant to your repository
- **Human-in-the-Loop** — Review and approve transfers before files are copied
- **Zero MCP Setup** — Extension abstracts MCP protocol; works with plain HTTP server
- **Containerized** — Curator ships with `Dockerfile` for easy deployment
- **Configuration-Driven** — All behavior controlled via `config.yaml`

---

## 🔧 Development

Each component has its own development workflow:

### Curator (Python)
```bash
cd curator
python -m curator              # Run server
python -m pytest               # Run tests
```

### Burrow (TypeScript)
```bash
cd burrow
npm install                    # Install dependencies
npm run compile                # Compile TypeScript
npm run watch                  # Watch mode
npx @vscode/vsce package       # Package as .vsix
```

### Binky (Documentation)
Specifications only — see the `README.md` for agent prompt requirements.

---

## 📚 Documentation

- [Curator README](curator/README.md) — Server architecture, configuration, deployment
- [Burrow README](burrow/README.md) — Extension setup, tool registration, usage
- [Binky README](binky/README.md) — Agent prompt specifications and modes

---

## 🤝 Contributing

1. Make changes in the relevant component (`curator/`, `burrow/`, or `binky/`)
2. Follow each component's development guidelines (see above)
3. Test changes thoroughly before committing

---

## 📝 License

See [burrow/LICENSE.md](burrow/LICENSE.md) for extension licensing details.

---

**Questions?** Refer to the component-specific READMEs or reach out to the team.
