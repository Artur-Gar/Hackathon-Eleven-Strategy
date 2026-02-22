# Park Wait Forecasting Repository

## Business Context

Amusement parks face two operational challenges every day:
- Highly variable attraction queue times by hour.
- Large swings in daily attendance driven by seasonality, weather, and calendar effects.

Without reliable forecasts, operations teams react too late, staffing is less efficient, guest experience degrades, and revenue opportunities are missed.

## Business Goal

Build a forecasting system that predicts:
- Next 7 days of park attendance (daily).
- Next 7 days of attraction waiting times (hourly) per ride.

These forecasts are used to support operational planning and power dashboard/UI modules for decision-making.

## Business Value

- Better staffing and resource planning for peak/off-peak periods.
- Lower queue pressure by anticipating high-load attractions.
- Better guest satisfaction through more reliable wait-time information.
- Faster planning cycles with automated forecast generation.

## Solution Overview

The repository includes:
- Data preparation pipeline from historical attendance, waiting times, and weather.
- Attendance forecasting model (LightGBM-based).
- Attraction-level waiting-time forecasting models (XGBoost-based).
- Inference pipeline that combines weather + attendance + attraction models.
- Frontend apps for visualization and communication of forecast outputs.

## Key Dependencies

- NumPy & pandas: Core tabular processing and feature engineering for forecasting workflows.
- scikit-learn, XGBoost, and LightGBM: Main machine learning stack for attendance and wait-time modeling.
- statsmodels & pmdarima: Time-series analysis and ARIMA/SARIMAX experimentation.
- FastAPI & Uvicorn: Backend/API-serving stack for exposing model outputs.
- Lovable (`lovable-tagger`): UI scaffolding workflow used to quickly generate and iterate demo interfaces.
- React + TypeScript + Vite: Runtime frontend stack used across dashboard/UI modules.
- Tailwind CSS + Radix UI (shadcn/ui): Component system and styling foundation used by the generated frontend code.
- Recharts & Leaflet: Runtime visualization libraries for charts and park map rendering.

## Repository Structure

- `modeling/`: data, notebooks, forecasting code, and trained artifacts.
- `modeling/wait_time_forecasting/`: production Python pipeline modules and CLIs.
- `modeling/data/raw/`: input datasets (`attendance.csv`, `waiting_times.csv`, `weather_data.csv`, etc.).
- `modeling/data/processed/`: generated intermediate outputs (including `weather_forecasted_data.csv` and `wait-times.csv`).
- `modeling/data/forecasts/`: per-attraction forecast CSVs.
- `modeling/artifacts/models/`: saved trained model bundles.
- `park-wait-radar/`: wait-time UI.
- `Average-Wait-Time-UI-Module/`: average wait-time UI.
- `Attendance_and_Revenue_UI_Module/`: attendance/revenue UI.

## Prerequisites

- Python `3.12`
- Node.js `20+`
- npm

# Forecasting Workflow

### 1) Generate weather forecast input

```powershell
python modeling/wait_time_forecasting/weather_forecast.py
```

This creates:
- `modeling/data/processed/weather_forecasted_data.csv`

### 2) Train attendance model (if needed)

```powershell
python -m modeling.wait_time_forecasting.attendance_cli --mode train
```

Saved model:
- `modeling/artifacts/models/attendace_gradient_boosting.joblib`

### 3) Train waiting-time models (if needed)

Example for selected attractions:

```powershell
python -m modeling.wait_time_forecasting.waiting_time_cli --mode train --attractions "Bumper Cars,Dizzy Dropper,Free Fall"
```

### 4) Run waiting-time forecast

```powershell
python -m modeling.wait_time_forecasting.waiting_time_cli --mode forecast --attractions "Bumper Cars,Dizzy Dropper,Free Fall" --horizon-days 7
```

This produces:
- Per-attraction files in `modeling/data/forecasts/` named like `Attraction_Name_waiting_dd_mm_yyyy.csv`.
- Combined UI feed at `modeling/data/processed/wait-times.csv`.

## Optional: Train and Forecast in One Command

```powershell
python -m modeling.wait_time_forecasting.waiting_time_cli --mode train_forecast --attractions "Bumper Cars,Dizzy Dropper,Free Fall" --horizon-days 7
```

# Frontend Apps

Install and run each UI separately.

### Park Wait Radar

```powershell
cd park-wait-radar
npm install
npm run dev -- --host 0.0.0.0 --port 5173
```

Open: `http://localhost:5173`

### Average Wait Time UI

```powershell
cd Average-Wait-Time-UI-Module
npm install
npm run dev -- --host 0.0.0.0 --port 5174
```

Open: `http://localhost:5174`

### Attendance and Revenue UI

```powershell
cd Attendance_and_Revenue_UI_Module
npm install
npm run dev -- --host 0.0.0.0 --port 5175
```

Open: `http://localhost:5175`

## Feeding Wait-Time Data to `park-wait-radar`

If needed, copy the generated combined forecast file into the app data path:

```powershell
Copy-Item modeling/data/processed/wait-times.csv park-wait-radar/src/data/wait-times.csv -Force
```

## Notebooks

Notebook workflows are under:
- `modeling/notebooks/01_research/`
- `modeling/notebooks/02_validation/`
- `modeling/notebooks/03_train/`
- `modeling/notebooks/04_inference/`

## Notes

- Raw data location is expected at `modeling/data/raw/`.
- Waiting-time model files are attraction-specific and saved under `modeling/artifacts/models/`.
- `wait-times.csv` in `modeling/data/processed/` is the main combined output for UI consumption.
