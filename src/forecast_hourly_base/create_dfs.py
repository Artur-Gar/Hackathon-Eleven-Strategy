from __future__ import annotations

from pathlib import Path
from typing import Iterable, Optional, Union

import numpy as np
import pandas as pd

WEATHER_COLS = [
    "temp",
    "pressure",
    "humidity",
    "wind_speed",
    "clouds_all",
    "rain_1h",
]

ATTRACTION_FEATURE_COLS = ["guests_sum", "availability", "utilization"]

TRAIN_OUTPUT_COLS = [
    "date_hour",
    "ENTITY_DESCRIPTION_SHORT",
    "wait_time_avg",
    "hour",
    "dow",
    "month",
    "attendance",
    *WEATHER_COLS,
    *ATTRACTION_FEATURE_COLS,
    "covid"
]


def _require_cols(df: pd.DataFrame, cols: Iterable[str], df_name: str) -> None:
    missing = [c for c in cols if c not in df.columns]
    if missing:
        raise ValueError(f"{df_name} is missing required columns: {missing}")


def _safe_div(a: pd.Series, b: pd.Series) -> pd.Series:
    return a / b.replace(0, np.nan)


def _winsorize(s: pd.Series, p_low: float = 0.001, p_high: float = 0.999) -> pd.Series:
    non_na = s.dropna()
    if non_na.empty:
        return s
    lo = non_na.quantile(p_low)
    hi = non_na.quantile(p_high)
    return s.clip(lo, hi)


def _resolve_attendance_col(df: pd.DataFrame) -> Optional[str]:
    for c in ["attendance", "predcited_day_attendance", "predicted_day_attendance"]:
        if c in df.columns:
            return c
    return None


def _fill_with_median_or_zero(df: pd.DataFrame, cols: Iterable[str]) -> pd.DataFrame:
    for c in cols:
        if c not in df.columns:
            df[c] = np.nan
        df[c] = pd.to_numeric(df[c], errors="coerce")
        non_na = df[c].dropna()
        fill_value = float(non_na.median()) if not non_na.empty else 0.0
        df[c] = df[c].fillna(fill_value)
    return df


def _parse_link_attractions(link: pd.DataFrame, park_name: str) -> set[str]:
    link_col = link.columns[0]
    parts = link[link_col].astype(str).str.split(";", n=1, expand=True)
    if parts.shape[1] < 2:
        raise ValueError("link_attraction_park.csv: expected 'ATTRACTION;PARK' in first column.")

    parsed = link.copy()
    parsed["ATTRACTION"] = parts[0].str.strip()
    parsed["PARK"] = parts[1].str.strip()

    return set(parsed.loc[parsed["PARK"] == park_name, "ATTRACTION"].dropna().unique())


def _prepare_hourly_weather(weather_df: pd.DataFrame) -> pd.DataFrame:
    weather = weather_df.copy()

    dt_clean = weather["dt_iso"].astype(str).str.replace(" UTC", "", regex=False)
    weather["date_hour"] = pd.to_datetime(dt_clean, errors="coerce", utc=True).dt.tz_convert(None).dt.floor("h")

    weather = weather.dropna(subset=["date_hour"]).copy()

    for c in WEATHER_COLS:
        if c not in weather.columns:
            weather[c] = np.nan

    weather[WEATHER_COLS] = weather[WEATHER_COLS].apply(pd.to_numeric, errors="coerce")
    weather["rain_1h"] = weather["rain_1h"].fillna(0)
    
    return weather[["date_hour", *WEATHER_COLS]].sort_values("date_hour").reset_index(drop=True)


def _add_covid_period(
    df: pd.DataFrame,
    date_col: str = "date_hour",
    out_col: str = "covid",
    start: str | pd.Timestamp = "2020-03-11",
    end: str | pd.Timestamp = "2022-04-20",
) -> pd.DataFrame:
    """
    Add a binary COVID dummy column to a DataFrame.

    Rules (inclusive):
      - start <= date <= end  -> 1
      - otherwise            -> 0
    """
    out = df.copy()
    out[date_col] = pd.to_datetime(out[date_col])

    start_ts = pd.Timestamp(start)
    end_ts = pd.Timestamp(end)

    out[out_col] = ((out[date_col] >= start_ts) & (out[date_col] <= end_ts)).astype("int8")
    return out

