

# PortAventura World – Attendance Forecasting & Revenue Simulation Dashboard

## Overview
A single-page, executive-facing dashboard that visualizes historical park attendance (June 2018 – July 2022), generates forecasts with configurable horizons, and simulates ticketing + FastPASS revenue scenarios. Built with a modular connector architecture so forecasting models and data sources can be swapped without touching the UI.

---

## 1. Data Layer & Cleaning Pipeline
- **Copy the CSV** into the project and filter to PortAventura World only
- **Data cleaning module** (`attendance_data_connector`) implementing the exact 5-step spec:
  - Parse & sort dates, fill gaps with NULL attendance
  - Negative attendance → 0 + `is_closed` flag (park closures)
  - Configurable COVID period flag (default: ~March 2020 – June 2021)
  - Preserve NULLs for missing dates (no imputation)
  - Derive calendar features (day_of_week, week, month, year)

## 2. Forecasting Engine
- **Pluggable forecast connector** (`forecast_model_connector`) with strict input/output schema
- Default implementation: a browser-compatible surrogate SARIMAX that preserves realistic trend, weekly/yearly seasonality, and confidence intervals
- COVID & closure periods excluded/downweighted during training, but visible in historical charts
- Outputs: date, forecasted_attendance, lower/upper confidence intervals

## 3. Interactive Input Panel (Top of Page)
- Ticket Price (€) — numeric input
- FastPASS Price (€) — numeric input
- % Visitors Buying FastPASS — slider (0–100%)
- Forecast Horizon toggle buttons (1 Month / 5 Months / 1 Year) — positioned above the chart on the right
- "← Back" button in the top-right, navigating to a configurable route

## 4. Attendance Forecast Chart
- Full historical time series + forecast extension
- Confidence interval band (shaded)
- COVID period visually shaded & labeled
- **Click-to-select on forecast region**: first click = single day, second click = date range
- Selected range highlighted distinctly; non-selected periods de-emphasized
- Time range state managed by `time_range_selection_connector`

## 5. Revenue Calculation & KPI Cards
- **Revenue connector** (`revenue_calculation_connector`) computes from forecast + pricing inputs + selected time range
- **4 KPI cards**: Total Revenue, Ticket Revenue, FastPASS Revenue, Avg Revenue/Visitor
- Scoped to selection (full horizon if none, single day, or range)
- All update instantly on input or selection change

## 6. Revenue Breakdown Chart
- Stacked bar or area chart: Ticket vs FastPASS revenue over time
- Always reflects same time scope as KPI cards
- Updates reactively with selection and pricing inputs

## 7. Visual Theme
- Custom color palette applied globally: Primary (#ec6d13), Secondary (#24598f), Accent (#f4c025), Background (#faf8f5), Text (#1b2232), Muted (#efebe7), Border (#e7e1da)
- Clean, minimal, executive-grade design with tooltips, no technical jargon
- Uncertainty always visually explicit

## 8. Architecture Principles
- Strict connector separation: data → forecast → revenue → UI
- All logic commented with what/why/how
- No hidden transformations; fully auditable
- Extensible for future inputs (weather, promotions, capacity)

