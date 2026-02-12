from __future__ import annotations

from pathlib import Path
from typing import Any, Optional, Sequence, Union

import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingRegressor

from .data_preparation import prepare_train_for_sarimax


BASE_EXOG_COLS = [
    "attendance",
    "temp",
    "pressure",
    "humidity",
    "wind_speed",
    "clouds_all",
    "rain_1h",
    "snow_1h",
    "visibility",
    "guests_sum",
    "availability",
    "utilization",
]


class _ProgressBar:
    """Minimal console progress bar."""

    def __init__(self, total: int, label: str) -> None:
        self.total = max(int(total), 1)
        self.current = 0
        self.label = label
        self._render()

    def _render(self) -> None:
        width = 24
        ratio = min(self.current / self.total, 1.0)
        filled = int(width * ratio)
        bar = "#" * filled + "-" * (width - filled)
        pct = int(ratio * 100)
        print(f"\r{self.label}: [{bar}] {pct:3d}% ({self.current}/{self.total})", end="", flush=True)

    def step(self) -> None:
        self.current += 1
        self._render()

    def close(self) -> None:
        self._render()
        print()


def _require_cols(df: pd.DataFrame, cols: Sequence[str], df_name: str) -> None:
    missing = [c for c in cols if c not in df.columns]
    if missing:
        raise ValueError(f"{df_name} is missing required columns: {missing}")


def _select_feature_columns(df: pd.DataFrame) -> list[str]:
    base_cols = [c for c in BASE_EXOG_COLS if c in df.columns]
    dummy_cols = sorted(
        [
            c
            for c in df.columns
            if c.startswith("hour_") or c.startswith("dow_") or c.startswith("month_") or c.startswith("covid_")
        ]
    )
    return base_cols + dummy_cols


def _fill_numeric_median(df: pd.DataFrame, cols: Sequence[str]) -> pd.DataFrame:
    out = df.copy()
    for c in cols:
        if c not in out.columns:
            out[c] = 0.0
        out[c] = pd.to_numeric(out[c], errors="coerce")
        non_na = out[c].dropna()
        fill_value = float(non_na.median()) if not non_na.empty else 0.0
        out[c] = out[c].fillna(fill_value)
    return out


def _build_time_cv_folds(
    n_rows: int,
    validation_ratio: float = 0.2,
    cv_splits: int = 3,
    min_train_size: int = 50,
) -> list[tuple[np.ndarray, np.ndarray]]:
    if not 0 < validation_ratio < 1:
        raise ValueError("validation_ratio must be in (0, 1).")
    if cv_splits < 1:
        raise ValueError("cv_splits must be >= 1.")

    val_size = max(int(np.floor(n_rows * validation_ratio)), 1)
    if n_rows < min_train_size + val_size:
        raise ValueError(
            f"Not enough rows ({n_rows}) for CV. Need at least {min_train_size + val_size} rows."
        )

    max_folds = (n_rows - min_train_size) // val_size
    n_folds = min(cv_splits, max_folds)
    if n_folds < 1:
        raise ValueError("Unable to create chronological CV folds with current settings.")

    train_end = n_rows - n_folds * val_size
    if train_end < min_train_size:
        train_end = min_train_size

    folds: list[tuple[np.ndarray, np.ndarray]] = []
    for _ in range(n_folds):
        valid_end = train_end + val_size
        if valid_end > n_rows:
            break
        train_idx = np.arange(0, train_end)
        valid_idx = np.arange(train_end, valid_end)
        folds.append((train_idx, valid_idx))
        train_end = valid_end

    if not folds:
        raise ValueError("No CV folds created. Try fewer cv_splits or a smaller validation_ratio.")
    return folds


def _default_param_grid() -> list[dict[str, Any]]:
    return [
        {"n_estimators": 150, "learning_rate": 0.03, "max_depth": 2, "subsample": 1.0, "min_samples_leaf": 1},
        {"n_estimators": 250, "learning_rate": 0.03, "max_depth": 2, "subsample": 0.9, "min_samples_leaf": 1},
        {"n_estimators": 350, "learning_rate": 0.03, "max_depth": 2, "subsample": 0.8, "min_samples_leaf": 1},
        {"n_estimators": 200, "learning_rate": 0.05, "max_depth": 2, "subsample": 1.0, "min_samples_leaf": 1},
        {"n_estimators": 300, "learning_rate": 0.05, "max_depth": 2, "subsample": 0.9, "min_samples_leaf": 1},
        {"n_estimators": 400, "learning_rate": 0.05, "max_depth": 2, "subsample": 0.8, "min_samples_leaf": 1},
        {"n_estimators": 200, "learning_rate": 0.03, "max_depth": 3, "subsample": 1.0, "min_samples_leaf": 1},
        {"n_estimators": 300, "learning_rate": 0.03, "max_depth": 3, "subsample": 0.9, "min_samples_leaf": 1},
        {"n_estimators": 400, "learning_rate": 0.03, "max_depth": 3, "subsample": 0.8, "min_samples_leaf": 1},
        {"n_estimators": 250, "learning_rate": 0.05, "max_depth": 3, "subsample": 1.0, "min_samples_leaf": 2},
        {"n_estimators": 350, "learning_rate": 0.05, "max_depth": 3, "subsample": 0.9, "min_samples_leaf": 2},
        {"n_estimators": 450, "learning_rate": 0.03, "max_depth": 4, "subsample": 0.8, "min_samples_leaf": 2},
    ]


