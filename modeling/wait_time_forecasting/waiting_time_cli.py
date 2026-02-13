from __future__ import annotations

import argparse
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

try:
    from .gradient_boosting_waiting_time import (
        DEFAULT_ATTRACTIONS,
        DEFAULT_FORECAST_HORIZON_DAYS,
        DEFAULT_PARK_NAME,
        _parse_attractions,
        train_models_for_attractions,
    )
    from .paths import resolve_data_dir
    from .waiting_time_pipeline import (
        DEFAULT_WEATHER_FORECAST_PATH,
        forecast_for_attractions,
        load_models_for_attractions,
    )
except ImportError:  # pragma: no cover - supports direct script execution
    from modeling.wait_time_forecasting.gradient_boosting_waiting_time import (
        DEFAULT_ATTRACTIONS,
        DEFAULT_FORECAST_HORIZON_DAYS,
        DEFAULT_PARK_NAME,
        _parse_attractions,
        train_models_for_attractions,
    )
    from modeling.wait_time_forecasting.paths import resolve_data_dir
    from modeling.wait_time_forecasting.waiting_time_pipeline import (
        DEFAULT_WEATHER_FORECAST_PATH,
        forecast_for_attractions,
        load_models_for_attractions,
    )


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Train/forecast waiting-time GBM models for selected attractions."
    )
    parser.add_argument(
        "--mode",
        choices=["train", "train_forecast", "forecast"],
        default="train",
        help="Execution mode.",
    )
    parser.add_argument(
        "--attractions",
        type=str,
        default=",".join(DEFAULT_ATTRACTIONS),
        help="Comma-separated attraction names.",
    )
    parser.add_argument(
        "--data-dir",
        type=str,
        default=str(resolve_data_dir(project_root=PROJECT_ROOT)),
        help="Path to raw data directory (attendance.csv, waiting_times.csv, weather_data.csv).",
    )
    parser.add_argument("--park-name", type=str, default=DEFAULT_PARK_NAME, help="Park name.")
    parser.add_argument("--train-ratio", type=float, default=0.8, help="Chronological train ratio.")
    parser.add_argument("--validation-ratio", type=float, default=0.2, help="Validation ratio per CV fold.")
    parser.add_argument("--cv-splits", type=int, default=3, help="Number of chronological CV folds.")
    parser.add_argument("--horizon-days", type=int, default=DEFAULT_FORECAST_HORIZON_DAYS, help="Forecast horizon in days.")
    parser.add_argument("--random-state", type=int, default=42, help="Random seed.")
    parser.add_argument("--no-progress", action="store_true", help="Disable progress bars.")
    parser.add_argument(
        "--weather-forecast-path",
        type=str,
        default=str(DEFAULT_WEATHER_FORECAST_PATH),
        help="Path to weather forecast CSV used for inference.",
    )
    return parser


def main() -> None:
    args = _build_parser().parse_args()
    mode = args.mode
    attractions = _parse_attractions(args.attractions)
    data_dir = Path(args.data_dir)
    show_progress = not args.no_progress

    model_bundles: dict[str, dict] = {}

    if mode in {"train", "train_forecast"}:
        trained = train_models_for_attractions(
            attractions=attractions,
            data_dir=data_dir,
            park_name=args.park_name,
            train_ratio=args.train_ratio,
            validation_ratio=args.validation_ratio,
            cv_splits=args.cv_splits,
            random_state=args.random_state,
            show_progress=show_progress,
        )

        print("\nTraining complete.")
        for attraction_name, info in trained.items():
            print(
                f"- {attraction_name}: MAE={info['validation_mae']:.3f} | model={info['model_path']}"
            )
            model_bundles[attraction_name] = info["model_bundle"]

    if mode == "forecast":
        model_bundles = load_models_for_attractions(attractions)

    if mode in {"train_forecast", "forecast"}:
        forecast_df = forecast_for_attractions(
            model_bundles=model_bundles,
            data_dir=data_dir,
            park_name=args.park_name,
            horizon_days=args.horizon_days,
            weather_forecast_path=Path(args.weather_forecast_path),
        )
        print("\nForecast results:")
        print(forecast_df.to_string(index=False, formatters={"pred_wait_time": "{:.2f}".format}))


if __name__ == "__main__":
    main()
