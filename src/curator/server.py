import logging
from functools import wraps
from pathlib import Path
from shutil import copy2
from typing import Any, Callable

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
from .dto import ListFile, ListRequest, ReadFileRequest, TransferRequest
from .errors import CuratorConfigError
from .file_manifest import build_file_manifest, validate_requested_files
from .filters import ensure_source_path
from .git_tools import clone_repo


mcp = FastMCP("curator")
logger = logging.getLogger(__name__)


def log_tool_errors(
    tool_name: str,
) -> Callable[[Callable[..., Any]], Callable[..., Any]]:
    def decorator(func: Callable[..., Any]) -> Callable[..., Any]:
        @wraps(func)
        def wrapper(*args: Any, **kwargs: Any) -> Any:
            try:
                return func(*args, **kwargs)
            except CuratorConfigError as exc:
                logger.warning("Curator tool '%s' failed: %s", tool_name, exc)
            except Exception:
                logger.exception("Curator tool '%s' failed unexpectedly", tool_name)

        return wrapper

    return decorator


def serialize_config_values(values: set[str] | None) -> list[str] | None:
    if values is None:
        return None

    return sorted(values)


def get_list_context(config_path: str) -> dict[str, Any]:
    config = read_config(config_path)
    clone_dir = get_clone_dir(config)
    include_extensions = get_include_extensions(config)
    ignore_extensions = get_ignore_extensions(config)
    exclude_directories = get_exclude_directories(config)
    include_files = get_include_files(config)
    exclude_files = get_exclude_files(config)
    ensure_source_path(clone_dir)

    return {
        "clone_dir": clone_dir,
        "include_extensions": include_extensions,
        "ignore_extensions": ignore_extensions,
        "exclude_directories": exclude_directories,
        "include_files": include_files,
        "exclude_files": exclude_files,
    }


def build_list_metadata(
    request_metadata: dict[str, Any],
    clone_dir: Path,
    include_extensions: set[str] | None,
    ignore_extensions: set[str] | None,
    exclude_directories: set[str] | None,
    include_files: set[str] | None,
    exclude_files: set[str] | None,
) -> dict[str, Any]:
    return {
        "clone_dir": str(clone_dir),
        "curator-include-files": serialize_config_values(include_files),
        "curator-exclude-files": serialize_config_values(exclude_files),
        "curator-include-extensions": serialize_config_values(include_extensions),
        "curator-ignore-extensions": serialize_config_values(ignore_extensions),
        "curator-exclude-directories": serialize_config_values(exclude_directories),
        **request_metadata,
    }


@mcp.tool(name="init")
@log_tool_errors("init")
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
@log_tool_errors("list")
def list_files(
    request: ListRequest | None = None,
    config_path: str = DEFAULT_CONFIG_PATH,
) -> dict[str, Any]:
    """Return a manifest of files available in the configured Curator clone."""
    context = get_list_context(config_path)
    clone_dir = context["clone_dir"]
    include_extensions = context["include_extensions"]
    ignore_extensions = context["ignore_extensions"]
    exclude_directories = context["exclude_directories"]
    include_files = context["include_files"]
    exclude_files = context["exclude_files"]

    if request is None:
        request = ListRequest()

    metadata = build_list_metadata(
        request.metadata,
        clone_dir,
        include_extensions,
        ignore_extensions,
        exclude_directories,
        include_files,
        exclude_files,
    )

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


@mcp.tool(name="read")
@log_tool_errors("read")
def read_file(
    request: ReadFileRequest,
    config_path: str = DEFAULT_CONFIG_PATH,
) -> dict[str, Any]:
    """Read a Curator file if it is included by config and not excluded."""
    context = get_list_context(config_path)
    clone_dir = context["clone_dir"]
    include_extensions = context["include_extensions"]
    ignore_extensions = context["ignore_extensions"]
    exclude_directories = context["exclude_directories"]
    include_files = context["include_files"]
    exclude_files = context["exclude_files"]

    validated_files = validate_requested_files(
        clone_dir,
        ListRequest(files=[ListFile(file=request.file)]),
        include_extensions,
        ignore_extensions,
        exclude_directories,
        include_files,
        exclude_files,
    )
    source_path = Path(validated_files[0].file)

    try:
        content = source_path.read_text(encoding="utf-8")
    except UnicodeDecodeError as exc:
        raise CuratorConfigError(
            f"Read file is not UTF-8 text: {request.file}"
        ) from exc

    return {
        "metadata": build_list_metadata(
            {},
            clone_dir,
            include_extensions,
            ignore_extensions,
            exclude_directories,
            include_files,
            exclude_files,
        ),
        "file": source_path.as_posix(),
        "content": content,
    }


@mcp.tool(name="transfer")
@log_tool_errors("transfer")
def transfer_files(
    request: TransferRequest,
    config_path: str = DEFAULT_CONFIG_PATH,
) -> dict[str, Any]:
    """Copy listed Curator files to a destination folder.
    To be able to transfer, files must be included in the list output.
    The files need to be listed using the list end point for then included in the transfer request."""
    context = get_list_context(config_path)
    clone_dir = context["clone_dir"]
    include_extensions = context["include_extensions"]
    ignore_extensions = context["ignore_extensions"]
    exclude_directories = context["exclude_directories"]
    include_files = context["include_files"]
    exclude_files = context["exclude_files"]

    manifest = build_file_manifest(
        clone_dir,
        include_extensions,
        ignore_extensions,
        exclude_directories,
        include_files,
        exclude_files,
    )
    allowed_files = {list_file.file for list_file in manifest.files}

    requested_files = ListRequest(
        files=[ListFile(file=transfer_file.file) for transfer_file in request.files]
    )
    validated_files = validate_requested_files(
        clone_dir,
        requested_files,
        include_extensions,
        ignore_extensions,
        exclude_directories,
        include_files,
        exclude_files,
    )

    destination_folder = Path(request.destination_folder).expanduser().resolve()
    transferred_files = []
    for transfer_file, validated_file in zip(request.files, validated_files):
        source_path = Path(validated_file.file)
        if validated_file.file not in allowed_files:
            raise CuratorConfigError(
                f"Transfer file is not present in list output: {transfer_file.file}"
            )

        destination_path = (
            Path(transfer_file.destination).expanduser().resolve()
            if transfer_file.destination
            else destination_folder / source_path.name
        )
        if destination_path.exists() and destination_path.is_dir():
            destination_path = destination_path / source_path.name

        destination_path.parent.mkdir(parents=True, exist_ok=True)
        copy2(source_path, destination_path)
        transferred_files.append(
            {
                "file": source_path.as_posix(),
                "destination": destination_path.as_posix(),
            }
        )

    return {
        "metadata": build_list_metadata(
            {
                "destination_folder": destination_folder.as_posix(),
            },
            clone_dir,
            include_extensions,
            ignore_extensions,
            exclude_directories,
            include_files,
            exclude_files,
        ),
        "files": transferred_files,
    }


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    mcp.run(transport="http")
