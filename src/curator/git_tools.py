from pathlib import Path
import subprocess
from typing import Any


def clone_repo(repo_url: str, destination: str) -> dict[str, Any]:
    destination_path = Path(destination)

    if destination_path.exists():
        return {
            "status": "already_exists",
            "repo_url": repo_url,
            "clone_dir": str(destination_path),
            "message": "Clone skipped because the destination already exists.",
        }

    destination_path.parent.mkdir(parents=True, exist_ok=True)

    result = subprocess.run(
        ["git", "clone", repo_url, str(destination_path)],
        check=False,
        capture_output=True,
        text=True,
    )

    if result.returncode != 0:
        return {
            "status": "error",
            "repo_url": repo_url,
            "clone_dir": str(destination_path),
            "stderr": result.stderr.strip(),
        }

    return {
        "status": "cloned",
        "repo_url": repo_url,
        "clone_dir": str(destination_path),
        "stdout": result.stdout.strip(),
    }
