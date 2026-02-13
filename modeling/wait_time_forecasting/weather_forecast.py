from __future__ import annotations

import csv
import json
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import urlopen

import pandas as pd

PROJECT_ROOT = Path(__file__).resolve().parents[2]
OUTPUT_PATH = PROJECT_ROOT / "modeling" / "data" / "processed" / "weather_forecasted_data.csv"

# PortAventura World (Salou) and fixed horizon used by the inference notebooks.
LATITUDE = 41.08963
LONGITUDE = 1.1571429
FORECAST_DAYS = 9
TIMEZONE = "Europe/London"
OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"


def _fetch_open_meteo_payload() -> dict:
    params = {
        "latitude": LATITUDE,
        "longitude": LONGITUDE,
        "hourly": (
            "temperature_2m,"
            "rain,"
            "relative_humidity_2m,"
            "pressure_msl,"
            "cloud_cover,"
            "wind_speed_10m"
        ),
        "forecast_days": FORECAST_DAYS,
        "timezone": TIMEZONE,
    }
    url = f"{OPEN_METEO_URL}?{urlencode(params)}"

    with urlopen(url, timeout=30) as response:
        payload = json.loads(response.read().decode("utf-8"))

    if "hourly" not in payload:
        raise ValueError("Open-Meteo response is missing 'hourly'.")

    required_hourly = [
        "time",
        "temperature_2m",
        "rain",
        "relative_humidity_2m",
        "pressure_msl",
        "cloud_cover",
        "wind_speed_10m",
    ]
    missing = [k for k in required_hourly if k not in payload["hourly"]]
    if missing:
        raise ValueError(f"Open-Meteo hourly data is missing fields: {missing}")

    return payload


def _format_float(value: object, decimals: int) -> str:
    numeric = pd.to_numeric(value, errors="coerce")
    if pd.isna(numeric):
        return ""
    return f"{float(numeric):.{decimals}f}"


def _format_int(value: object) -> str:
    numeric = pd.to_numeric(value, errors="coerce")
    if pd.isna(numeric):
        return ""
    return str(int(round(float(numeric))))


def _build_hourly_rows(payload: dict) -> list[list[str]]:
    hourly = payload["hourly"]

    df = pd.DataFrame(
        {
            "time": pd.Series(hourly["time"], dtype="string"),
            "temperature_2m (°C)": hourly["temperature_2m"],
            "rain (mm)": hourly["rain"],
            "relative_humidity_2m (%)": hourly["relative_humidity_2m"],
            "pressure_msl (hPa)": hourly["pressure_msl"],
            "cloud_cover (%)": hourly["cloud_cover"],
            "wind_speed_10m (m/s)": hourly["wind_speed_10m"],
        }
    )

    out = pd.DataFrame(
        {
            "time": df["time"].fillna(""),
            "temperature_2m (°C)": df["temperature_2m (°C)"].map(lambda v: _format_float(v, 1)),
            "rain (mm)": df["rain (mm)"].map(lambda v: _format_float(v, 2)),
            "relative_humidity_2m (%)": df["relative_humidity_2m (%)"].map(_format_int),
            "pressure_msl (hPa)": df["pressure_msl (hPa)"].map(lambda v: _format_float(v, 1)),
            "cloud_cover (%)": df["cloud_cover (%)"].map(_format_int),
            "wind_speed_10m (m/s)": df["wind_speed_10m (m/s)"].map(lambda v: _format_float(v, 2)),
        }
    )

    return out.values.tolist()


def build_weather_forecast_csv() -> Path:
    payload = _fetch_open_meteo_payload()

    metadata_header = [
        "latitude",
        "longitude",
        "elevation",
        "utc_offset_seconds",
        "timezone",
        "timezone_abbreviation",
    ]
    metadata_values = [
        payload.get("latitude", ""),
        payload.get("longitude", ""),
        payload.get("elevation", ""),
        payload.get("utc_offset_seconds", ""),
        payload.get("timezone", ""),
        payload.get("timezone_abbreviation", ""),
    ]

    hourly_header = [
        "time",
        "temperature_2m (°C)",
        "rain (mm)",
        "relative_humidity_2m (%)",
        "pressure_msl (hPa)",
        "cloud_cover (%)",
        "wind_speed_10m (m/s)",
    ]
    hourly_rows = _build_hourly_rows(payload)

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT_PATH.open("w", newline="", encoding="utf-8") as fp:
        writer = csv.writer(fp)
        writer.writerow(metadata_header)
        writer.writerow(metadata_values)
        writer.writerow([])
        writer.writerow(hourly_header)
        writer.writerows(hourly_rows)

    return OUTPUT_PATH


def main() -> None:
    output_path = build_weather_forecast_csv()

    hourly_df = pd.read_csv(output_path, skiprows=3)
    print(f"Saved weather forecast: {output_path}")
    print(f"Hourly rows: {len(hourly_df)}")
    if not hourly_df.empty and "time" in hourly_df.columns:
        print(f"Forecast start: {hourly_df['time'].iloc[0]}")
        print(f"Forecast end: {hourly_df['time'].iloc[-1]}")


if __name__ == "__main__":
    main()
