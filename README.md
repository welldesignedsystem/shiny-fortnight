# Curator

> Curate and sync the right Copilot capabilities from your central library into every application repository — automatically, intelligently, and with a human always in the loop.

---

## Configuration

All configurable values for Curator are defined in one place — `curator-config.yaml` — located at the root of the central library repo (`github-custom-library`).

```yaml
curator:
  # Central library repository
  library_repo: "https://github.com/your-org/github-custom-library"
  library_branch: "main"

  # Temp folder used by Docker container during analysis
  temp_dir: "/tmp/curator"

  # Default destination inside app repos for copied files
  default_destination: ".github/copilot"

  # Slash command settings
  command: "curator"
  default_mode: "full"                  # full | specific

  # Docker settings
  docker_image: "curator-sync:latest"
  docker_cleanup: true                  # delete temp folder after run

  # HTML review page
  review_output_file: "curator-review.html"
  open_review_on_generate: true         # auto-open in browser/VS Code simple browser

  # GitHub Actions sync settings
  sync_trigger: "push"                  # trigger on push to library repo
  sync_branch: "main"                   # which branch triggers downstream PRs
  pr_title_prefix: "[Curator]"          # prefix for auto-raised PRs
  pr_reviewers: []                      # optional list of default reviewers

  # Stack detection — maps indicator files to stack tags
  stack_detection:
    "pom.xml": ["java", "maven"]
    "build.gradle": ["java", "gradle"]
    "application.yml": ["spring-boot"]
    "application.properties": ["spring-boot"]
    "requirements.txt": ["python"]
    "pyproject.toml": ["python"]
    "package.json": ["node"]
    "Dockerfile": ["container"]
```

