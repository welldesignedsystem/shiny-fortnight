from typing import Any

from fastmcp import FastMCP

from .config import (
    get_clone_dir,
    get_config_value,
    get_exclude_directories,
    get_exclude_files,
    get_ignore_extensions,
    get_include_files,
    get_include_extensions,
    read_config,
)
from .constants import DEFAULT_CONFIG_PATH, DEFAULT_CLONE_DIR
from .dto import ListRequest
from .errors import CuratorConfigError
from .file_manifest import build_file_manifest, validate_requested_files
from .filters import ensure_source_path
from .git_tools import clone_repo


mcp = FastMCP("curator")


def serialize_config_values(values: set[str] | None) -> list[str] | None:
    if values is None:
        return None

    return sorted(values)


@mcp.tool(name="init")
def init(config_path: str = DEFAULT_CONFIG_PATH) -> dict[str, Any]:
    """Read config.yaml and clone the configured Curator source repository."""
    config = read_config(config_path)
    repo_url = get_config_value(config, "curator-source-repo")
    if not repo_url:
        raise CuratorConfigError(
            "Missing required config setting: curator-source-repo"
        )

    clone_dir = get_config_value(config, "curator-clone-dir") or DEFAULT_CLONE_DIR
    return clone_repo(str(repo_url), str(clone_dir))


@mcp.tool(name="list")
def list_files(
    request: ListRequest | None = None,
    config_path: str = DEFAULT_CONFIG_PATH,
) -> dict[str, Any]:
    """Return a manifest of files available in the configured Curator clone."""
    config = read_config(config_path)
    clone_dir = get_clone_dir(config)
    include_extensions = get_include_extensions(config)
    ignore_extensions = get_ignore_extensions(config)
    exclude_directories = get_exclude_directories(config)
    include_files = get_include_files(config)
    exclude_files = get_exclude_files(config)
    ensure_source_path(clone_dir)

    if request is None:
        request = ListRequest()

    metadata = {
        "clone_dir": str(clone_dir),
        "curator-include-files": serialize_config_values(include_files),
        "curator-exclude-files": serialize_config_values(exclude_files),
        "curator-include-extensions": serialize_config_values(include_extensions),
        "curator-ignore-extensions": serialize_config_values(ignore_extensions),
        "curator-exclude-directories": serialize_config_values(exclude_directories),
        **request.metadata,
    }

    if not request.files:
        return build_file_manifest(
            clone_dir,
            include_extensions,
            ignore_extensions,
            exclude_directories,
            include_files,
            exclude_files,
            metadata,
        ).model_dump()

    validated_files = validate_requested_files(
        clone_dir,
        request,
        include_extensions,
        ignore_extensions,
        exclude_directories,
        include_files,
        exclude_files,
    )
    return ListRequest(metadata=metadata, files=validated_files).model_dump()


if __name__ == "__main__":
    mcp.run(transport="http")
