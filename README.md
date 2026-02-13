# Park Wait Forecasting Repository

This repository contains the end-to-end workflow for forecasting amusement park attendance and attraction waiting times, plus three frontend apps for visualization.

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

## Python Setup

Run from repo root:

```powershell
python -m venv .venv
.\.venv\Scripts\activate
python -m pip install --upgrade pip
python -m pip install numpy pandas joblib scikit-learn xgboost statsmodels lightgbm pyarrow pmdarima tqdm fastapi uvicorn jupyterlab ipykernel ipywidgets
```

## Main Forecasting Workflow

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
- Per-attraction files in `modeling/data/forecasts/` named like `Attraction_Name_waiting_dd_mm_yyyy.csv`
- Combined UI feed at `modeling/data/processed/wait-times.csv`

## Optional: Train and Forecast in One Command

```powershell
python -m modeling.wait_time_forecasting.waiting_time_cli --mode train_forecast --attractions "Bumper Cars,Dizzy Dropper,Free Fall" --horizon-days 7
```

## Frontend Apps

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
