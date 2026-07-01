# 2026 Performance Window, Allocation Ranking, and Performance Visuals Design

## Goal

The dashboard should show the fund track record from January 2026 onward, rank allocation by current market value, and use the performance panel space for actionable comparison context.

## Decisions

- Fund start date is `2026-01-01`.
- Portfolio history and benchmark chart data before `2026-01-01` are excluded from the visible track record.
- Allocation slices are sorted by current value descending, including cash.
- The performance panel keeps the main rebased line chart and adds compact analytics for latest rebased values, excess return versus TOPIX and Nikkei 225, and best/worst visible portfolio day.

## Scope

- No paid data APIs.
- No Chrome automation.
- No change to CSV import format or manual cash behavior.
- No change to 6846 名証 quote handling.

## Testing

- Unit tests cover the start-date clamp and allocation ordering.
- Component or helper tests cover performance analytics labels and values.
- Full test suite and production build must pass.
