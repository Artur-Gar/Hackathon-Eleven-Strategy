/**
 * time_range_selection_connector.ts
 * 
 * WHAT: Manages user interaction state for time range selection on the forecast chart.
 * WHY: Decouples selection logic from chart rendering and revenue computation.
 * HOW: Tracks click events, maintains start/end dates and selection mode.
 * 
 * Selection rules:
 *   - First click → select a single date (single_day mode)
 *   - Second click → define a date range (range mode)
 *   - Third click → reset to single_day at new date
 *   - Selection applies ONLY to forecasted periods
 */

export type SelectionMode = 'none' | 'single_day' | 'range';

export interface TimeRangeSelection {
  start_date: Date | null;
  end_date: Date | null;
  selection_mode: SelectionMode;
}

/** Initial state: no selection */
export function createEmptySelection(): TimeRangeSelection {
  return {
    start_date: null,
    end_date: null,
    selection_mode: 'none',
  };
}

/**
 * handleChartClick
 * WHAT: Processes a click on a forecast date and returns the new selection state.
 * WHY: Keeps selection logic pure and testable outside React.
 */
export function handleChartClick(
  current: TimeRangeSelection,
  clickedDate: Date
): TimeRangeSelection {
  if (current.selection_mode === 'none' || current.selection_mode === 'range') {
    // First click or reset: select single day
    return {
      start_date: clickedDate,
      end_date: clickedDate,
      selection_mode: 'single_day',
    };
  }

  // Second click: define range
  const start = current.start_date!;
  const [rangeStart, rangeEnd] = clickedDate < start
    ? [clickedDate, start]
    : [start, clickedDate];

  return {
    start_date: rangeStart,
    end_date: rangeEnd,
    selection_mode: rangeStart.getTime() === rangeEnd.getTime() ? 'single_day' : 'range',
  };
}
