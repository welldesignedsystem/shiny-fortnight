from pathlib import Path
from typing import Any

import yaml

from .constants import (
    DEFAULT_CLONE_DIR,
    DEFAULT_CONFIG_PATH,
    DEFAULT_EXCLUDE_FILES,
    DEFAULT_EXCLUDED_DIRECTORIES,
    DEFAULT_INCLUDE_FILES,
)
from .errors import CuratorConfigError


def read_config(config_path: str = DEFAULT_CONFIG_PATH) -> dict[str, Any]:
    path = Path(config_path)
    if not path.exists():
        raise CuratorConfigError(f"Configuration file not found: {path}")

    with path.open("r", encoding="utf-8") as config_file:
        config = yaml.safe_load(config_file) or {}

    if not isinstance(config, dict):
        raise CuratorConfigError("Configuration file must contain a YAML object.")

    return config


def get_config_value(config: dict[str, Any], key: str) -> Any:
    if key in config:
        return config[key]

    curator_config = config.get("curator")
    if isinstance(curator_config, dict) and key in curator_config:
        return curator_config[key]

    return None


def get_clone_dir(config: dict[str, Any]) -> Path:
    clone_dir = get_config_value(config, "curator-clone-dir") or DEFAULT_CLONE_DIR
    return Path(str(clone_dir)).resolve()


def get_extension_list(config: dict[str, Any], *keys: str) -> set[str] | None:
    extensions = None
    for key in keys:
        extensions = get_config_value(config, key)
        if extensions is not None:
            break

    if extensions is None:
        return None

    if extensions == "*":
        return None

    if not isinstance(extensions, list) or not all(
        isinstance(extension, str) for extension in extensions
    ):
        raise CuratorConfigError("Configured extensions must be a list of strings.")

    if "*" in extensions:
        return None

    return {
        extension.lower() if extension.startswith(".") else f".{extension.lower()}"
        for extension in extensions
    }


def get_include_extensions(config: dict[str, Any]) -> set[str] | None:
    return get_extension_list(
        config,
        "curator-include-extensions",
        "curator-extensions",
        "extensions",
    )


def get_ignore_extensions(config: dict[str, Any]) -> set[str] | None:
    return get_extension_list(config, "curator-ignore-extensions")


def get_exclude_directories(config: dict[str, Any]) -> set[str]:
    directories = get_config_value(config, "curator-exclude-directories")
    if directories is None:
        directories = get_config_value(config, "curator-ignore-directories")
    if directories is None:
        directories = get_config_value(config, "ignore-directories")

    if directories is None:
        return DEFAULT_EXCLUDED_DIRECTORIES

    if not isinstance(directories, list) or not all(
        isinstance(directory, str) for directory in directories
    ):
        raise CuratorConfigError(
            "Configured excluded directories must be a list of strings."
        )

    return set(directories)


def get_file_patterns(
    config: dict[str, Any],
    key: str,
    default_patterns: set[str] | None = None,
) -> set[str] | None:
    patterns = get_config_value(config, key)
    if patterns is None:
        return default_patterns

    if patterns == "*":
        return {"*"}

    if not isinstance(patterns, list) or not all(
        isinstance(pattern, str) for pattern in patterns
    ):
        raise CuratorConfigError(f"{key} must be a list of strings.")

    return set(patterns)


def get_include_files(config: dict[str, Any]) -> set[str] | None:
    return get_file_patterns(
        config,
        "curator-include-files",
        DEFAULT_INCLUDE_FILES,
    )


def get_exclude_files(config: dict[str, Any]) -> set[str] | None:
    return get_file_patterns(
        config,
        "curator-exclude-files",
        DEFAULT_EXCLUDE_FILES,
    )
