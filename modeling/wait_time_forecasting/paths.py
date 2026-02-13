from __future__ import annotations

import sys
from pathlib import Path
from typing import Optional


def find_project_root(start: Optional[Path] = None, marker: str = "pyproject.toml") -> Path:
    """Find the repository root by walking upward until marker is found."""
    current = (Path(start) if start is not None else Path.cwd()).resolve()
    for candidate in (current, *current.parents):
        if (candidate / marker).exists():
            return candidate
    raise FileNotFoundError(
        f"Could not find project root from {current} using marker '{marker}'."
    )


def ensure_notebook_import_paths(project_root: Optional[Path] = None) -> Path:
    """Ensure both project root and modeling root are importable."""
    root = (Path(project_root).resolve() if project_root is not None else find_project_root())
    modeling_root = root / "modeling"

    for path in (root, modeling_root):
        path_str = str(path)
        if path.exists() and path_str not in sys.path:
            sys.path.insert(0, path_str)

    return root


def resolve_data_dir(project_root: Optional[Path] = None) -> Path:
    """Resolve the data directory used by notebooks and scripts."""
    root = (Path(project_root).resolve() if project_root is not None else find_project_root())
    candidates = [root / "modeling" / "data" / "raw", root / "data" / "raw"]

    for candidate in candidates:
        if candidate.exists():
            return candidate

    raise FileNotFoundError(f"No data directory found in: {candidates}")


def resolve_models_dir(project_root: Optional[Path] = None, create: bool = False) -> Path:
    """Resolve the models output directory."""
    root = (Path(project_root).resolve() if project_root is not None else find_project_root())
    models_dir = root / "modeling" / "artifacts" / "models"
    legacy_models_dir = root / "modeling" / "models"

    if create:
        models_dir.mkdir(parents=True, exist_ok=True)

    if models_dir.exists():
        return models_dir
    if legacy_models_dir.exists():
        return legacy_models_dir
    return models_dir


def notebook_context(
    project_root: Optional[Path] = None,
    create_models_dir: bool = False,
) -> dict[str, Path]:
    """Standard notebook bootstrap context."""
    root = ensure_notebook_import_paths(project_root=project_root)
    return {
        "project_root": root,
        "data_dir": resolve_data_dir(root),
        "models_dir": resolve_models_dir(root, create=create_models_dir),
    }
