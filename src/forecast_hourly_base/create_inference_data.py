"""
Create inference dataframe for SARIMAX from weather data.
Based on the structure from chek_data_preparation.ipynb
"""
from pathlib import Path
import pandas as pd
import sys

# Setup paths
ROOT = Path(__file__).parent.parent
DATA_DIR = ROOT / 'data'

# Read weather data
weather_df = pd.read_csv(DATA_DIR / 'weather.csv', skiprows=3)
print(f"Weather data shape: {weather_df.shape}")
print(f"Weather columns: {weather_df.columns.tolist()}")
print(f"\nFirst few rows:")
print(weather_df.head())

# Parse the time column
weather_df['dt_iso'] = pd.to_datetime(weather_df['time'])
weather_df = weather_df.rename(columns={
    'temperature_2m (°C)': 'temp',
    'pressure_msl (hPa)': 'pressure',
    'relative_humidity_2m (%)': 'humidity',
    'wind_speed_10m (m/s)': 'wind_speed',
    'cloud_cover (%)': 'clouds_all',
    'rain (mm)': 'rain_1h'
})

# Filter for July 27, 2022 from 9am to 11pm (23:00)
start_time = pd.Timestamp('2022-07-27 09:00:00')
end_time = pd.Timestamp('2022-07-27 23:00:00')

weather_filtered = weather_df[
    (weather_df['dt_iso'] >= start_time) & 
    (weather_df['dt_iso'] <= end_time)
].copy()

print(f"\nFiltered weather data shape: {weather_filtered.shape}")
print(f"Time range: {weather_filtered['dt_iso'].min()} to {weather_filtered['dt_iso'].max()}")

# Get list of all rides from waiting_times.csv
waiting_times_df = pd.read_csv(DATA_DIR / 'waiting_times.csv')
rides = waiting_times_df['ENTITY_DESCRIPTION_SHORT'].unique()
print(f"\nTotal unique rides: {len(rides)}")
print(f"Sample rides: {rides[:5]}")

# Create a row for each ride for each hour
rows = []
for ride in rides:
    for _, weather_row in weather_filtered.iterrows():
        dt = weather_row['dt_iso']
        
        row = {
            'date_hour': dt,
            'ENTITY_DESCRIPTION_SHORT': ride,
            'wait_time_avg': 0.0,
            'attendance': 0.0,
            'temp': weather_row['temp'],
            'pressure': weather_row['pressure'],
            'humidity': weather_row['humidity'],
            'wind_speed': weather_row['wind_speed'],
            'clouds_all': weather_row['clouds_all'],
            'rain_1h': weather_row['rain_1h'],
        }
        
        # Add hour and day of week features
        row['hour'] = dt.hour
        row['day_of_week'] = dt.dayofweek
        
        # Add month dummy variables (month_1 through month_12)
        month = dt.month
        for m in range(1, 13):
            row[f'month_{m}'] = 1 if m == month else 0
        
        rows.append(row)

# Create dataframe
full_df = pd.DataFrame(rows)

print(f"\nFinal dataframe shape: {full_df.shape}")
print(f"Columns: {full_df.columns.tolist()}")
print(f"\nFirst few rows:")
print(full_df.head(10))

print(f"\nMonth encoding check (should be month_7=1 for July):")
print(full_df[['date_hour', 'month_7', 'month_8']].head())

# Save to CSV
output_file = DATA_DIR / 'inference_data_july27.csv'
full_df.to_csv(output_file, index=False)
print(f"\nSaved to: {output_file}")
