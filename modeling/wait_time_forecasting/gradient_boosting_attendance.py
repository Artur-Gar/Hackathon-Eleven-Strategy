from __future__ import annotations

import sys
from pathlib import Path
from typing import Any, Optional, Sequence, Union

import joblib
import numpy as np
import pandas as pd
import xgboost as xgb
from sklearn.metrics import mean_absolute_error
from sklearn.model_selection import TimeSeriesSplit
from tqdm import tqdm

PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

try:
    from .paths import resolve_data_dir, resolve_models_dir
except ImportError:  # pragma: no cover - supports direct script execution
    from modeling.wait_time_forecasting.paths import resolve_data_dir, resolve_models_dir


DEFAULT_PARK_NAME = "PortAventura World"
MODEL_FILENAME = "attendace_gradient_boosting.joblib"
COVID_START = pd.Timestamp("2020-03-11")
COVID_END = pd.Timestamp("2022-04-20")
FORECAST_HORIZON_DAYS = 7
DEFAULT_DATA_DIR = PROJECT_ROOT / "modeling" / "data" / "raw"

FEATURE_COLS = [
    # Calendar
    "day_of_week",
    "month",
    "week_of_year",
    "day_of_year",
    "is_weekend",
    "year",
    "is_summer",
    "is_holiday_season",
    "dow_sin",
    "dow_cos",
    "month_sin",
    "month_cos",
    # Weather
    "temp",
    "pressure",
    "humidity",
    "wind_speed",
    "clouds_all",
    "rain_1h",
    "snow_1h",
    "visibility",
    # COVID
    "is_covid",
    # Lags and rolling
    "lag_7",
    "lag_14",
    "lag_28",
    "lag_365",
    "roll_mean_7",
    "roll_mean_14",
    "roll_mean_30",
    "roll_std_7",
    "roll_std_14",
    "roll_std_30",
]

WEATHER_NUM_COLS = [
    "temp",
    "pressure",
    "humidity",
    "wind_speed",
    "clouds_all",
    "rain_1h",
    "snow_1h",
    "visibility",
]


def _require_cols(df: pd.DataFrame, cols: Sequence[str], df_name: str) -> None:
    missing = [c for c in cols if c not in df.columns]
    if missing:
        raise ValueError(f"{df_name} is missing required columns: {missing}")


def _resolve_attendance_col(df: pd.DataFrame) -> Optional[str]:
    for c in ["attendance", "predcited_day_attendance", "predicted_day_attendance"]:
        if c in df.columns:
            return c
    return None


def _resolve_raw_data_dir(data_dir: Optional[Union[str, Path]] = None) -> Path:
    if data_dir is None:
        return resolve_data_dir(project_root=PROJECT_ROOT)

    path = Path(data_dir)
    if (path / "attendance.csv").exists():
        return path

    if (path / "raw" / "attendance.csv").exists():
        return path / "raw"

    raise FileNotFoundError(
        f"Could not find attendance.csv in '{path}' or '{path / 'raw'}'."
    )


def _load_attendance_daily(data_dir: Path, park_name: str) -> pd.DataFrame:
    attendance = pd.read_csv(data_dir / "attendance.csv")
    _require_cols(attendance, ["USAGE_DATE", "FACILITY_NAME"], "attendance.csv")

    attendance_col = _resolve_attendance_col(attendance)
    if attendance_col is None:
        raise ValueError(
            "attendance.csv must contain one of: attendance, predcited_day_attendance, predicted_day_attendance"
        )

    out = attendance.copy()
    out["date"] = pd.to_datetime(out["USAGE_DATE"], errors="coerce").dt.floor("D")
    out["FACILITY_NAME"] = out["FACILITY_NAME"].astype(str).str.strip()
    out = out[out["FACILITY_NAME"].eq(str(park_name).strip())].copy()
    out["y"] = pd.to_numeric(out[attendance_col], errors="coerce")
    out = out.dropna(subset=["date", "y"])
    out = out.groupby("date", as_index=False)["y"].mean()
    return out.sort_values("date").reset_index(drop=True)


