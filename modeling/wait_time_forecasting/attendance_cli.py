from __future__ import annotations

import argparse
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

try:
    from .gradient_boosting_attendance import (
        DEFAULT_DATA_DIR,
        DEFAULT_PARK_NAME,
        FORECAST_HORIZON_DAYS,
        MODEL_FILENAME,
        load_model_bundle,
        run_attendance_inference,
        train_attendance_gradient_boosting,
    )
except ImportError:  # pragma: no cover - supports direct script execution
    from modeling.wait_time_forecasting.gradient_boosting_attendance import (
        DEFAULT_DATA_DIR,
        DEFAULT_PARK_NAME,
        FORECAST_HORIZON_DAYS,
        MODEL_FILENAME,
        load_model_bundle,
        run_attendance_inference,
        train_attendance_gradient_boosting,
    )


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Run attendance pipeline in one of three modes: train, train_and_forecast, or forecast."
    )
    parser.add_argument("--mode", choices=["train", "train_and_forecast", "forecast"], default="train", help="Execution mode.")
    parser.add_argument("--data-dir", type=str, default=str(DEFAULT_DATA_DIR), help="Path to raw data directory (attendance.csv and weather_data.csv).")
    parser.add_argument("--park-name", type=str, default=DEFAULT_PARK_NAME, help="Park name in attendance.csv FACILITY_NAME.")
    parser.add_argument("--cv-splits", type=int, default=5, help="Number of TimeSeriesSplit folds.")
    parser.add_argument("--model-filename", type=str, default=MODEL_FILENAME, help="Output model file name under artifacts/models.")
    parser.add_argument("--horizon-days", type=int, default=FORECAST_HORIZON_DAYS, help="Inference forecast horizon in days.")
    return parser


def main() -> None:
    args = _build_parser().parse_args()

    if args.mode in {"train", "train_and_forecast"}:
        result = train_attendance_gradient_boosting(
            data_dir=args.data_dir,
            park_name=args.park_name,
            cv_splits=args.cv_splits,
            model_filename=args.model_filename,
        )

        print("\nTraining complete.")
        print(f"Rows used for training: {result['train_rows']}")
        print(f"Best params: {result['best_params']}")
        print(f"Saved model: {result['model_path']}")

    if args.mode in {"train_and_forecast", "forecast"}:
        if args.mode == "forecast":
            model_bundle, model_path = load_model_bundle(model_filename=args.model_filename)
            print(f"\nLoaded model: {model_path}")
        else:
            model_bundle = result["model_bundle"]

        forecast_df = run_attendance_inference(
            model_bundle=model_bundle,
            data_dir=args.data_dir,
            park_name=args.park_name,
            horizon_days=args.horizon_days,
        )
        print("\nForecast:")
        print(forecast_df.to_string(index=False, formatters={"predicted": "{:,.0f}".format}))


if __name__ == "__main__":
    main()
