from fnmatch import fnmatchcase
from pathlib import Path

from .errors import CuratorConfigError


def is_included_extension(
    path: Path,
    include_extensions: set[str] | None,
    ignore_extensions: set[str] | None,
) -> bool:
    extension = path.suffix.lower()
    if ignore_extensions is not None and extension in ignore_extensions:
        return False

    if include_extensions is None:
        return True

    return extension in include_extensions


def is_excluded_path(
    path: Path,
    root: Path,
    exclude_directories: set[str] | None,
) -> bool:
    if not exclude_directories:
        return False

    return any(part in exclude_directories for part in path.relative_to(root).parts)


def matches_file_pattern(relative_path: Path, pattern: str) -> bool:
    posix_path = relative_path.as_posix()
    normalized_pattern = pattern.strip("/")

    if normalized_pattern == "*":
        return True

    if normalized_pattern.endswith("/*"):
        directory = normalized_pattern[:-2]
        return posix_path == directory or posix_path.startswith(f"{directory}/")

    return fnmatchcase(posix_path, normalized_pattern)


def is_included_file(
    path: Path,
    root: Path,
    include_files: set[str] | None,
    exclude_files: set[str] | None,
) -> bool:
    relative_path = path.relative_to(root)

    if exclude_files and any(
        matches_file_pattern(relative_path, pattern) for pattern in exclude_files
    ):
        return False

    if include_files is None:
        return True

    return any(
        matches_file_pattern(relative_path, pattern) for pattern in include_files
    )


def ensure_source_path(path: Path) -> None:
    if not path.exists():
        raise CuratorConfigError(f"Clone directory not found: {path}")

    if not path.is_dir():
        raise CuratorConfigError(f"Clone path is not a directory: {path}")


def path_contains_symlink(root: Path, relative_path: Path) -> bool:
    current_path = root
    for path_part in relative_path.parts:
        current_path = current_path / path_part
        if current_path.is_symlink():
            return True

    return False
