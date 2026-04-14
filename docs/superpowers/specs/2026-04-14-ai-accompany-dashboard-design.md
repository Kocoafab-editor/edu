# AI Accompany Dashboard Design

- Date: 2026-04-14
- Status: Approved in terminal discussion
- Scope: `ai_accompany/` dashboard first release
- Data Source: local `JSON` fetched by the browser, with future source abstraction for Google Drive
- Excluded: authenticated backend integration, full school/team detail tabs, production Google Drive auth flow

## 1. Summary

`ai_accompany` will become a static dashboard page for education stakeholders to review team progress at a glance. The first release focuses on a clean overview experience rather than a full control surface.

The page will be split into `index.html`, `style.css`, and `app.js`, use a separate `assets/` folder for visual resources, and load dashboard data from a local `data.json` file via `fetch()`. The UI will implement the large page shell, top header, overview KPI cards, region progress list, and a selected-region module completion panel with five circular charts.

## 2. Goals

- Build a new dashboard page under `ai_accompany/` rather than extending the temporary prototype
- Keep the page suitable for public-facing review with a restrained, clean document-style layout
- Separate structure, styles, and behavior into dedicated files
- Load dashboard records from `JSON` instead of parsing `.xlsx` in the browser
- Make theme colors easy to change from CSS custom properties at the top of the stylesheet
- Add a data-source abstraction so the local JSON source can later be replaced by a Google Drive source
- Deliver the first release around the overview panel only

## 3. Non-Goals

- Implementing authenticated Google Drive access in this phase
- Building backend token handling or proxy services
- Completing the school tab, team tab, modal details, or final toggle interactions in this phase
- Reusing `logger/graph.js` for incompatible chart needs
- Keeping the existing `프로토타입.html` structure as the main implementation path

## 4. Current Data Context

The provided workbook contains:

- source sheet: `MASTER_DATA`
- helper sheet: `진척도_요약`

`MASTER_DATA` currently holds the meaningful values. Based on the workbook inspected on 2026-04-14:

- 40 team rows
- 10 regions
- 5 module progress fields: `M1_Status` through `M5_Status`
- additional fields for `Risk_Flag`, `Teacher_Note`, `Doc_URL`, and last updated date

The summary sheet currently has mostly empty aggregate fields, so browser-side aggregation should use `MASTER_DATA` as the canonical dataset.

## 5. User Experience

### 5.1 Page Shell

The page uses a simple two-layer layout:

- full-page solid background
- one centered white surface container with rounded corners

The main surface is the only content panel. It should feel like a report sheet rather than an app console.

### 5.2 Header

The header is left-aligned and contains only:

- logo image on the left
- dashboard title on the right of the logo

The logo is a placeholder asset stored in `ai_accompany/assets/` so it can be replaced later without editing markup structure.

No dropdowns, filters, or action buttons appear in the header for this release.

### 5.3 Overview Toggle Bar

A full-width toggle bar is placed at the top edge of the white surface. It visually suggests section switching across the panel width.

For this first release:

- render the toggle buttons
- show the overview button as active
- do not wire the non-overview button yet

### 5.4 KPI Section

The first content row contains four KPI cards. On wide screens they render in one row; on narrower screens they collapse to a `2 x 2` grid.

The initial four KPI values are:

- overall progress snapshot
- participating team count
- average progress
- one additional operational metric derived from risk distribution

The exact labels can be refined in implementation, but the four-card layout is fixed in this release.

### 5.5 Region Progress List

Below the KPI row, the page shows region-level average progress as a stacked vertical list. Each region appears as one row containing:

- region label
- progress bar
- numeric average percentage

The list uses plain HTML and CSS rather than a general graph utility. Rows should look selectable, not like static decoration.

### 5.6 Selected Region Detail

Selecting a region reveals the detail section below the region list for that region. This detail panel shows five circular progress charts for:

- `M1`
- `M2`
- `M3`
- `M4`
- `M5`

Each circle represents the selected region's module-level aggregate. The detail panel updates when the selected region changes. On first load, one region is selected by default.

## 6. Visual Direction

The dashboard should avoid looking like an internal admin console full of chrome. The intended look is a polished reporting page:

- soft neutral background
- white surface card
- restrained border and shadow treatment
- strong but not saturated accent color
- pastel semantic colors for good/caution/risk