def _load_weather_daily(data_dir: Path) -> pd.DataFrame:
    weather = pd.read_csv(data_dir / "weather_data.csv")
    _require_cols(weather, ["dt_iso"], "weather_data.csv")

    out = weather.copy()
    dt_clean = out["dt_iso"].astype(str).str.replace(" UTC", "", regex=False)
    out["date"] = pd.to_datetime(dt_clean, errors="coerce", utc=True).dt.tz_convert(None).dt.floor("D")
    out = out.dropna(subset=["date"]).copy()

    # Ensure only weather features shared with gradient_boosting.py are used.
    for c in ["temp", "pressure", "humidity", "wind_speed", "clouds_all", "rain_1h", "snow_1h", "visibility"]:
        if c not in out.columns:
            out[c] = np.nan

    numeric_cols = ["temp", "pressure", "humidity", "wind_speed", "clouds_all", "rain_1h", "snow_1h", "visibility"]
    out[numeric_cols] = out[numeric_cols].apply(pd.to_numeric, errors="coerce")

    daily = (
        out.groupby("date", as_index=False)
        .agg(
            temp=("temp", "mean"),
            pressure=("pressure", "mean"),
            humidity=("humidity", "mean"),
            wind_speed=("wind_speed", "mean"),
            clouds_all=("clouds_all", "mean"),
            rain_1h=("rain_1h", "sum"),
            snow_1h=("snow_1h", "sum"),
            visibility=("visibility", "mean"),
        )
        .sort_values("date")
        .reset_index(drop=True)
    )
    return daily


