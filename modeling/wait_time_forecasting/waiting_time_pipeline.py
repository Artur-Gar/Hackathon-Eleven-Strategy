from __future__ import annotations

import re
import sys
from pathlib import Path
from typing import Any, Optional, Sequence, Union

import numpy as np
import pandas as pd

PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

try:
    from .create_dfs import create_train_df
    from .data_preparation import prepare_df_for_inference
    from .gradient_boosting_attendance import (
        MODEL_FILENAME as ATTENDANCE_MODEL_FILENAME,
        load_model_bundle as load_attendance_model_bundle,
        run_attendance_inference,
    )
    from .gradient_boosting_waiting_time import (
        DEFAULT_FORECAST_HORIZON_DAYS,
        DEFAULT_PARK_NAME,
        _resolve_raw_data_dir,
        forecast_wait_times,
        load_model_bundle,
    )
except ImportError:  # pragma: no cover - supports direct script execution
    from modeling.wait_time_forecasting.create_dfs import create_train_df
    from modeling.wait_time_forecasting.data_preparation import prepare_df_for_inference
    from modeling.wait_time_forecasting.gradient_boosting_attendance import (
        MODEL_FILENAME as ATTENDANCE_MODEL_FILENAME,
        load_model_bundle as load_attendance_model_bundle,
        run_attendance_inference,
    )
    from modeling.wait_time_forecasting.gradient_boosting_waiting_time import (
        DEFAULT_FORECAST_HORIZON_DAYS,
        DEFAULT_PARK_NAME,
        _resolve_raw_data_dir,
        forecast_wait_times,
        load_model_bundle,
    )


DEFAULT_WEATHER_FORECAST_PATH = PROJECT_ROOT / "modeling" / "data" / "processed" / "weather_forecasted_data.csv"
DEFAULT_FORECAST_OUTPUT_DIR = PROJECT_ROOT / "modeling" / "data" / "forecasts"
DEFAULT_PROCESSED_OUTPUT_DIR = PROJECT_ROOT / "modeling" / "data" / "processed"
DEFAULT_WAIT_TIMES_OUTPUT_PATH = DEFAULT_PROCESSED_OUTPUT_DIR / "wait-times.csv"
WEATHER_COLS = ["temp", "pressure", "humidity", "wind_speed", "clouds_all", "rain_1h", "snow_1h", "visibility"]


def _require_cols(df: pd.DataFrame, cols: Sequence[str], df_name: str) -> None:
    missing = [c for c in cols if c not in df.columns]
    if missing:
        raise ValueError(f"{df_name} is missing required columns: {missing}")


def _load_default_attendance_history(raw_data_dir: Path, park_name: str) -> pd.DataFrame:
    attendance = pd.read_csv(raw_data_dir / "attendance.csv")
    _require_cols(attendance, ["USAGE_DATE", "FACILITY_NAME"], "attendance.csv")

    attendance_col = None
    for c in ["attendance", "predcited_day_attendance", "predicted_day_attendance"]:
        if c in attendance.columns:
            attendance_col = c
            break
    if attendance_col is None:
        raise ValueError(
            "attendance.csv must contain one of: attendance, predcited_day_attendance, predicted_day_attendance"
        )

    out = attendance.copy()
    out["FACILITY_NAME"] = out["FACILITY_NAME"].astype(str).str.strip()
    out = out[out["FACILITY_NAME"].eq(str(park_name).strip())].copy()
    out["date"] = pd.to_datetime(out["USAGE_DATE"], errors="coerce").dt.floor("D")
    out["attendance"] = pd.to_numeric(out[attendance_col], errors="coerce")
    out = out.dropna(subset=["date"])
    return out[["date", "attendance"]].drop_duplicates(subset=["date"], keep="last").reset_index(drop=True)