def create_train_df(
    data_dir: Union[str, Path] = "src/data",
    park_name: str = "PortAventura World",
    winsorize_target: bool = True,
    clip_utilization: bool = True,
    clip_availability: bool = True,
) -> pd.DataFrame:
    """Build the hourly training dataframe with the requested columns."""
    data_dir = Path(data_dir)

    attendance = pd.read_csv(data_dir / "attendance.csv")
    link = pd.read_csv(data_dir / "link_attraction_park.csv")
    waiting = pd.read_csv(data_dir / "waiting_times.csv")
    weather = pd.read_csv(data_dir / "weather_data.csv")

    _require_cols(
        waiting,
        [
            "DEB_TIME",
            "ENTITY_DESCRIPTION_SHORT",
            "OPEN_TIME",
            "WAIT_TIME_MAX",
            "GUEST_CARRIED",
            "ADJUST_CAPACITY",
            "UP_TIME",
        ],
        "waiting_times.csv",
    )
    _require_cols(attendance, ["USAGE_DATE", "FACILITY_NAME"], "attendance.csv")

    pa_attractions = _parse_link_attractions(link, park_name)

    waiting = waiting.copy()
    waiting["ENTITY_DESCRIPTION_SHORT"] = waiting["ENTITY_DESCRIPTION_SHORT"].astype(str).str.strip()
    waiting = waiting[waiting["ENTITY_DESCRIPTION_SHORT"].isin(pa_attractions)].copy()
    
    waiting["DEB_TIME"] = pd.to_datetime(waiting["DEB_TIME"], errors="coerce")

    for c in ["OPEN_TIME", "WAIT_TIME_MAX", "GUEST_CARRIED", "ADJUST_CAPACITY", "UP_TIME"]:
        waiting[c] = pd.to_numeric(waiting[c], errors="coerce")

    waiting["ts"] = waiting["DEB_TIME"]
    waiting = waiting.dropna(subset=["ts"])
    waiting["date_hour"] = waiting["ts"].dt.floor("h")

    waiting_open = waiting[waiting["OPEN_TIME"] > 0].copy()

    hourly = (
        waiting_open.groupby(["date_hour", "ENTITY_DESCRIPTION_SHORT"], as_index=False)
        .agg(
            wait_time_avg=("WAIT_TIME_MAX", "mean"),
            guests_sum=("GUEST_CARRIED", "sum"),
            adjcap_sum=("ADJUST_CAPACITY", "sum"),
            open_min_sum=("OPEN_TIME", "sum"),
            up_min_sum=("UP_TIME", "sum"),
        )
    )

    hourly["wait_time_avg"] = pd.to_numeric(hourly["wait_time_avg"], errors="coerce")
    hourly = hourly.dropna(subset=["wait_time_avg"])
    if winsorize_target:
        hourly["wait_time_avg"] = _winsorize(hourly["wait_time_avg"])

    hourly["utilization"] = _safe_div(hourly["guests_sum"], hourly["adjcap_sum"])
    if clip_utilization:
        hourly["utilization"] = hourly["utilization"].clip(0.0, 5.0)

    hourly["availability"] = _safe_div(hourly["up_min_sum"], hourly["open_min_sum"])
    if clip_availability:
        hourly["availability"] = hourly["availability"].clip(0.0, 1.5)

    hourly["date_day"] = hourly["date_hour"].dt.floor("D")
    hourly["hour"] = pd.to_datetime(hourly["date_hour"]).dt.hour.astype(str)
    hourly["dow"] = hourly["date_hour"].dt.dayofweek.astype("int16")
    hourly["month"] = hourly["date_hour"].dt.month.astype("int16")

    attendance = attendance.copy()
    attendance["date_day"] = pd.to_datetime(attendance["USAGE_DATE"], errors="coerce").dt.floor("D")
    attendance = attendance[attendance["FACILITY_NAME"] == park_name].copy()

    attendance_col = _resolve_attendance_col(attendance)
    if attendance_col is None:
        raise ValueError("attendance.csv must contain one of: attendance, predcited_day_attendance, predicted_day_attendance")

    attendance["attendance"] = pd.to_numeric(attendance[attendance_col], errors="coerce")

    train_df = hourly.merge(attendance, on="date_day", how="left").drop(columns=["date_day"])

    weather_hourly = _prepare_hourly_weather(weather)
    train_df = train_df.merge(weather_hourly, on="date_hour", how="left")
    
    train_df = train_df.dropna(subset=["date_hour", "ENTITY_DESCRIPTION_SHORT", "wait_time_avg", "availability", "utilization", 'attendance'])
    train_df["ENTITY_DESCRIPTION_SHORT"] = train_df["ENTITY_DESCRIPTION_SHORT"].astype("category")

    train_df = _add_covid_period(train_df)
    
    train_df = train_df[TRAIN_OUTPUT_COLS].sort_values(["ENTITY_DESCRIPTION_SHORT", "date_hour"]).reset_index(drop=True)

    return train_df