> **Note:** App repos each maintain their own `copilot-library.yaml` declaring their stack. See the [Ongoing Sync](#ongoing-sync-via-github-actions) section for details.

---

## The Problem

Teams maintain a central GitHub repository (`github-custom-library`) containing Copilot assets — prompts, agents, skills, and instructions — covering a wide range of technologies and roles (Java, Python, Spring Boot, Maven, Gradle, Business Analyst prompts, etc.).

Application repositories are diverse — different teams, different tech stacks, different structures. Dumping every capability from the central library into every repo is noisy and counterproductive. Each repo should only contain what is relevant to its specific stack.

Additionally, Copilot assets must be available the moment a developer checks out a repo — no manual setup steps.

---

## Goals

- **Initial setup** — When a new app repo is being onboarded, automatically detect the tech stack and copy only the relevant Copilot assets from the central library
- **Ongoing sync** — When the central library is updated, relevant app repos are notified via a Pull Request with the proposed changes
- **Human in the loop** — No files are copied without a developer reviewing and approving what is proposed
- **Available on checkout** — Curated files live inside the app repo so they are present the moment a developer clones it

---

## Solution Overview

Curator is a Copilot agent invoked via a slash command. It analyses the current repository, determines the relevant tech stack, cross-references the central library, and proposes a set of files to copy — all before touching anything. A human reviews and approves before any changes are made.

---

## Slash Command

```
/curator sync --mode full
/curator sync --mode specific
```

| Mode | Behaviour |
|---|---|
| `full` | Analyses the entire repository to detect the tech stack |
| `specific` | Analyses only the currently open file or selected code block |

---

## Architecture

### Components

```
┌─────────────────────────────────────────┐
│           Copilot Agent                 │
│  - Invoked via /curator sync            │
│  - Analyses repo or selection           │
│  - Infers tech stack                    │
│  - Triggers the Docker script           │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│         Docker Container                │
│  - Clones github-custom-library         │
│    into a temp folder                   │
│  - Analyses central library contents    │
│  - Analyses app repo                    │
│  - Produces structured JSON output      │
│  - Cleans up temp folder                │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│         HTML Review Page                │
│  - Renders the JSON in a readable view  │
│  - Developer reviews proposed changes   │
│  - Approve / reject before any copy     │
└────────────────┬────────────────────────┘
                 │ Approved
                 ▼
┌─────────────────────────────────────────┐
│         File Copy Step                  │
│  - Copies included files into app repo  │
│  - Respects conflict flags              │
│  - Skips excluded files                 │
└─────────────────────────────────────────┘
```

---

## JSON Output Schema (Pydantic)

The Docker script produces a structured JSON file which drives both the HTML review page and the file copy step.

```json
{
  "detected_stack": ["java", "spring-boot", "maven"],
  "library_commit_sha": "abc123def456",
  "mode": "full",
  "files": [
    {
      "source_path": "skills/java/java-refactor.md",
      "destination_folder": ".github/copilot/skills",
      "file_name": "java-refactor.md",
      "action": "include",
      "reason": "Java skill relevant to detected stack",
      "conflict": false
    },
    {
      "source_path": "prompts/ba/requirements-template.md",
      "destination_folder": ".github/copilot/prompts",
      "file_name": "requirements-template.md",
      "action": "exclude",
      "reason": "Business Analyst prompt not relevant to Java/Spring Boot stack",
      "conflict": false
    }
  ]
}
```

### Schema Fields

| Field | Description |
|---|---|
| `detected_stack` | Technologies inferred by the agent from the repo |
| `library_commit_sha` | Exact commit SHA of the central library snapshot used |
| `mode` | Whether `full` or `specific` mode was used |
| `source_path` | Path of the file in the central library |
| `destination_folder` | Target folder in the app repo |
| `file_name` | Name of the file |
| `action` | `include` or `exclude` |
| `reason` | Human-readable explanation of why the file was included or excluded |
| `conflict` | `true` if the file already exists locally — requires explicit human decision |

---

## Stack Detection

The agent infers the tech stack by inspecting well-known indicator files in the repository:

| File | Inferred Stack |
|---|---|
| `pom.xml` | Java, Maven |
| `build.gradle` | Java, Gradle |
| `application.yml` / `application.properties` | Spring Boot |
| `requirements.txt` / `pyproject.toml` | Python |
| `package.json` | Node.js |
| `Dockerfile` | Container workloads |

In `specific` mode, the agent infers stack from the language and frameworks visible in the open file or selected block.

---

## Ongoing Sync via GitHub Actions

When the central library (`github-custom-library`) is updated, a GitHub Actions workflow automatically raises Pull Requests in downstream app repos.

### How it works

1. A change is pushed to `github-custom-library`
2. A GitHub Actions workflow fires on the central library repo
3. It reads the `copilot-library.yaml` config file present in each registered app repo
4. For each app repo whose declared stack is affected by the change, it opens a PR with the updated files
5. The developer reviews and merges — this is the human-in-the-loop gate for the sync flow

### App Repo Config (`copilot-library.yaml`)

Each application repository declares its stack in a small config file:

```yaml
stack:
  - java
  - spring-boot
  - maven
```

This file is generated during the initial setup flow and reviewed by the developer before being committed. It serves as the ongoing source of truth for the sync mechanism.

---

## Responsibilities

| Component | Role |
|---|---|
| **Copilot Agent** | Smart inference — analyses the repo, detects the stack, understands the library |
| **Docker Script** | Reliable automation — clones, analyses, produces JSON, cleans up |
| **HTML Review Page** | Human gate — nothing is copied without explicit approval |
| **GitHub Actions** | Ongoing sync — raises PRs when the central library changes |
| **Human** | Reviews the proposed YAML config and reviews the PR — two explicit checkpoints |

---

## Key Design Decisions

- **Explicit stack declaration (`copilot-library.yaml`)** over fragile automatic inference for the ongoing sync — the agent infers for convenience, but a human confirms
- **Conflict flagging** — files that already exist locally are never silently overwritten
- **Pydantic schema** — provides validation, documentation, and a clean contract between the agent and the script
- **Docker isolation** — the cloning and analysis happens in a container, no side effects on the developer's machine until they explicitly approve
- **PR as the sync mechanism** — leverages Git's native review workflow rather than inventing a new one

---

## Future Considerations

- Support for monorepos with multiple stacks within a single repository
- Confidence scoring on file relevance recommendations
- Diff view in the HTML review page for files that already exist locally (conflict resolution)
- A registration mechanism so the central library knows which downstream repos to notify automatically