def build_attendance_feature_table(
    data_dir: Optional[Union[str, Path]] = None,
    park_name: str = DEFAULT_PARK_NAME,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    raw_dir = _resolve_raw_data_dir(data_dir)
    attendance_daily = _load_attendance_daily(raw_dir, park_name=park_name)
    weather_daily = _load_weather_daily(raw_dir)

    df = attendance_daily.merge(weather_daily, on="date", how="left")

    neg_mask = df["y"] < 0
    df.loc[neg_mask, "y"] = np.nan
    df["y"] = df["y"].interpolate(method="linear").ffill().bfill()

    df["day_of_week"] = df["date"].dt.dayofweek
    df["month"] = df["date"].dt.month
    df["week_of_year"] = df["date"].dt.isocalendar().week.astype(int)
    df["day_of_year"] = df["date"].dt.dayofyear
    df["is_weekend"] = (df["day_of_week"] >= 5).astype(int)
    df["year"] = df["date"].dt.year
    df["is_summer"] = df["month"].isin([6, 7, 8]).astype(int)
    df["is_holiday_season"] = df["month"].isin([6, 7, 8, 12]).astype(int)

    df["dow_sin"] = np.sin(2 * np.pi * df["day_of_week"] / 7)
    df["dow_cos"] = np.cos(2 * np.pi * df["day_of_week"] / 7)
    df["month_sin"] = np.sin(2 * np.pi * df["month"] / 12)
    df["month_cos"] = np.cos(2 * np.pi * df["month"] / 12)

    df["is_covid"] = ((df["date"] >= COVID_START) & (df["date"] <= COVID_END)).astype(int)

    for col in WEATHER_NUM_COLS:
        if col not in df.columns:
            df[col] = np.nan
    df[WEATHER_NUM_COLS] = df[WEATHER_NUM_COLS].apply(pd.to_numeric, errors="coerce").ffill().bfill()
    df[WEATHER_NUM_COLS] = df[WEATHER_NUM_COLS].fillna(0.0)

    df = df.set_index("date").sort_index()
    for lag in [7, 14, 28, 365]:
        df[f"lag_{lag}"] = df["y"].shift(lag)

    for window in [7, 14, 30]:
        df[f"roll_mean_{window}"] = df["y"].shift(1).rolling(window).mean()
        df[f"roll_std_{window}"] = df["y"].shift(1).rolling(window).std()

    return df, weather_daily


def _default_param_grid() -> list[dict[str, Any]]:
    return [
        {"n_estimators": 300, "max_depth": 2, "learning_rate": 0.03, "subsample": 0.8, "reg_alpha": 0.0},
        {"n_estimators": 500, "max_depth": 3, "learning_rate": 0.03, "subsample": 0.8, "reg_alpha": 1.0},
        {"n_estimators": 700,"max_depth": 4,"learning_rate": 0.03,"subsample": 0.8, "reg_alpha": 1.0},
        {"n_estimators": 300, "max_depth": 6, "learning_rate": 0.05, "subsample": 0.8, "reg_alpha": 1.0},
        {"n_estimators": 500, "max_depth": 6, "learning_rate": 0.05, "subsample": 0.8, "reg_alpha": 1.0},
        {"n_estimators": 700, "max_depth": 6, "learning_rate": 0.05, "subsample": 1.0, "reg_alpha": 1.0},
    ]


def _build_xgb_model(params: dict[str, Any], random_state: int) -> xgb.XGBRegressor:
    return xgb.XGBRegressor(
        objective="reg:squarederror",
        eval_metric="mae",
        n_jobs=-1,
        random_state=random_state,
        tree_method="hist",
        **params,
    )


def select_best_params_cv(
    X: pd.DataFrame,
    y: pd.Series,
    cv_splits: int = 5,
    param_grid: Optional[Sequence[dict[str, Any]]] = None,
    random_state: int = 42,
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    if cv_splits < 2:
        raise ValueError("cv_splits must be >= 2.")
    if len(X) <= cv_splits:
        raise ValueError(f"Not enough rows ({len(X)}) for cv_splits={cv_splits}.")

    candidates = list(param_grid) if param_grid is not None else _default_param_grid()
    if not candidates:
        raise ValueError("param_grid must contain at least one candidate.")

    tscv = TimeSeriesSplit(n_splits=cv_splits)
    best_params: dict[str, Any] = {}
    best_mae = np.inf
    cv_scores: list[dict[str, Any]] = []

    candidate_iter = tqdm(
        enumerate(candidates, start=1),
        total=len(candidates),
        desc="CV param sets",
        unit="set",
    )

    for idx, params in candidate_iter:
        fold_mae: list[float] = []

        for train_idx, valid_idx in tscv.split(X):
            X_train = X.iloc[train_idx]
            y_train = y.iloc[train_idx]
            X_valid = X.iloc[valid_idx]
            y_valid = y.iloc[valid_idx]

            model = _build_xgb_model(dict(params), random_state=random_state)
            model.fit(X_train, y_train, verbose=False)
            pred = model.predict(X_valid)
            fold_mae.append(float(mean_absolute_error(y_valid, pred)))

        mean_mae = float(np.mean(fold_mae))
        cv_scores.append(
            {
                "params": dict(params),
                "mean_mae": mean_mae,
                "fold_mae": fold_mae,
            }
        )
        print(f"[CV] Candidate {idx}/{len(candidates)} mean MAE: {mean_mae:,.2f}")

        if mean_mae < best_mae:
            best_mae = mean_mae
            best_params = dict(params)

        candidate_iter.set_postfix(best_mae=f"{best_mae:,.2f}")

    if not best_params:
        raise ValueError("CV failed to select best parameters.")

    return best_params, cv_scores


def _build_recursive_row(
    forecast_date: pd.Timestamp,
    history: pd.Series,
    weather_indexed: pd.DataFrame,
) -> dict[str, float]:
    row: dict[str, float] = {}

    row["day_of_week"] = forecast_date.dayofweek
    row["month"] = forecast_date.month
    row["week_of_year"] = int(forecast_date.isocalendar().week)
    row["day_of_year"] = forecast_date.dayofyear
    row["is_weekend"] = int(forecast_date.dayofweek >= 5)
    row["year"] = forecast_date.year
    row["is_summer"] = int(forecast_date.month in [6, 7, 8])
    row["is_holiday_season"] = int(forecast_date.month in [6, 7, 8, 12])
    row["dow_sin"] = np.sin(2 * np.pi * forecast_date.dayofweek / 7)
    row["dow_cos"] = np.cos(2 * np.pi * forecast_date.dayofweek / 7)
    row["month_sin"] = np.sin(2 * np.pi * forecast_date.month / 12)
    row["month_cos"] = np.cos(2 * np.pi * forecast_date.month / 12)

    if forecast_date in weather_indexed.index:
        w = weather_indexed.loc[forecast_date]
    else:
        w = weather_indexed.iloc[-1]

    row["temp"] = float(pd.to_numeric(w.get("temp", np.nan), errors="coerce"))
    row["pressure"] = float(pd.to_numeric(w.get("pressure", np.nan), errors="coerce"))
    row["humidity"] = float(pd.to_numeric(w.get("humidity", np.nan), errors="coerce"))
    row["wind_speed"] = float(pd.to_numeric(w.get("wind_speed", np.nan), errors="coerce"))
    row["clouds_all"] = float(pd.to_numeric(w.get("clouds_all", np.nan), errors="coerce"))
    row["rain_1h"] = float(pd.to_numeric(w.get("rain_1h", np.nan), errors="coerce"))
    row["snow_1h"] = float(pd.to_numeric(w.get("snow_1h", np.nan), errors="coerce"))
    row["visibility"] = float(pd.to_numeric(w.get("visibility", np.nan), errors="coerce"))

    row["is_covid"] = int(COVID_START <= forecast_date <= COVID_END)

    for lag in [7, 14, 28, 365]:
        lag_date = forecast_date - pd.Timedelta(days=lag)
        row[f"lag_{lag}"] = float(pd.to_numeric(history.get(lag_date, np.nan), errors="coerce"))

    recent = history.loc[: forecast_date - pd.Timedelta(days=1)]
    row["roll_mean_7"] = float(recent.iloc[-7:].mean()) if len(recent) >= 7 else float(recent.mean())
    row["roll_mean_14"] = float(recent.iloc[-14:].mean()) if len(recent) >= 14 else float(recent.mean())
    row["roll_mean_30"] = float(recent.iloc[-30:].mean()) if len(recent) >= 30 else float(recent.mean())
    row["roll_std_7"] = float(recent.iloc[-7:].std()) if len(recent) >= 7 else float(recent.std())
    row["roll_std_14"] = float(recent.iloc[-14:].std()) if len(recent) >= 14 else float(recent.std())
    row["roll_std_30"] = float(recent.iloc[-30:].std()) if len(recent) >= 30 else float(recent.std())

    return row


def forecast_next_days(
    model: xgb.XGBRegressor,
    feature_df: pd.DataFrame,
    weather_daily: pd.DataFrame,
    feature_fill_values: dict[str, float],
    horizon_days: int = FORECAST_HORIZON_DAYS,
) -> pd.DataFrame:
    if horizon_days < 1:
        raise ValueError("horizon_days must be >= 1.")

    if feature_df.empty:
        raise ValueError("feature_df is empty.")
    if weather_daily.empty:
        raise ValueError("weather_daily is empty.")

    weather_indexed = weather_daily.set_index("date").sort_index()
    history = feature_df["y"].copy().sort_index()

    forecast_start = history.index.max() + pd.Timedelta(days=1)
    forecast_dates = pd.date_range(forecast_start, periods=horizon_days, freq="D")

    predictions: list[dict[str, Any]] = []
    fill_values = pd.Series(feature_fill_values, dtype="float64")

    for fdate in forecast_dates:
        row = _build_recursive_row(fdate, history=history, weather_indexed=weather_indexed)
        x_forecast = pd.DataFrame([row], index=[fdate])

        for col in FEATURE_COLS:
            if col not in x_forecast.columns:
                x_forecast[col] = np.nan

        x_forecast = x_forecast[FEATURE_COLS].apply(pd.to_numeric, errors="coerce").fillna(fill_values)
        pred = float(np.clip(model.predict(x_forecast)[0], 0, None))

        predictions.append(
            {
                "date": fdate,
                "day_name": fdate.day_name(),
                "predicted": pred,
            }
        )
        history.loc[fdate] = pred

    return pd.DataFrame(predictions)


def train_attendance_gradient_boosting(
    data_dir: Optional[Union[str, Path]] = None,
    park_name: str = DEFAULT_PARK_NAME,
    cv_splits: int = 5,
    random_state: int = 42,
    param_grid: Optional[Sequence[dict[str, Any]]] = None,
    model_filename: str = MODEL_FILENAME,
) -> dict[str, Any]:
    feature_df, _ = build_attendance_feature_table(data_dir=data_dir, park_name=park_name)
    train_df = feature_df.dropna(subset=["y", *FEATURE_COLS]).copy()

    if train_df.empty:
        raise ValueError("No rows available for training after feature engineering.")

    X = train_df[FEATURE_COLS].copy()
    y = train_df["y"].copy()

    best_params, cv_scores = select_best_params_cv(
        X=X,
        y=y,
        cv_splits=cv_splits,
        param_grid=param_grid,
        random_state=random_state,
    )

    model = _build_xgb_model(best_params, random_state=random_state)
    model.fit(X, y, verbose=False)

    feature_fill_values = {
        col: float(pd.to_numeric(X[col], errors="coerce").dropna().median()) if pd.to_numeric(X[col], errors="coerce").notna().any() else 0.0
        for col in FEATURE_COLS
    }

    models_dir = resolve_models_dir(project_root=PROJECT_ROOT, create=True)
    model_path = models_dir / model_filename
    model_bundle = {
        "model": model,
        "feature_cols": list(FEATURE_COLS),
        "best_params": dict(best_params),
        "cv_scores": cv_scores,
        "feature_fill_values": feature_fill_values,
        "park_name": park_name,
        "train_start_date": train_df.index.min(),
        "train_end_date": train_df.index.max(),
    }
    joblib.dump(model_bundle, model_path)

    return {
        "model_bundle": model_bundle,
        "model_path": model_path,
        "train_rows": len(train_df),
        "best_params": best_params,
    }


def run_attendance_inference(
    model_bundle: dict[str, Any],
    data_dir: Optional[Union[str, Path]] = None,
    park_name: str = DEFAULT_PARK_NAME,
    horizon_days: int = FORECAST_HORIZON_DAYS,
) -> pd.DataFrame:
    if "model" not in model_bundle:
        raise ValueError("model_bundle must contain key 'model'.")
    if "feature_fill_values" not in model_bundle:
        raise ValueError("model_bundle must contain key 'feature_fill_values'.")

    feature_df, weather_daily = build_attendance_feature_table(data_dir=data_dir, park_name=park_name)
    forecast = forecast_next_days(
        model=model_bundle["model"],
        feature_df=feature_df,
        weather_daily=weather_daily,
        feature_fill_values=model_bundle["feature_fill_values"],
        horizon_days=horizon_days,
    )

    return forecast


def load_model_bundle(model_filename: str = MODEL_FILENAME) -> tuple[dict[str, Any], Path]:
    models_dir = resolve_models_dir(project_root=PROJECT_ROOT, create=False)
    model_path = models_dir / model_filename
    if not model_path.exists():
        raise FileNotFoundError(
            f"Model file not found: {model_path}. Train first or choose a valid --model-filename."
        )

    bundle = joblib.load(model_path)
    if not isinstance(bundle, dict):
        raise ValueError(f"Invalid model bundle format in {model_path}.")
    return bundle, model_path

def _run_cli() -> None:
    try:
        from .attendance_cli import main as cli_main
    except ImportError:  # pragma: no cover - supports direct script execution
        from modeling.wait_time_forecasting.attendance_cli import main as cli_main
    cli_main()


if __name__ == "__main__":
    _run_cli()
