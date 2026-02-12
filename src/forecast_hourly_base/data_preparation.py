from __future__ import annotations

from pathlib import Path
from typing import Iterable, Optional, Sequence, Union

import numpy as np
import pandas as pd

from .create_dfs import create_inference_df, create_train_df


DEFAULT_DUMMY_COLS: tuple[str, ...] = ("hour", "dow", "month", "covid")

def _fill_numeric_median(df: pd.DataFrame, exclude: Optional[Iterable[str]] = None) -> pd.DataFrame:
    out = df.copy()
    exclude_set = set(exclude or [])

    for c in out.columns:
        if c in exclude_set:
            continue
        if pd.api.types.is_numeric_dtype(out[c]):
            non_na = out[c].dropna()
            fill_value = float(non_na.median()) if not non_na.empty else 0.0
            out[c] = out[c].fillna(fill_value)
    return out


def _one_hot_encode(
    df: pd.DataFrame,
    dummy_cols: Sequence[str],
    drop_first: bool,
    expected_dummy_cols: Optional[Sequence[str]] = None,
) -> pd.DataFrame:
    out = df.copy()
    cols = [c for c in dummy_cols if c in out.columns]

    if cols:
        out[cols] = out[cols].apply(lambda s: s.astype("category"))
        out = pd.get_dummies(out, columns=cols, drop_first=drop_first, dtype="int8")

    if expected_dummy_cols is not None:
        expected_set = list(expected_dummy_cols)
        for c in expected_set:
            if c not in out.columns:
                out[c] = 0

        protected = [c for c in ["date_hour", "ENTITY_DESCRIPTION_SHORT", "wait_time_avg"] if c in out.columns]
        passthrough = [c for c in out.columns if c not in expected_set and c not in protected]
        out = out[protected + passthrough + expected_set]

    return out


def _split_by_time_panel(
    df: pd.DataFrame,
    train_ratio: float,
    time_col: str = "date_hour",
) -> tuple[pd.DataFrame, pd.DataFrame]:
    if not 0 < train_ratio < 1:
        raise ValueError("train_ratio must be in (0, 1).")

    if time_col not in df.columns:
        raise ValueError(f"'{time_col}' column not found in dataframe.")

    ts = pd.to_datetime(df[time_col], errors="coerce")
    valid = ts.notna()
    if valid.sum() == 0:
        raise ValueError(f"No valid timestamps found in '{time_col}'.")

    unique_ts = pd.Series(ts[valid].sort_values().unique())
    if len(unique_ts) < 2:
        raise ValueError("Need at least 2 unique timestamps to split train/test.")

    split_idx = int(np.floor(len(unique_ts) * train_ratio))
    split_idx = min(max(split_idx, 1), len(unique_ts) - 1)
    split_ts = unique_ts.iloc[split_idx - 1]

    train_mask = ts <= split_ts
    test_mask = ts > split_ts

    train_df = df.loc[train_mask].copy()
    test_df = df.loc[test_mask].copy()

    return train_df.reset_index(drop=True), test_df.reset_index(drop=True)


def prepare_train_for_sarimax(
    data_dir: Union[str, Path] = "src/data",
    park_name: str = "PortAventura World",
    attraction_name: Optional[str] = None,   
    dummy_cols: Sequence[str] = DEFAULT_DUMMY_COLS,
    drop_first: bool = True,
    train_ratio: float = 0.8,
) -> dict[str, object]:
    """Build SARIMAX-ready panel train/test data from raw files.

    Returns a dict with:
    - full_df: prepared full panel dataframe
    - train_df: chronological train split (no shuffle)
    - test_df: chronological test split (no shuffle)
    - exog_cols: exogenous feature columns for SARIMAX
    - dummy_cols_created: one-hot columns created from dummy_cols
    - split_timestamp: last timestamp included in train
    """
    
    df = create_train_df(data_dir=data_dir, park_name=park_name)

    if attraction_name:
        attraction_name = str(attraction_name).strip()
        df = df[df["ENTITY_DESCRIPTION_SHORT"].astype(str).str.strip().eq(attraction_name)].copy()
        if df.empty:
            raise ValueError(f"No rows found for attraction_name='{attraction_name}'.")

    base_cols = [
        "date_hour",
        "ENTITY_DESCRIPTION_SHORT",
        "wait_time_avg",
    ]

    prepared = _one_hot_encode(df, dummy_cols=dummy_cols, drop_first=drop_first)
    prepared = _fill_numeric_median(prepared, exclude=base_cols)
    prepared = prepared.sort_values(["ENTITY_DESCRIPTION_SHORT", "date_hour"]).reset_index(drop=True)

    train_df, test_df = _split_by_time_panel(prepared, train_ratio=train_ratio, time_col="date_hour")

    non_exog = set(base_cols)
    exog_cols = [c for c in prepared.columns if c not in non_exog]

    dummy_prefixes = tuple(f"{c}_" for c in dummy_cols)
    dummy_cols_created = [c for c in prepared.columns if c.startswith(dummy_prefixes)]

    split_timestamp = pd.to_datetime(train_df["date_hour"], errors="coerce").max()

    return {
        "full_df": prepared,
        "train_df": train_df,
        "test_df": test_df,
        "exog_cols": exog_cols,
        "dummy_cols_created": dummy_cols_created,
        "split_timestamp": split_timestamp,
    }


def prepare_inference_for_sarimax(
    weather_forecast_df: pd.DataFrame,
    attendance_forecast_df: pd.DataFrame,
    attraction_name: str,
    previous_week_real_df: pd.DataFrame,
    month: Optional[Union[int, pd.Series, list[int], np.ndarray]] = None,
    dummy_cols: Sequence[str] = DEFAULT_DUMMY_COLS,
    drop_first: bool = True,
    train_feature_cols: Optional[Sequence[str]] = None,
) -> pd.DataFrame:
    """Build SARIMAX-ready inference frame aligned to training feature columns."""
    
    df = create_inference_df(
        weather_forecast_df=weather_forecast_df,
        attendance_forecast_df=attendance_forecast_df,
        attraction_name=attraction_name,
        previous_week_real_df=previous_week_real_df,
        month=month,
    )

    prepared = _one_hot_encode(
        df,
        dummy_cols=dummy_cols,
        drop_first=drop_first,
        expected_dummy_cols=[c for c in (train_feature_cols or []) if any(c.startswith(f"{d}_") for d in dummy_cols)] or None,
    )

    prepared = _fill_numeric_median(
        prepared,
        exclude=["date_hour", "ENTITY_DESCRIPTION_SHORT", "wait_time_avg"],
    )

    if train_feature_cols is not None:
        cols = list(train_feature_cols)
        for c in cols:
            if c not in prepared.columns:
                prepared[c] = 0
        extra = [c for c in prepared.columns if c not in cols and c not in ["date_hour", "ENTITY_DESCRIPTION_SHORT", "wait_time_avg"]]
        if extra:
            prepared = prepared.drop(columns=extra)

    prepared = prepared.sort_values(["ENTITY_DESCRIPTION_SHORT", "date_hour"]).reset_index(drop=True)
    return prepared


def split_panel_train_test(
    df: pd.DataFrame,
    train_ratio: float = 0.8,
    time_col: str = "date_hour",
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Chronological panel split without shuffling."""

    return _split_by_time_panel(df, train_ratio=train_ratio, time_col=time_col)
