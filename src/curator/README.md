# Curator Tools MCP

FastMCP server for Curator automation tools.

## Tools

### `init`

Reads `config.yaml`, finds `curator-source-repo`, and clones that repository.

By default, the repository is cloned to:

```text
/tmp/curator/source-repo
```

Override with:

```yaml
curator-clone-dir: /tmp/curator/source-repo
```

Include files with shell-style path patterns:

```yaml
curator-include-files:
  - "*"
```

Exclude files with shell-style path patterns:

```yaml
curator-exclude-files:
  - ".git/*"
```

If omitted, Curator uses `curator-include-files: ["*"]` and
`curator-exclude-files: [".git/*"]` by default. Patterns ending in `/*` match
everything under that directory.

The older extension and directory settings are still supported. Include listed
files by extension with:

```yaml
curator-include-extensions:
  - "md"
  - "txt"
```

Use `*` to include all extensions:

```yaml
curator-include-extensions:
  - "*"
```

Extensions can be configured with or without the leading dot.

Ignore specific extensions with:

```yaml
curator-ignore-extensions:
  - "sample"
  - "tmp"
```

Exclude directories with:

```yaml
curator-exclude-directories:
  - ".git"
  - "node_modules"
```

If omitted, `.git` is ignored by default.

### `list`

Returns a manifest of files from the configured Curator clone.

Input shape:

```json
{
  "metadata": {},
  "files": [
    {
      "file": "/tmp/curator/source-repo/skills/python/example.md"
    }
  ]
}
```

If `files` is empty or omitted, `list` scans the clone and returns all
regular files:

```json
{
  "metadata": {
    "clone_dir": "/tmp/curator/source-repo",
    "curator-include-files": ["*"],
    "curator-exclude-files": [".git/*"],
    "curator-include-extensions": null,
    "curator-ignore-extensions": null,
    "curator-exclude-directories": [".git"]
  },
  "files": [
    {
      "file": "/tmp/curator/source-repo/skills/python/example.md"
    }
  ]
}
```

Requested absolute paths are resolved under the configured clone directory. Paths that
escape that directory, symlinks, and non-file paths are rejected.

### `transfer`

Copies requested files from the configured Curator clone to a destination folder.
Requested files must also appear in the `list` output after filters are applied.

Input shape:

```json
{
  "destination_folder": "/tmp/curator/transfer",
  "files": [
    {
      "file": "/tmp/curator/source-repo/skills/python/example.md"
    },
    {
      "file": "/tmp/curator/source-repo/README.md",
      "destination": "/tmp/curator/transfer/docs/README.md"
    }
  ]
}
```

If a file does not specify `destination`, Curator copies it into
`destination_folder` with the original filename. If `destination` is set, Curator
uses that path for that file.

Output shape:

```json
{
  "metadata": {
    "clone_dir": "/tmp/curator/source-repo",
    "destination_folder": "/tmp/curator/transfer"
  },
  "files": [
    {
      "file": "/tmp/curator/source-repo/skills/python/example.md",
      "destination": "/tmp/curator/transfer/example.md"
    }
  ]
}
```

## Run

From the repository root, run the package as a module:

```bash
python -m curator.server
```

Or with the launcher script:

```bash
python curator_server.py
```

Or with FastMCP directly:

```bash
fastmcp run curator.server:mcp
```

Build the Docker image from the repository root:

```bash
docker build -f src/curator/Dockerfile .
```