def _normalize_open_meteo_forecast(raw_df: pd.DataFrame) -> pd.DataFrame:
    temp_candidates = [col for col in raw_df.columns if str(col).startswith("temperature_2m")]
    temp_col = temp_candidates[0] if temp_candidates else None

    open_meteo_cols = [
        "time",
        "rain (mm)",
        "relative_humidity_2m (%)",
        "pressure_msl (hPa)",
        "cloud_cover (%)",
        "wind_speed_10m (m/s)",
    ]
    _require_cols(raw_df, open_meteo_cols, "weather_forecasted_data.csv")
    if temp_col is None:
        raise ValueError(
            "weather_forecasted_data.csv is missing temperature column: expected a column "
            "starting with 'temperature_2m'"
        )

    out = pd.DataFrame()
    out["dt_iso"] = pd.to_datetime(raw_df["time"], errors="coerce").dt.strftime("%Y-%m-%d %H:%M:%S +0000 UTC")
    out["temp"] = pd.to_numeric(raw_df[temp_col], errors="coerce")
    out["pressure"] = pd.to_numeric(raw_df["pressure_msl (hPa)"], errors="coerce")
    out["humidity"] = pd.to_numeric(raw_df["relative_humidity_2m (%)"], errors="coerce")
    out["wind_speed"] = pd.to_numeric(raw_df["wind_speed_10m (m/s)"], errors="coerce")
    out["clouds_all"] = pd.to_numeric(raw_df["cloud_cover (%)"], errors="coerce")
    out["rain_1h"] = pd.to_numeric(raw_df["rain (mm)"], errors="coerce").fillna(0.0)
    out["snow_1h"] = 0.0
    out["visibility"] = np.nan
    return out


def _load_weather_forecast_csv(weather_forecast_path: Path) -> pd.DataFrame:
    try:
        raw = pd.read_csv(weather_forecast_path)
    except pd.errors.ParserError:
        # Open-Meteo export has 2 metadata lines + empty line before hourly table.
        raw = pd.read_csv(weather_forecast_path, skiprows=3)

    if "dt_iso" in raw.columns:
        return raw
    if "time" in raw.columns:
        return _normalize_open_meteo_forecast(raw)

    raise ValueError(
        "weather_forecasted_data.csv must contain either 'dt_iso' (OpenWeather style) "
        "or Open-Meteo hourly columns starting with 'time'."
    )


def _prepare_weather_window(
    weather_forecast_df: pd.DataFrame,
    forecast_start: pd.Timestamp,
    forecast_end: pd.Timestamp,
) -> pd.DataFrame:
    _require_cols(weather_forecast_df, ["dt_iso"], "weather_forecasted_data.csv")

    raw = weather_forecast_df.copy()
    dt_clean = raw["dt_iso"].astype(str).str.replace(" UTC", "", regex=False)
    raw["date_hour"] = pd.to_datetime(dt_clean, errors="coerce", utc=True).dt.tz_convert(None).dt.floor("h")
    raw = raw.dropna(subset=["date_hour"]).copy()

    for col in WEATHER_COLS:
        if col not in raw.columns:
            raw[col] = np.nan
    raw[WEATHER_COLS] = raw[WEATHER_COLS].apply(pd.to_numeric, errors="coerce")

    mask = (raw["date_hour"] >= forecast_start) & (raw["date_hour"] <= forecast_end)
    out = raw.loc[mask].copy()
    if out.empty:
        raise ValueError(
            f"No weather rows available for forecast window {forecast_start} to {forecast_end}."
        )
    return out.drop(columns=["date_hour"])


def _align_attendance_to_days(
    forecast_days: pd.Series,
    attendance_forecast_df: pd.DataFrame,
    raw_data_dir: Path,
    park_name: str,
) -> pd.DataFrame:
    days = pd.to_datetime(forecast_days, errors="coerce").dt.floor("D")
    days = days.dropna().drop_duplicates().sort_values()
    if days.empty:
        raise ValueError("No forecast days provided for attendance alignment.")

    out = pd.DataFrame({"date": days})

    attendance = attendance_forecast_df.copy()
    _require_cols(attendance, ["date", "attendance"], "attendance_forecast_df")
    attendance["date"] = pd.to_datetime(attendance["date"], errors="coerce").dt.floor("D")
    attendance["attendance"] = pd.to_numeric(attendance["attendance"], errors="coerce")
    attendance = attendance.dropna(subset=["date"]).sort_values("date")
    attendance = attendance.drop_duplicates(subset=["date"], keep="last")
    att_map = attendance.set_index("date")["attendance"]
    out["attendance"] = pd.to_numeric(out["date"].map(att_map), errors="coerce")

    fallback = _load_default_attendance_history(raw_data_dir, park_name=park_name)
    fallback["date"] = pd.to_datetime(fallback["date"], errors="coerce").dt.floor("D")
    fallback_map = fallback.set_index("date")["attendance"]
    out["attendance"] = out["attendance"].fillna(out["date"].map(fallback_map))
    out["attendance"] = out["attendance"].ffill().bfill().fillna(0.0)
    return out


