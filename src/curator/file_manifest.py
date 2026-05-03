from pathlib import Path
from typing import Any

from .dto import ListFile, ListRequest
from .errors import CuratorConfigError
from .filters import (
    is_excluded_path,
    is_included_extension,
    is_included_file,
    path_contains_symlink,
)


def build_file_manifest(
    root: Path,
    include_extensions: set[str] | None = None,
    ignore_extensions: set[str] | None = None,
    exclude_directories: set[str] | None = None,
    include_files: set[str] | None = None,
    exclude_files: set[str] | None = None,
    metadata: dict[str, Any] | None = None,
) -> ListRequest:
    file_paths = [
        file_path
        for file_path in sorted(root.rglob("*"))
        if (
            file_path.is_file()
            and not file_path.is_symlink()
            and not is_excluded_path(file_path, root, exclude_directories)
            and is_included_file(file_path, root, include_files, exclude_files)
            and is_included_extension(
                file_path,
                include_extensions,
                ignore_extensions,
            )
        )
    ]

    files = [
        ListFile(
            index=index,
            path=file_path.relative_to(root).as_posix(),
            filename=file_path.name,
            extension=file_path.suffix,
        )
        for index, file_path in enumerate(file_paths)
    ]

    return ListRequest(metadata=metadata or {}, files=files)


def validate_requested_files(
    root: Path,
    request: ListRequest,
    include_extensions: set[str] | None = None,
    ignore_extensions: set[str] | None = None,
    exclude_directories: set[str] | None = None,
    include_files: set[str] | None = None,
    exclude_files: set[str] | None = None,
) -> list[ListFile]:
    validated_files: list[ListFile] = []
    for index, list_file in enumerate(request.files):
        requested_path = Path(list_file.path)
        candidate_path = (root / requested_path).resolve()
        try:
            relative_path = candidate_path.relative_to(root)
        except ValueError as exc:
            raise CuratorConfigError(
                f"List path escapes clone directory: {list_file.path}"
            ) from exc

        if path_contains_symlink(root, relative_path):
            raise CuratorConfigError(
                f"List path includes a symlink: {list_file.path}"
            )

        if not candidate_path.is_file():
            raise CuratorConfigError(
                f"List path is not a regular file: {list_file.path}"
            )

        if not is_included_extension(
            candidate_path,
            include_extensions,
            ignore_extensions,
        ):
            raise CuratorConfigError(
                f"List path extension is not allowed: {list_file.path}"
            )

        if is_excluded_path(candidate_path, root, exclude_directories):
            raise CuratorConfigError(
                f"List path is inside an excluded directory: {list_file.path}"
            )

        if not is_included_file(candidate_path, root, include_files, exclude_files):
            raise CuratorConfigError(
                f"List path is not allowed by file patterns: {list_file.path}"
            )

        validated_files.append(
            ListFile(
                index=list_file.index if list_file.index is not None else index,
                path=relative_path.as_posix(),
                filename=list_file.filename or candidate_path.name,
                extension=list_file.extension or candidate_path.suffix,
            )
        )

    return validated_files