def gbm_train(
    train_df: pd.DataFrame,
    attraction_name: str,
    validation_ratio: float = 0.2,
    cv_splits: int = 3,
    param_grid: Optional[Sequence[dict[str, Any]]] = None,
    random_state: int = 42,
    show_progress: bool = True,
) -> dict[str, Any]:
    """Train one GBM model for a specific attraction using chronological CV."""
    _require_cols(train_df, ["date_hour", "ENTITY_DESCRIPTION_SHORT", "wait_time_avg"], "train_df")

    attraction_name = str(attraction_name).strip()
    subset = train_df.copy()
    subset["ENTITY_DESCRIPTION_SHORT"] = subset["ENTITY_DESCRIPTION_SHORT"].astype(str).str.strip()
    subset = subset[subset["ENTITY_DESCRIPTION_SHORT"].eq(attraction_name)].copy()

    if subset.empty:
        raise ValueError(f"No training rows found for attraction_name='{attraction_name}'.")

    subset["date_hour"] = pd.to_datetime(subset["date_hour"], errors="coerce")
    subset["wait_time_avg"] = pd.to_numeric(subset["wait_time_avg"], errors="coerce")
    subset = subset.dropna(subset=["date_hour", "wait_time_avg"]).copy()
    subset = subset.sort_values("date_hour").drop_duplicates("date_hour", keep="last").reset_index(drop=True)

    feature_cols = _select_feature_columns(subset)
    if not feature_cols:
        raise ValueError("No exogenous feature columns found for GBM training.")

    subset = _fill_numeric_median(subset, feature_cols)
    folds = _build_time_cv_folds(
        n_rows=len(subset),
        validation_ratio=validation_ratio,
        cv_splits=cv_splits,
    )

    candidates = list(param_grid) if param_grid is not None else _default_param_grid()
    if not candidates:
        raise ValueError("param_grid must contain at least one parameter set.")

    best_params: dict[str, Any] = {}
    best_mae = np.inf
    scores: list[dict[str, Any]] = []

    progress = _ProgressBar(len(candidates) * len(folds), label=f"GBM CV [{attraction_name}]") if show_progress else None
    for params in candidates:
        fold_mae: list[float] = []

        for train_idx, valid_idx in folds:
            fold_train = subset.iloc[train_idx]
            fold_valid = subset.iloc[valid_idx]

            X_train = fold_train[feature_cols]
            y_train = fold_train["wait_time_avg"]
            X_valid = fold_valid[feature_cols]
            y_valid = fold_valid["wait_time_avg"]

            model = GradientBoostingRegressor(random_state=random_state, **params)
            model.fit(X_train, y_train)
            pred_valid = model.predict(X_valid)
            mae = float(np.mean(np.abs(y_valid.to_numpy() - pred_valid)))
            fold_mae.append(mae)

            if progress is not None:
                progress.step()

        mean_mae = float(np.mean(fold_mae))
        scores.append({"params": dict(params), "mae": mean_mae, "fold_mae": fold_mae})

        if mean_mae < best_mae:
            best_mae = mean_mae
            best_params = dict(params)

    if progress is not None:
        progress.close()

    if not best_params:
        raise ValueError("Failed to train any GBM candidate model.")

    # Refit best params on full attraction training data.
    X_full = subset[feature_cols]
    y_full = subset["wait_time_avg"]
    best_model = GradientBoostingRegressor(random_state=random_state, **best_params)
    best_model.fit(X_full, y_full)

    return {
        "attraction_name": attraction_name,
        "model": best_model,
        "feature_cols": feature_cols,
        "best_params": best_params,
        "validation_mae": float(best_mae),
        "train_index": subset["date_hour"].copy(),
        "candidate_scores": scores,
    }


def prepare_and_train_gbm(
    data_dir: Union[str, Path] = "src/data",
    park_name: str = "PortAventura World",
    attraction_name: str = "",
    train_ratio: float = 0.8,
    validation_ratio: float = 0.2,
    cv_splits: int = 3,
    param_grid: Optional[Sequence[dict[str, Any]]] = None,
    random_state: int = 42,
    show_progress: bool = True,
) -> dict[str, Any]:
    """Prepare hourly data via data_preparation.py and train GBM for one attraction."""
    if not attraction_name:
        raise ValueError("attraction_name must be provided.")

    prepared = prepare_train_for_sarimax(
        data_dir=data_dir,
        park_name=park_name,
        attraction_name=attraction_name,
        train_ratio=train_ratio,
    )

    trained = gbm_train(
        prepared["train_df"],
        attraction_name=attraction_name,
        validation_ratio=validation_ratio,
        cv_splits=cv_splits,
        param_grid=param_grid,
        random_state=random_state,
        show_progress=show_progress,
    )

    return {
        "trained": trained,
        "train_df": prepared["train_df"],
        "test_df": prepared["test_df"],
        "split_timestamp": prepared["split_timestamp"],
    }


def gbm_predict(model_bundle: dict[str, Any], df: pd.DataFrame) -> pd.Series:
    """Predict with a trained GBM model while safely aligning feature columns."""
    if "model" not in model_bundle:
        raise ValueError("model_bundle must contain key 'model'.")
    if "feature_cols" not in model_bundle:
        raise ValueError("model_bundle must contain key 'feature_cols'.")

    model = model_bundle["model"]
    feature_cols = list(model_bundle["feature_cols"])

    X = df.copy()
    for c in feature_cols:
        if c not in X.columns:
            X[c] = 0.0

    X = _fill_numeric_median(X, feature_cols)
    X = X[feature_cols]

    pred = model.predict(X)
    return pd.Series(pred, index=df.index, name="y_pred")