def _build_attendance_forecast_for_days(
    forecast_days: pd.Series,
    raw_data_dir: Path,
    park_name: str,
    attendance_model_filename: str,
) -> pd.DataFrame:
    attendance_model_bundle, _ = load_attendance_model_bundle(model_filename=attendance_model_filename)

    forecast_days = pd.to_datetime(forecast_days, errors="coerce").dt.floor("D")
    forecast_days = forecast_days.dropna().drop_duplicates().sort_values()
    if forecast_days.empty:
        raise ValueError("No forecast days provided for attendance forecasting.")

    attendance_pred = run_attendance_inference(
        model_bundle=attendance_model_bundle,
        data_dir=raw_data_dir,
        park_name=park_name,
        horizon_days=max(len(forecast_days), 1),
    )
    attendance_pred = attendance_pred.copy()
    attendance_pred["date"] = pd.to_datetime(attendance_pred["date"], errors="coerce").dt.floor("D")
    attendance_pred["attendance"] = pd.to_numeric(attendance_pred.get("predicted"), errors="coerce")
    attendance_pred = attendance_pred[["date", "attendance"]]

    return _align_attendance_to_days(
        forecast_days=forecast_days,
        attendance_forecast_df=attendance_pred,
        raw_data_dir=raw_data_dir,
        park_name=park_name,
    )


def _save_waiting_forecast(
    attraction_name: str,
    forecast_df: pd.DataFrame,
    output_dir: Path = DEFAULT_FORECAST_OUTPUT_DIR,
) -> Path:
    if forecast_df.empty:
        raise ValueError("forecast_df is empty, cannot save forecast.")

    output_dir.mkdir(parents=True, exist_ok=True)
    first_day = pd.to_datetime(forecast_df["date_hour"], errors="coerce").min()
    if pd.isna(first_day):
        raise ValueError("forecast_df does not contain a valid 'date_hour'.")

    date_tag = pd.Timestamp(first_day).strftime("%d_%m_%Y")
    attraction_tag = re.sub(r"\s+", "_", str(attraction_name).strip())
    file_path = output_dir / f"{attraction_tag}_waiting_{date_tag}.csv"
    forecast_df.to_csv(file_path, index=False)
    return file_path


def build_wait_times_csv_from_forecasts(
    forecast_paths: Sequence[Path],
    output_path: Path = DEFAULT_WAIT_TIMES_OUTPUT_PATH,
) -> Path:
    if not forecast_paths:
        raise ValueError("forecast_paths is empty, cannot build wait-times.csv")

    parts: list[pd.DataFrame] = []
    for path in forecast_paths:
        fpath = Path(path)
        if not fpath.exists():
            raise FileNotFoundError(f"Missing forecast file: {fpath}")

        df = pd.read_csv(fpath)
        _require_cols(df, ["date_hour", "ENTITY_DESCRIPTION_SHORT"], fpath.name)

        if "pred_wait_time" in df.columns:
            source_col = "pred_wait_time"
        elif "WAIT_TIME_MAX" in df.columns:
            source_col = "WAIT_TIME_MAX"
        else:
            raise ValueError(
                f"{fpath.name} must contain either 'pred_wait_time' or 'WAIT_TIME_MAX'."
            )

        part = df[["date_hour", "ENTITY_DESCRIPTION_SHORT", source_col]].copy()
        part = part.rename(columns={source_col: "WAIT_TIME_MAX"})
        parts.append(part)

    combined = pd.concat(parts, ignore_index=True)
    combined["date_hour"] = pd.to_datetime(combined["date_hour"], errors="coerce")
    combined["ENTITY_DESCRIPTION_SHORT"] = combined["ENTITY_DESCRIPTION_SHORT"].astype(str).str.strip()
    combined["WAIT_TIME_MAX"] = pd.to_numeric(combined["WAIT_TIME_MAX"], errors="coerce")
    combined = combined.dropna(subset=["date_hour", "ENTITY_DESCRIPTION_SHORT", "WAIT_TIME_MAX"]).copy()

    # WAIT_TIME_MAX in UI feed should be non-negative integer minutes.
    combined["WAIT_TIME_MAX"] = np.clip(np.rint(combined["WAIT_TIME_MAX"]), 0, None).astype(int)

    wait_times_df = pd.DataFrame(
        {
            "WORK_DATE": combined["date_hour"].dt.strftime("%Y-%m-%d"),
            "DEB_TIME": combined["date_hour"].dt.strftime("%Y-%m-%d %H:%M:%S.000"),
            "ENTITY_DESCRIPTION_SHORT": combined["ENTITY_DESCRIPTION_SHORT"],
            "WAIT_TIME_MAX": combined["WAIT_TIME_MAX"],
        }
    )
    wait_times_df = wait_times_df.sort_values(
        ["WORK_DATE", "DEB_TIME", "ENTITY_DESCRIPTION_SHORT"]
    ).reset_index(drop=True)

    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    wait_times_df.to_csv(output_path, index=False)
    return output_path


