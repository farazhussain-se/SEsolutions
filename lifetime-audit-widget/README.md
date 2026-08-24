# farazhussain / lifetime-audit-widget

Life Time Club Audit — a standalone Experience Studio custom widget. Runs a
facility/club audit checklist, scores it, and creates Staffbase tasks for
failures. Facility Operations failures also offer a simulated Workday
facilities-requisition flow.

## Installation

```bash
$ npm install
```

## Running the app

| Command | Description |
|---|---|
| `npm start` | Starts the development server |
| `npm run build` | Creates the production build |
| `npm run build:watch` | Creates the production build and watch for changes |
| `npm run test` | Runs the unit tests |
| `npm run test:watch` | Runs the unit tests and watches for changes |
| `npm run type-check` | Checks the codebase on type errors |
| `npm run type-check:watch` | Checks the codebase on type errors and watches for changes |
| `npm run lint` | Checks the codebase on style issues |
| `npm run lint:fix` | Fixes style issues in the codebase |

## Loading it in Experience Studio

Add a custom widget pointing at the built bundle:

```
https://farazhussain-se.github.io/SEsolutions/lifetime-audit-widget/dist/farazhussain.lifetime-audit-widget.js
```

The only setting most installs need is **API Token** (a Basic-auth Branch API
token, created once in Studio's API Access settings). The branch's own base
URL is detected automatically via `widgetApi.getBranchInformation()` — there
is no separate "Base URL" field to fill in.

## Question source (Apps Script) — intentionally not exposed

The original vendor widget this was forked from reads its question bank from
a Google Apps Script `/exec` endpoint (an authenticated proxy in front of a
private Google Sheet). That field was removed from this widget's config
because it doesn't apply to this deployment: the Life Time Winter Park
question bank ships **embedded** in `src/index.ts` (`DUMMY_QUESTIONS`), so the
widget works standalone with zero setup. See
`lifetime-winterpark-audit-bank.csv` for the source data (mirrors the
original 14-column sheet layout) if you want to edit it — regenerate the
embedded array from that CSV and paste it back into `src/index.ts`.

## Club picker — hybrid source

"Clubs" are Staffbase Tasks-plugin installations, fetched live via the API.
If none are visible to the viewer (no API token, or the Tasks app has no
installations at this branch), the picker falls back to three embedded Life
Time clubs (`DEMO_CLUBS` in `src/index.ts`) so the widget still runs as a
self-contained demo — in that case, task creation is **simulated** (logged,
no API calls) rather than hitting a nonexistent installation. Selecting a
real Tasks installation always creates real tasks.

## Facility Operations routing

Questions whose `taskRole` is `Club Facility Specialists & Engineers` (the
real Life Time group for facilities staff — see `facopsrole` config) have
their failure task auto-assigned to that group by title match, and offer a
"Raise Facilities requisition in Workday" toggle. That requisition flow is a
simulated demo (logged, `localStorage`-persisted) pending a real Workday
integration.

## Building the form for configuration

This project uses [react-jsonschema-form](https://rjsf-team.github.io/react-jsonschema-form/)
for previewing the widget's configuration form in the local dev server. For
more information consult their
[documentation](https://rjsf-team.github.io/react-jsonschema-form/docs/).
