from __future__ import annotations

from pathlib import Path
from typing import Any, Callable, Optional, Sequence, Union

import numpy as np
import pandas as pd
from statsmodels.tsa.statespace.sarimax import SARIMAX

from .data_preparation import prepare_train_df


# Required exogenous regressors.
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

DEFAULT_ORDER = (1, 0, 1)
DEFAULT_ORDER_GRID = [(p, d, q) for p in (0, 1, 2) for d in (0, 1) for q in (0, 1, 2)]


class _FitProgress:
    """Minimal console progress bar for optimizer iterations."""

    def __init__(self, total: int, label: str = "SARIMAX fit") -> None:
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


def _select_exog_columns(df: pd.DataFrame) -> list[str]:
    base_cols = [c for c in BASE_EXOG_COLS if c in df.columns]
    dummy_cols = sorted([c for c in df.columns if c.startswith("dow_") or c.startswith("month_") or c.startswith("covid_")])

    # Seasonality is handled via dummy variables, so keep any encoded dow/month/covid dummies when present.
    return base_cols + dummy_cols


def _fit_one_sarimax(
    y: pd.Series,
    exog: Optional[pd.DataFrame],
    order: tuple[int, int, int],
    maxiter: int,
    callback: Optional[Callable[..., None]] = None,
):
    model = SARIMAX(
        endog=y,
        exog=exog,
        order=order,
        seasonal_order=(0, 0, 0, 0),
        enforce_stationarity=False,
        enforce_invertibility=False,
    )

    fit_kwargs: dict[str, Any] = {
        "method": "lbfgs",
        "maxiter": maxiter,
        "disp": False,
    }
    if callback is not None:
        fit_kwargs["callback"] = callback

    return model.fit(**fit_kwargs)


def sarimax_train(
    train_df: pd.DataFrame,
    attraction_name: str,
    maxiter: int = 100,
    show_progress: bool = True,
    validation_ratio: float = 0.2,
    order_grid: Optional[Sequence[tuple[int, int, int]]] = None,
    search_maxiter: Optional[int] = None,
):
    """Train a non-seasonal SARIMAX model for one attraction on hourly data.

    Order selection is done on the full attraction training series by minimum AIC.
    ``validation_ratio`` is kept for API compatibility and ignored.
    """
    _ = validation_ratio
    if search_maxiter is None:
        search_maxiter = maxiter

    required_cols = ["date_hour", "ENTITY_DESCRIPTION_SHORT", "wait_time_avg"]
    missing = [c for c in required_cols if c not in train_df.columns]
    if missing:
        raise ValueError(f"train_df is missing required columns: {missing}")

    subset = train_df.copy()
    subset["ENTITY_DESCRIPTION_SHORT"] = subset["ENTITY_DESCRIPTION_SHORT"].astype(str).str.strip()
    attraction_name = str(attraction_name).strip()
    subset = subset[subset["ENTITY_DESCRIPTION_SHORT"].eq(attraction_name)].copy()

    if subset.empty:
        raise ValueError(f"No training rows found for attraction_name='{attraction_name}'.")

    subset["date_hour"] = pd.to_datetime(subset["date_hour"], errors="coerce")
    subset["wait_time_avg"] = pd.to_numeric(subset["wait_time_avg"], errors="coerce")
    subset = subset.dropna(subset=["date_hour", "wait_time_avg"]).copy()
    subset = subset.sort_values("date_hour").drop_duplicates("date_hour", keep="last")
    time_index = subset["date_hour"].copy()
    subset = subset.reset_index(drop=True)

    exog_cols = _select_exog_columns(subset)
    exog = None
    if exog_cols:
        exog = subset[exog_cols].apply(pd.to_numeric, errors="coerce")
        for c in exog.columns:
            non_na = exog[c].dropna()
            fill_value = float(non_na.median()) if not non_na.empty else 0.0
            exog[c] = exog[c].fillna(fill_value)

    y = subset["wait_time_avg"]
    if len(y) < 10:
        raise ValueError("Not enough observations to train SARIMAX. Need at least 10 rows.")

    grid = list(order_grid) if order_grid is not None else list(DEFAULT_ORDER_GRID)
    if not grid:
        raise ValueError("order_grid must contain at least one (p,d,q) tuple.")

    best_order = DEFAULT_ORDER
    best_aic = np.inf
    best_results = None
    order_scores: list[dict[str, Any]] = []

    search_progress = _FitProgress(len(grid), label=f"Order search [{attraction_name}]") if show_progress else None
    try:
        for order in grid:
            try:
                fitted = _fit_one_sarimax(
                    y=y,
                    exog=exog,
                    order=order,
                    maxiter=search_maxiter,
                )
                aic = float(fitted.aic)
                order_scores.append({"order": order, "aic": aic})
                if np.isfinite(aic) and aic < best_aic:
                    best_aic = aic
                    best_order = order
                    best_results = fitted
            except Exception as ex:
                order_scores.append({"order": order, "aic": np.nan, "error": str(ex)})
            finally:
                if search_progress is not None:
                    search_progress.step()
    finally:
        if search_progress is not None:
            search_progress.close()

    if best_results is None:
        raise ValueError("All SARIMAX orders failed during search; no model was fitted successfully.")

    if show_progress:
        msg_aic = "nan" if not np.isfinite(best_aic) else f"{best_aic:.3f}"
        print(f"Selected order for {attraction_name}: {best_order} (AIC={msg_aic})")
        print("Using cached best model from order search (no second fit).")

    results = best_results

    return {
        "attraction_name": attraction_name,
        "model": results,
        "exog_cols": exog_cols,
        "train_index": time_index,
        "order": best_order,
        "best_aic": None if not np.isfinite(best_aic) else float(best_aic),
        "validation_mae": None,
        "order_scores": order_scores,
    }


def prepare_and_train_sarimax(
    data_dir: Union[str, Path] = "modeling/data",
    park_name: str = "PortAventura World",
    attraction_name: str = "",
    train_ratio: float = 0.8,
    maxiter: int = 100,
    show_progress: bool = True,
    validation_ratio: float = 0.2,
    order_grid: Optional[Sequence[tuple[int, int, int]]] = None,
    search_maxiter: Optional[int] = None,
) -> dict[str, Any]:
    """Prepare hourly train/test data and train SARIMAX for one attraction."""
    if not attraction_name:
        raise ValueError("attraction_name must be provided.")

    prepared = prepare_train_df(
        data_dir=data_dir,
        park_name=park_name,
        attraction_name=attraction_name,
        train_ratio=train_ratio,
    )

    trained = sarimax_train(
        prepared["train_df"],
        attraction_name=attraction_name,
        maxiter=maxiter,
        show_progress=show_progress,
        validation_ratio=validation_ratio,
        order_grid=order_grid,
        search_maxiter=search_maxiter,
    )

    return {
        "trained": trained,
        "train_df": prepared["train_df"],
        "test_df": prepared["test_df"],
        "split_timestamp": prepared["split_timestamp"],
    }