def _build_base_waiting_inputs_for_attraction(
    model_bundle: dict[str, Any],
    attraction_name: str,
    raw_data_dir: Path,
    park_name: str,
    horizon_days: int,
    weather_forecast_path: Path,
    historical_df: Optional[pd.DataFrame] = None,
) -> dict[str, Any]:
    history = historical_df.copy() if historical_df is not None else create_train_df(data_dir=raw_data_dir, park_name=park_name)
    history["ENTITY_DESCRIPTION_SHORT"] = history["ENTITY_DESCRIPTION_SHORT"].astype(str).str.strip()
    history["date_hour"] = pd.to_datetime(history["date_hour"], errors="coerce")
    history = history.dropna(subset=["date_hour"])
    history = history[history["ENTITY_DESCRIPTION_SHORT"].eq(str(attraction_name).strip())].copy()
    history = history.sort_values("date_hour")
    if history.empty:
        raise ValueError(f"No historical rows found for attraction '{attraction_name}'.")

    last_ts = history["date_hour"].max()
    forecast_start = last_ts + pd.Timedelta(hours=1)
    forecast_end = forecast_start + pd.Timedelta(days=horizon_days) - pd.Timedelta(hours=1)

    previous_week_real_df = history[history["date_hour"] <= last_ts].tail(24 * 7).copy()
    if previous_week_real_df.empty:
        raise ValueError(f"Not enough previous data for attraction '{attraction_name}'.")

    weather_forecast_df = _load_weather_forecast_csv(weather_forecast_path)
    weather_window_raw = _prepare_weather_window(
        weather_forecast_df=weather_forecast_df,
        forecast_start=forecast_start,
        forecast_end=forecast_end,
    )

    dt_clean = weather_window_raw["dt_iso"].astype(str).str.replace(" UTC", "", regex=False)
    weather_days = pd.to_datetime(dt_clean, errors="coerce", utc=True).dt.tz_convert(None).dt.floor("D")
    placeholder_attendance = pd.DataFrame(
        {"date": weather_days.dropna().drop_duplicates().sort_values(), "attendance": 0.0}
    )
    base_inference_df = prepare_df_for_inference(
        weather_forecast_df=weather_window_raw,
        attendance_forecast_df=placeholder_attendance,
        attraction_name=attraction_name,
        previous_week_real_df=previous_week_real_df,
        train_feature_cols=model_bundle.get("feature_cols"),
    )
    forecast_days = pd.to_datetime(base_inference_df["date_hour"], errors="coerce").dt.floor("D")

    return {
        "previous_week_real_df": previous_week_real_df,
        "weather_forecast_df": weather_window_raw,
        "forecast_days": forecast_days,
    }


def build_waiting_inputs_for_attraction(
    model_bundle: dict[str, Any],
    attraction_name: str,
    data_dir: Optional[Union[str, Path]] = None,
    park_name: str = DEFAULT_PARK_NAME,
    horizon_days: int = DEFAULT_FORECAST_HORIZON_DAYS,
    weather_forecast_path: Path = DEFAULT_WEATHER_FORECAST_PATH,
    attendance_model_filename: str = ATTENDANCE_MODEL_FILENAME,
    historical_df: Optional[pd.DataFrame] = None,
    precomputed_attendance_forecast_df: Optional[pd.DataFrame] = None,
) -> dict[str, pd.DataFrame]:
    raw_data_dir = _resolve_raw_data_dir(data_dir)

    base_inputs = _build_base_waiting_inputs_for_attraction(
        model_bundle=model_bundle,
        attraction_name=attraction_name,
        raw_data_dir=raw_data_dir,
        park_name=park_name,
        horizon_days=horizon_days,
        weather_forecast_path=weather_forecast_path,
        historical_df=historical_df,
    )

    if precomputed_attendance_forecast_df is None:
        attendance_forecast_df = _build_attendance_forecast_for_days(
            forecast_days=base_inputs["forecast_days"],
            raw_data_dir=raw_data_dir,
            park_name=park_name,
            attendance_model_filename=attendance_model_filename,
        )
    else:
        attendance_forecast_df = _align_attendance_to_days(
            forecast_days=base_inputs["forecast_days"],
            attendance_forecast_df=precomputed_attendance_forecast_df,
            raw_data_dir=raw_data_dir,
            park_name=park_name,
        )

    return {
        "previous_week_real_df": base_inputs["previous_week_real_df"],
        "weather_forecast_df": base_inputs["weather_forecast_df"],
        "attendance_forecast_df": attendance_forecast_df,
    }


