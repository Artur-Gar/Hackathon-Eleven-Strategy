import numpy as np
import pandas as pd
from pathlib import Path
from typing import Optional, Union


def mode_or_nan(s: pd.Series):
    s = s.dropna()
    return s.value_counts().idxmax() if not s.empty else np.nan


def safe_div(a: pd.Series, b: pd.Series):
    b = b.replace(0, np.nan)
    return a / b


def month_to_season(m: int) -> str:
    if m in (12, 1, 2):
        return "winter"
    if m in (3, 4, 5):
        return "spring"
    if m in (6, 7, 8):
        return "summer"
    return "autumn"


def build_model_df(
    data_dir: Union[Path, str] = "data",
    save_csv: bool = False,
    csv_path: Optional[Union[Path, str]] = None,
    park_name: str = "PortAventura World",
) -> pd.DataFrame:
    # Build the daily attraction-level dataset used by the LR and GBM notebooks.
    data_dir = Path(data_dir)

    attendance = pd.read_csv(data_dir / "attendance.csv")
    entity_schedule = pd.read_csv(data_dir / "entity_schedule.csv")
    link = pd.read_csv(data_dir / "link_attraction_park.csv")
    waiting = pd.read_csv(data_dir / "waiting_times.csv")
    weather = pd.read_csv(data_dir / "weather_data.csv")

    # Filter attractions to target park via link_attraction_park.csv
    link_col = link.columns[0]
    link[["ATTRACTION", "PARK"]] = link[link_col].astype(str).str.split(";", n=1, expand=True)
    link["ATTRACTION"] = link["ATTRACTION"].str.strip()
    link["PARK"] = link["PARK"].str.strip()

    pa_attractions = set(link.loc[link["PARK"] == park_name, "ATTRACTION"])

    waiting["ENTITY_DESCRIPTION_SHORT"] = waiting["ENTITY_DESCRIPTION_SHORT"].astype(str).str.strip()
    entity_schedule["ENTITY_DESCRIPTION_SHORT"] = entity_schedule["ENTITY_DESCRIPTION_SHORT"].astype(str).str.strip()

    waiting = waiting[waiting["ENTITY_DESCRIPTION_SHORT"].isin(pa_attractions)].copy()

    # Target: daily avg WAIT_TIME_MAX per attraction (only when open)
    waiting["WORK_DATE"] = pd.to_datetime(waiting["WORK_DATE"], errors="coerce")
    waiting = waiting.dropna(subset=["WORK_DATE"])
    waiting["date"] = waiting["WORK_DATE"].dt.floor("D")

    waiting_open = waiting[waiting["OPEN_TIME"] > 0].copy()

    daily_attr = (
        waiting_open
        .groupby(["date", "ENTITY_DESCRIPTION_SHORT"], as_index=False)
        .agg(
            wait_time_avg=("WAIT_TIME_MAX", "mean"),
            guests_sum=("GUEST_CARRIED", "sum"),
            adjcap_sum=("ADJUST_CAPACITY", "sum"),
            open_min_sum=("OPEN_TIME", "sum"),
            up_min_sum=("UP_TIME", "sum"),
            nb_units_med=("NB_UNITS", "median"),
            nb_max_unit=("NB_MAX_UNIT", "max"),
        )
    )

    # Derived features
    daily_attr["utilization"] = safe_div(daily_attr["guests_sum"], daily_attr["adjcap_sum"])
    daily_attr["availability"] = safe_div(daily_attr["up_min_sum"], daily_attr["open_min_sum"])
    daily_attr["eff_cap"] = daily_attr["adjcap_sum"] * daily_attr["availability"]

    # Calendar controls
    daily_attr["dow"] = daily_attr["date"].dt.dayofweek
    daily_attr["month"] = daily_attr["date"].dt.month

    # Attendance: keep only target park, merge on date
    attendance["USAGE_DATE"] = pd.to_datetime(attendance["USAGE_DATE"], errors="coerce")
    attendance = attendance.dropna(subset=["USAGE_DATE"])
    attendance["date"] = attendance["USAGE_DATE"].dt.floor("D")

    attendance_pa = attendance.loc[
        attendance["FACILITY_NAME"] == park_name,
        ["date", "attendance"],
    ].copy()

    daily = daily_attr.merge(attendance_pa, on="date", how="left")

    # Entity schedule: compute scheduled open minutes, merge
    entity_schedule["WORK_DATE"] = pd.to_datetime(entity_schedule["WORK_DATE"], errors="coerce")
    entity_schedule["DEB_TIME"] = pd.to_datetime(entity_schedule["DEB_TIME"], errors="coerce")
    entity_schedule["FIN_TIME"] = pd.to_datetime(entity_schedule["FIN_TIME"], errors="coerce")
    entity_schedule["UPDATE_TIME"] = pd.to_datetime(entity_schedule["UPDATE_TIME"], errors="coerce")

    es = entity_schedule.copy()
    es = es[es["ENTITY_TYPE"].eq("ATTR")]
    es = es[es["ENTITY_DESCRIPTION_SHORT"].isin(pa_attractions)]
    es = es.dropna(subset=["WORK_DATE", "DEB_TIME", "FIN_TIME"])
    es["date"] = es["WORK_DATE"].dt.floor("D")

    # Keep latest update per date+attraction
    es = es.sort_values("UPDATE_TIME").groupby(["date", "ENTITY_DESCRIPTION_SHORT"], as_index=False).tail(1)

    es["scheduled_open_min"] = (es["FIN_TIME"] - es["DEB_TIME"]).dt.total_seconds() / 60.0
    es = es[["date", "ENTITY_DESCRIPTION_SHORT", "scheduled_open_min"]]

    daily = daily.merge(es, on=["date", "ENTITY_DESCRIPTION_SHORT"], how="left")

    # Weather: hourly -> daily aggregates
    weather = weather.copy()

    if "dt_iso" in weather.columns:
        dt_clean = weather["dt_iso"].astype(str).str.replace(" UTC", "", regex=False)
        weather["dt_iso_parsed"] = pd.to_datetime(
            dt_clean,
            format="%Y-%m-%d %H:%M:%S %z",
            errors="coerce",
        )
    else:
        raise ValueError("weather_data.csv must contain dt_iso column")

    weather = weather.dropna(subset=["dt_iso_parsed"])
    weather["date"] = weather["dt_iso_parsed"].dt.tz_convert(None).dt.floor("D")

    daily["date"] = pd.to_datetime(daily["date"], errors="coerce").dt.floor("D")

    numeric_candidates = [
        "temp", "feels_like", "dew_point", "pressure", "humidity",
        "wind_speed", "wind_deg", "wind_gust", "clouds_all",
        "rain_1h", "rain_3h", "snow_1h", "snow_3h", "visibility",
    ]
    cat_candidates = ["weather_main", "weather_description", "weather_icon", "weather_id"]

    num_cols = [c for c in numeric_candidates if c in weather.columns]
    cat_cols = [c for c in cat_candidates if c in weather.columns]

    daily_weather = weather[["date"]].drop_duplicates().sort_values("date").copy()

    if num_cols:
        daily_weather_num = weather.groupby("date", as_index=False)[num_cols].median()
        daily_weather = daily_weather.merge(daily_weather_num, on="date", how="left")

    if cat_cols:
        daily_weather_cat = weather.groupby("date", as_index=False)[cat_cols].agg(mode_or_nan)
        daily_weather = daily_weather.merge(daily_weather_cat, on="date", how="left")

    daily = daily.merge(daily_weather, on="date", how="left")

    # Fill missing numeric weather to avoid dropping many rows
    for c in num_cols:
        daily[c] = daily[c].fillna(daily[c].median())

    # COVID dummies
    covid_start = pd.Timestamp("2020-03-14")
    covid_end = pd.Timestamp("2021-05-09")

    daily["covid"] = ((daily["date"] >= covid_start) & (daily["date"] <= covid_end)).astype(int)
    daily["post_covid"] = (daily["date"] > covid_end).astype(int)

    # Season dummies
    daily["season"] = daily["month"].apply(month_to_season)

    # Final model dataframe
    model_df = daily.copy()
    model_df = model_df.dropna(subset=["wait_time_avg", "utilization", "availability"])

    if save_csv:
        if csv_path is None:
            csv_path = data_dir / "model_df.csv"
        csv_path = Path(csv_path)
        csv_path.parent.mkdir(parents=True, exist_ok=True)
        model_df.to_csv(csv_path, index=False)

    return model_df