All major colors should be controlled near the top of `style.css` with CSS custom properties, including:

- `--color-primary`
- `--color-bg`
- `--color-surface`
- `--color-text`
- `--color-muted`
- `--color-border`
- `--color-success`
- `--color-warn`
- `--color-danger`

## 7. Data and Aggregation Model

## 7.1 Raw Record Shape

The JSON payload should normalize each team record to a browser-friendly object with fields such as:

- `teamId`
- `region`
- `schoolName`
- `teamName`
- `projectTheme`
- `lastUpdated`
- `docUrl`
- `modules.m1` through `modules.m5`
- `riskFlag`
- `teacherNote`

## 7.2 Derived Metrics

The browser computes:

- overall team count
- average progress
- region average progress
- selected-region module aggregates
- risk distribution counts for KPI display

`Progress_Total` in the workbook is currently empty for sample rows, so the dashboard should derive total progress from the five module values rather than trust that field.

## 7.3 Selection Rules

- initial state selects a default region after data load
- selecting another region replaces the previous selection
- detail charts always reflect the current selection

## 8. Source Architecture

## 8.1 File Layout

The first release should be organized around these files:

- `ai_accompany/index.html`
- `ai_accompany/style.css`
- `ai_accompany/app.js`
- `ai_accompany/data/data.json`
- `ai_accompany/assets/logo-placeholder.svg`

Optional support artifacts, such as a workbook-to-JSON conversion script, may be added if needed, but they are not part of the runtime page shell.

## 8.2 Data Source Boundary

`app.js` should keep data loading separate from rendering logic.

Recommended shape:

- `LocalJsonSource`
  - fetches `./data/data.json`
  - returns normalized team records
- `GoogleDriveSource`
  - placeholder skeleton only in this phase
  - exposes the same `load()` contract
  - is not used by default

This keeps the first release deployable on static hosting while preserving a clean swap point for future authenticated data loading.

## 9. Component Responsibilities

### 9.1 HTML

`ai_accompany/index.html` owns:

- header markup
- overview toggle bar markup
- KPI container
- region list container
- selected-region detail container
- script and stylesheet links

It should not contain inline CSS or inline JavaScript.

### 9.2 CSS

`ai_accompany/style.css` owns:

- theme variables
- page background and surface layout
- header and logo treatment
- toggle button visuals
- KPI card layout
- region progress row styling
- circular chart presentation
- responsive rules

### 9.3 JavaScript

`ai_accompany/app.js` owns:

- page bootstrap
- data-source selection
- JSON fetch and normalization
- aggregation helpers
- initial region selection
- KPI rendering
- region list rendering
- selected-region module chart rendering
- click handling for region selection

## 10. Interaction Constraints for Release 1

Only these interactions are required in this phase:

- load page data from local JSON
- choose a default region after load
- switch selected region on row click
- refresh the five circular charts when selection changes

These are explicitly deferred:

- switching to school/team tabs
- school expansion behavior
- team modal details
- active Google Drive retrieval

## 11. Testing Strategy

The repository already uses lightweight Node-based tests for static pages. The dashboard implementation should follow the same pattern where practical.

Tests for the first release should cover:

- HTML contract for required containers and linked assets
- pure aggregation helpers for KPI and region calculations
- derived total progress logic from module fields
- default-region selection behavior
- data-source contract for local JSON loading logic where feasible

Manual checks should confirm:

- page renders cleanly on desktop and mobile widths
- KPI cards collapse from four columns to two-by-two as intended
- clicking a region updates the selected state
- the five circular charts change with region selection
- logo replacement is straightforward through the assets folder

## 12. Risks and Mitigations

### 12.1 Static Hosting vs Authenticated Drive

Authenticated private Drive access is not a fit for a pure static page without additional infrastructure. The mitigation is to keep Drive integration behind a source interface and ship the first release using local JSON.

### 12.2 Workbook Drift

Future spreadsheets may change column names or add rows. The mitigation is to normalize input into a stable JSON contract and keep runtime logic dependent on that contract, not workbook internals.

### 12.3 Scope Creep

School and team drilldowns are already defined conceptually but not needed for the first deliverable. The mitigation is to implement only the overview surface and leave the toggle placeholders visually present but functionally inactive.