def forecast_for_attractions(
    model_bundles: dict[str, dict[str, Any]],
    data_dir: Optional[Union[str, Path]] = None,
    park_name: str = DEFAULT_PARK_NAME,
    horizon_days: int = DEFAULT_FORECAST_HORIZON_DAYS,
    weather_forecast_path: Path = DEFAULT_WEATHER_FORECAST_PATH,
    attendance_model_filename: str = ATTENDANCE_MODEL_FILENAME,
    output_dir: Path = DEFAULT_FORECAST_OUTPUT_DIR,
) -> pd.DataFrame:
    if not model_bundles:
        raise ValueError("model_bundles is empty.")

    raw_data_dir = _resolve_raw_data_dir(data_dir)
    historical_df = create_train_df(data_dir=raw_data_dir, park_name=park_name)

    base_inputs_by_attraction: dict[str, dict[str, Any]] = {}
    forecast_day_chunks: list[pd.Series] = []
    skipped_for_weather: list[tuple[str, str]] = []

    for attraction_name, model_bundle in model_bundles.items():
        try:
            base_inputs = _build_base_waiting_inputs_for_attraction(
                model_bundle=model_bundle,
                attraction_name=attraction_name,
                raw_data_dir=raw_data_dir,
                park_name=park_name,
                horizon_days=horizon_days,
                weather_forecast_path=weather_forecast_path,
                historical_df=historical_df,
            )
        except ValueError as exc:
            message = str(exc)
            if "No weather rows available for forecast window" in message:
                skipped_for_weather.append((attraction_name, message))
                print(f"Skipping {attraction_name}: {message}")
                continue
            raise

        base_inputs_by_attraction[attraction_name] = base_inputs
        forecast_day_chunks.append(pd.to_datetime(base_inputs["forecast_days"], errors="coerce").dt.floor("D"))

    if not forecast_day_chunks:
        skipped_names = ", ".join(name for name, _ in skipped_for_weather) if skipped_for_weather else "none"
        raise ValueError(
            "No compatible attractions for the available weather window. "
            f"Skipped attractions: {skipped_names}"
        )

    all_forecast_days = pd.concat(forecast_day_chunks, ignore_index=True)
    shared_attendance_forecast_df = _build_attendance_forecast_for_days(
        forecast_days=all_forecast_days,
        raw_data_dir=raw_data_dir,
        park_name=park_name,
        attendance_model_filename=attendance_model_filename,
    )
    print(
        "Computed attendance forecast once "
        f"for {shared_attendance_forecast_df['date'].nunique()} day(s)."
    )

    all_forecasts: list[pd.DataFrame] = []
    saved_forecast_paths: list[Path] = []
    for attraction_name, base_inputs in base_inputs_by_attraction.items():
        model_bundle = model_bundles[attraction_name]
        attendance_for_attraction = _align_attendance_to_days(
            forecast_days=base_inputs["forecast_days"],
            attendance_forecast_df=shared_attendance_forecast_df,
            raw_data_dir=raw_data_dir,
            park_name=park_name,
        )

        forecast_df = forecast_wait_times(
            model_bundle=model_bundle,
            attraction_name=attraction_name,
            previous_week_real_df=base_inputs["previous_week_real_df"],
            weather_forecast_df=base_inputs["weather_forecast_df"],
            attendance_forecast_df=attendance_for_attraction,
        )

        save_path = _save_waiting_forecast(
            attraction_name=attraction_name,
            forecast_df=forecast_df,
            output_dir=output_dir,
        )
        print(f"Saved forecast for {attraction_name}: {save_path}")
        saved_forecast_paths.append(save_path)
        all_forecasts.append(forecast_df)

    out = pd.concat(all_forecasts, ignore_index=True)
    out["date_hour"] = pd.to_datetime(out["date_hour"], errors="coerce")
    result = out.sort_values(["ENTITY_DESCRIPTION_SHORT", "date_hour"]).reset_index(drop=True)

    combined_wait_times_path = build_wait_times_csv_from_forecasts(
        forecast_paths=saved_forecast_paths,
        output_path=DEFAULT_WAIT_TIMES_OUTPUT_PATH,
    )
    print(f"Saved combined wait-times CSV: {combined_wait_times_path}")

    return result


def load_models_for_attractions(
    attractions: Sequence[str],
) -> dict[str, dict[str, Any]]:
    bundles: dict[str, dict[str, Any]] = {}
    for attraction_name in attractions:
        bundle, model_path = load_model_bundle(attraction_name=attraction_name)
        bundles[attraction_name] = bundle
        print(f"Loaded model for {attraction_name}: {model_path}")
    return bundles