### Inference
def _previous_week_daily_medians(previous_week_real_df: pd.DataFrame) -> dict[str, float]:
    _require_cols(previous_week_real_df, ["date_hour"], "previous_week_real_df")

    prev = previous_week_real_df.copy()
    prev["date_hour"] = pd.to_datetime(prev["date_hour"], errors="coerce")
    prev = prev.dropna(subset=["date_hour"])

    for c in ATTRACTION_FEATURE_COLS:
        prev[c] = pd.to_numeric(prev.get(c, np.nan), errors="coerce")

    if prev.empty:
        return {c: 0.0 for c in ATTRACTION_FEATURE_COLS}

    daily = prev.groupby(prev["date_hour"].dt.floor("D"))[ATTRACTION_FEATURE_COLS].median()
    return {c: float(daily[c].median()) if daily[c].notna().any() else 0.0 for c in ATTRACTION_FEATURE_COLS}


def create_inference_df(
    weather_forecast_df: pd.DataFrame,
    attendance_forecast_df: pd.DataFrame,
    attraction_name: str,
    previous_week_real_df: pd.DataFrame,
    month: Optional[Union[int, pd.Series, list[int], np.ndarray]] = None,
) -> pd.DataFrame:
    
    inference_df = _prepare_hourly_weather(weather_forecast_df).copy()
    inference_df["ENTITY_DESCRIPTION_SHORT"] = attraction_name
    inference_df["dow"] = inference_df["date_hour"].dt.dayofweek.astype("int16")
    inference_df["hour"] = pd.to_datetime(inference_df["date_hour"]).dt.hour.astype(str)

    if month is None:
        inference_df["month"] = inference_df["date_hour"].dt.month.astype("int16")
    elif np.isscalar(month):
        inference_df["month"] = int(month)
    else:
        month = pd.to_numeric(pd.Series(month), errors="coerce")
        if len(month) != len(inference_df):
            raise ValueError("month must have same length as forecast horizon.")
        inference_df["month"] = month.fillna(inference_df["date_hour"].dt.month).astype("int16")

    _require_cols(attendance_forecast_df, ["date"], "attendance_forecast_df")
    att_col = _resolve_attendance_col(attendance_forecast_df)
    if att_col is None:
        raise ValueError("attendance_forecast_df must contain attendance column.")

    attendance_daily = (
        attendance_forecast_df.copy()
        .assign(
            date_day=lambda d: pd.to_datetime(d["date"], errors="coerce").dt.floor("D"),
            attendance=lambda d: pd.to_numeric(d[att_col], errors="coerce"),
        )
    )

    inference_df = (
        inference_df.assign(date_day=lambda d: d["date_hour"].dt.floor("D"))
        .merge(attendance_daily, on="date_day", how="left")
    )

    fallback = _previous_week_daily_medians(previous_week_real_df)
    for c in ATTRACTION_FEATURE_COLS:
        if c not in inference_df.columns:
            inference_df[c] = np.nan
        inference_df[c] = pd.to_numeric(inference_df[c], errors="coerce").fillna(fallback.get(c, 0.0))

    inference_df = _fill_with_median_or_zero(inference_df, [*WEATHER_COLS, "attendance"])
    inference_df["wait_time_avg"] = np.nan

    inference_df = _add_covid_period(inference_df)

    hours = previous_week_real_df["date_hour"].dt.hour.unique()   # e.g., [6, 7, 8, ...]
    inference_df = inference_df[inference_df["date_hour"].dt.hour.isin(hours)].copy()

    inference_df = inference_df[TRAIN_OUTPUT_COLS].sort_values("date_hour").reset_index(drop=True)

    return inference_df
