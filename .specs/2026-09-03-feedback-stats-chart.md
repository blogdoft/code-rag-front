# Spec: Feedback Stats Chart

Status: Implemented (revised six times — moved into a dedicated `reports` feature module with a
top-level "Reports" nav entry, then given an in-chart project indicator (superseded, see the
fourth-pass note), then reworked so every project is broken out per week instead of aggregated or
single-selected, then given a full-width layout and a proper date-range validation toast, then
given alternating week-band shading, then given a pre-filled default date range; see the revision
notes below, newest first)
Source: `https://code-rag-api.home.arpa/swagger/v1/swagger.json` (confirmed live, 2026-09-03)

## Revision note (2026-09-03, seventh pass — pre-fill the date fields with the last 4 weeks)

Previously `startDate`/`endDate` defaulted to `''` (empty), relying entirely on the API's own
default-window behavior (§2: last 30 days when both are omitted) — the date fields showed empty on
first load even though a request with an implicit range had already gone out. This makes the
default range explicit and visible: `startDate`/`endDate` are now initialized to *4 weeks ago* and
*today* (not the API's own 30-day default — 4 weeks/28 days was the exact range requested), computed
once at field-declaration time in `features/reports/feedback-stats-page.ts`:

```ts
protected readonly startDate = signal(toDateInput(weeksAgo(4)));
protected readonly endDate = signal(toDateInput(new Date()));
```

Two new local pure functions (same file, alongside `formatWeekLabel`):

```ts
function weeksAgo(count: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - count * 7);
  return date;
}

function toDateInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
```

`toDateInput` uses the browser's **local** calendar date (`getFullYear`/`getMonth`/`getDate`, not
UTC) since that's what a `<input type="date">` field and a user's notion of "today" mean — matching
what the field already displays/accepts. This local calendar date then flows unchanged into the
existing `toIsoStart`/`toIsoEnd` helpers (§8, unchanged), which is the same UTC-boundary convention
already established for whatever the user types into these fields; no new timezone handling was
introduced; new is only that these two fields start non-empty instead of empty.
Because the constructor already calls `fetchStats()` once (§8, unchanged), the very first request
this page makes now carries explicit `start_date`/`end_date` query params instead of omitting them
and relying on the API's own default window.

## Revision note (2026-09-03, sixth pass — alternating week-band shading)

Once each week could span several x-axis slots (one per project — fourth-pass note), it got harder
to tell at a glance where one week's group of bars ended and the next began, especially with many
projects. This adds a subtle alternating background band behind every other week's group of slots.

- `features/reports/feedback-trend-chart.ts`: a small custom Chart.js plugin, `weekBandsPlugin`
  (`id: 'weekBands'`), registered alongside the others in §5/§6. It hooks `beforeDatasetsDraw` and
  fills a translucent rectangle across the full plot height for every other week's index range,
  using `chart.scales['x'].getPixelForTick(index)` to find each band's left/right edge (padded by
  half a tick's width so the band fully covers its bars rather than stopping at tick centers).
  Chosen over adding `chartjs-plugin-annotation` as a new dependency — the drawing need is a single
  fixed shape (a full-height rectangle) with no interactivity/tooltip/dragging, well within what a
  ~20-line plugin covers, unlike `chartjs-plugin-datalabels` (§5) which earns its dependency by
  handling the harder, general problem of positioned/formatted per-point text labels.
- A new exported pure function, `computeWeekBandRanges(labels: ChartCategoryLabel[]): WeekBandRange[]`
  (same file), groups consecutive x-axis slots that share the same week — the label's first element
  when nested (`[week, project]`, per the fourth pass), or the whole label when it's a plain string
  — into `{ start, end }` index ranges. `buildConfig()` computes this once per render and passes it
  as `options.plugins.weekBands = { ranges, color }`, where `color` is a light/dark-aware
  translucent slate (`rgba(100, 116, 139, 0.08)` light / `rgba(148, 163, 184, 0.12)` dark, chosen to
  read as a wash rather than compete with the bar colors).
  A `declare module 'chart.js' { interface PluginOptionsByType<TType> { weekBands?: ... } }`
  augmentation (the same mechanism `chartjs-plugin-datalabels` itself uses for its own `datalabels`
  option) keeps `options.plugins.weekBands` type-checked rather than needing an `as` cast.
- No change to the page (`feedback-stats-page.ts`/`.html`) — the chart derives band ranges entirely
  from the `labels` input it already receives, so no new page-level input/computed was needed.

## Revision note (2026-09-03, fifth pass — full-width layout, date-range validation toast)

Two independent follow-ups, both to `features/reports/feedback-stats-page.ts`/`.html`:

1. **Full-width layout.** The page's root element used `mx-auto max-w-3xl` (copied from
   `features/settings/settings-page.html`'s narrow-form layout), which cramped the chart once it
   started rendering many (week, project) x-axis slots (§8, fourth-pass note) — labels overlapped
   and had to rotate. Changed to `flex w-full flex-col gap-6 px-4 py-8`, matching
   `features/code-search/code-search-page.html`'s existing full-width convention (that page already
   has no `max-w`/`mx-auto` for the same reason: wide tabular/chart content reads better
   unconstrained). The nav bar's own `max-w-3xl` (`app.html`) is a separate, sibling element outside
   `<router-outlet>` and is unaffected.
2. **Date-range validation surfaced via toast, not inline text.** §10 originally left "start ≤ end"
   validation as an unimplemented "UX nicety." This pass implements it — checked inline in
   `fetchStats()` (not a separate `computed()`), short-circuiting before the request is built:
   ```ts
   const startDate = this.startDate();
   const endDate = this.endDate();
   if (startDate && endDate && startDate > endDate) {
     this.toast.error('Start date must be on or before End date.');
     return;
   }
   ```
   `ToastService` is injected the same way `SettingsPage` does it (`private readonly toast =
   inject(ToastService);`) — this app's established convention for a validation failure the user
   needs to notice, per `settings-page.ts`'s `isValidHttpUrl` check. An inline error paragraph
   under the fields was tried first and rejected in favor of this — toast-on-submit is the pattern
   already used elsewhere in the app, so the button stays enabled (no `dateRangeError` computed
   gating `[disabled]`) and validation happens at the moment `fetchStats()` runs, exactly like
   `SettingsPage.save()`.
   **The message names the fields by their visible UI label ("Start date", "End date" — matching
   the `<label>` text in the template verbatim), never the API's wire/JSON field names
   (`start_date`, `end_date`)** — a general rule for this app's user-facing validation text, not
   specific to this one message: a user reads the form by its labels, not by the request body it
   produces.

## Revision note (2026-09-03, fourth pass — break out every project per week, not aggregate)

The third pass (below) added a single chart title reading "Project: X" — but that only worked
because at the time "All projects" meant *summed* across projects into one blended figure. The
user clarified the actual requirement: **within each week, show every project separately**, each
with its own Total/Useful/Not-useful group, not summed together — and the chart itself must show
which project each group of bars belongs to. This supersedes both the aggregation behavior from
the second pass and the single title from the third pass:

- **Removed**: `aggregateWeek()`/`resolveWeekEntry()` (§8) — there is no more "sum across all
  projects" mode. Removed: the `Title` plugin registration, `projectLabel` input, and
  `options.plugins.title` config on `feedback-trend-chart.ts` (§6) — a single title can't represent
  multiple projects shown at once, and is superseded by the mechanism below, which also covers the
  single-project case.
- **New mechanism — nested x-axis labels**: Chart.js's category scale accepts an array of
  `[topLabel, bottomLabel]` pairs as `data.labels`, rendering each tick as two stacked lines. The
  page now flattens the API's dense week × project grid into one flat list of `(week, project)`
  slots — `flatEntries` (§8) — and builds `chartLabels` as `[weekLabel, projectName]` pairs, one per
  slot. The three bar datasets (Total/Useful/Not-useful) and the trend line (§6) are unchanged in
  shape — they're still exactly 3 bar series + 1 line series — but now index over these flattened
  slots instead of one-per-week, so each week ends up with N adjacent bar groups (one per project),
  each visibly labeled with that project's name on the axis. This reuses a built-in Chart.js
  capability rather than adding a plugin or restructuring into per-project datasets.
- The `Project` combobox (§8, unchanged) still exists and still narrows the request via
  `project_id` when a single project is chosen (reducing data transferred and the number of x-axis
  slots shown) — "All projects" simply means "don't filter server-side," and the flattening/labeling
  above applies identically whether the response contains one project or many.
- The trend line is computed over the flattened, week-major/project-minor `usefulCounts` sequence
  (§7, unchanged formula) — it still reads as an overall upward/downward trend across the visible
  range, with local zigzags where projects differ within a week, which is an acceptable trade-off
  for keeping a single trend line rather than one per project (kept simple; not requested).

## Revision note (2026-09-03, third pass — superseded by the fourth pass above)

The chart had no indication, inside the chart itself, of which project's data it was showing —
that context lived only in the `Project` combobox above it, so the chart alone (e.g. if
screenshotted or viewed without the surrounding page) didn't say what it represented. This
revision adds a Chart.js title (the standard `Title` plugin) reading `Project: <name>` (or
`Project: All projects` for the aggregate view) directly on the canvas:

- `features/reports/feedback-trend-chart.ts`: register the `Title` plugin (imported from
  `chart.js`, alongside the other pieces already registered in §5/§6) and add a
  `projectLabel = input('')` input. `buildConfig()` takes `projectLabel` as an added parameter and
  sets `options.plugins.title = { display: projectLabel.length > 0, text: 'Project: ' + projectLabel, color: textColor, font: { size: 14, weight: 'bold' } }`
  (using the same light/dark `textColor` already computed for ticks/legend — see §6). `display` is
  `false` only for the brief window before the project list/label has loaded.
- `features/reports/feedback-stats-page.ts`: add `selectedProjectLabel = computed(() =>
  this.projectOptions().find(option => option.id === this.selectedProjectId())?.label ?? '')`. No
  special-casing for the "All projects" sentinel (`ALL_PROJECTS_ID = -1`) is needed — it's already
  present in `projectOptions()` with the label `'All projects'`, so the same `find()` resolves it
  like any other option.
- `features/reports/feedback-stats-page.html`: pass `[projectLabel]="selectedProjectLabel()"` to
  `<app-feedback-trend-chart>` alongside the existing bindings (§8).
- No separate DOM heading was added for this — the in-chart title is the single source of truth,
  avoiding showing the project name twice (once in the `Project` combobox, once redundantly above
  the chart).

## Revision note (2026-09-03, second pass — `reports` module)

The first implementation placed this feature's files directly under
`features/feedback-stats/` and exposed it via a `/feedback-stats` route with a `Feedback` nav
link. This revision moves all of it — unchanged in behavior — into `features/reports/`, a feature
folder scoped to reporting screens in general (this is the first report; more can be added under
the same folder/route prefix later without another reshuffle), and renames the route/nav entry to
match:

- Files: `features/feedback-stats/{feedback-stats-page,feedback-trend-chart,trend}.{ts,html,spec.ts}`
  → `features/reports/{feedback-stats-page,feedback-trend-chart,trend}.{ts,html,spec.ts}` (plain file
  move — every reference below already reflects the new path). Component/file names keep their
  `feedback-stats`/`feedback-trend-chart` naming since they're still specifically about feedback
  stats; `reports` is the module they live in, not a rename of what they do. No import paths inside
  these files change: `core/`- and `shared/`-relative imports (`../../core/...`, `../../shared/...`)
  are unaffected since the new folder sits at the same nesting depth as the old one.
- Route: `feedback-stats` → `reports` (`app.routes.ts`).
- Nav link: `Feedback` → `Reports` (`app.html`), same position in the nav (after `Settings`).
- No behavior, API contract, or component logic changes — see §§1-8 below, unchanged from the first
  pass except for the path/route/nav renames threaded through §6, §8, §9, §11.

## 1. Background

A new backend endpoint, `GET /api/v1/code-queries/feedback/stats`, returns weekly feedback
effectiveness statistics as a dense week x project grid. This app has no UI for it yet. This spec
adds a new page that renders the data as a grouped bar chart (total / useful / not-useful feedback
counts per week) with a trend line following the useful-feedback volume, plus a project scope
selector (single project or all projects aggregated).

## 2. API contract (confirmed via live swagger.json)

`GET /api/v1/code-queries/feedback/stats`

Query params (all optional):
- `start_date` (date-time, UTC ISO 8601) — inclusive lower bound.
- `end_date` (date-time, UTC ISO 8601) — inclusive upper bound.
- `project_id` (int64) — restrict to a single project; 404 if it doesn't match any project.

When neither date is given, the window defaults to the last 30 days. When only one is given, the
other is derived as a 30-day span. The effective window must not exceed 366 days (400 if exceeded,
or if `start_date` is after `end_date`).

Response (snake_case, per `CLAUDE.md`'s "trust the live response" rule):

```jsonc
{
  "start_date": "2026-08-01T00:00:00Z",
  "end_date": "2026-08-31T00:00:00Z",
  "weeks": [
    {
      "week_start": "2026-07-27",   // date only, Monday
      "week_end": "2026-08-02",     // date only, Sunday
      "projects": [
        {
          "project_id": 1,
          "project_name": "example",
          "total_count": 12,
          "useful_count": 9,
          "not_useful_count": 3,
          "useful_percentage": 75.0,
          "not_useful_percentage": 25.0
        }
      ]
    }
  ]
}
```

Notes:
- `weeks` is nullable in the schema; treat `null` as `[]` when mapping (same for each week's
  `projects`).
- Every week includes **every registered project** (zero-filled) unless `project_id` narrows it to
  one. There's no need to defensively handle a missing project entry for the selected id in the
  normal case, but the mapper should fall back to a zero-value entry if one is ever absent, rather
  than throwing.
- `week_start`/`week_end` are date-only strings (`YYYY-MM-DD`); `start_date`/`end_date` are
  full date-times.

## 3. New model — `core/models/feedback-stats.ts`

Following this repo's model convention (plain `export interface`, camelCase fields, no barrel file
— see `core/models/project.ts`, `core/models/code-query-filters.ts`):

```ts
export interface ProjectFeedbackStats {
  projectId: number;
  projectName: string | null;
  totalCount: number;
  usefulCount: number;
  notUsefulCount: number;
  usefulPercentage: number;
  notUsefulPercentage: number;
}

export interface WeeklyFeedbackStats {
  weekStart: string; // ISO date (YYYY-MM-DD)
  weekEnd: string;
  projects: ProjectFeedbackStats[];
}

export interface FeedbackStats {
  startDate: string; // ISO date-time
  endDate: string;
  weeks: WeeklyFeedbackStats[];
}
```

## 4. New service — `core/services/feedback-stats.service.ts`

Follow the exact pattern of `core/services/code-queries.service.ts` (private snake_case DTO
interfaces + module-level `to*` mapper functions + `inject(HttpClient)` + a single `map` in the
`Observable` pipeline):

```ts
import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { map, type Observable } from 'rxjs';
import type { FeedbackStats, ProjectFeedbackStats, WeeklyFeedbackStats } from '../models/feedback-stats';

interface ProjectFeedbackStatsDto {
  project_id: number;
  project_name: string | null;
  total_count: number;
  useful_count: number;
  not_useful_count: number;
  useful_percentage: number;
  not_useful_percentage: number;
}

interface WeeklyFeedbackStatsDto {
  week_start: string;
  week_end: string;
  projects: ProjectFeedbackStatsDto[] | null;
}

interface FeedbackStatsDto {
  start_date: string;
  end_date: string;
  weeks: WeeklyFeedbackStatsDto[] | null;
}

export interface FeedbackStatsQuery {
  startDate?: string;
  endDate?: string;
  projectId?: number;
}

@Injectable({ providedIn: 'root' })
export class FeedbackStatsService {
  private readonly http = inject(HttpClient);

  getStats(query: FeedbackStatsQuery = {}): Observable<FeedbackStats> {
    let params = new HttpParams();
    if (query.startDate) params = params.set('start_date', query.startDate);
    if (query.endDate) params = params.set('end_date', query.endDate);
    if (query.projectId != null) params = params.set('project_id', query.projectId);

    return this.http
      .get<FeedbackStatsDto>('/api/v1/code-queries/feedback/stats', { params })
      .pipe(map(toFeedbackStats));
  }
}

function toFeedbackStats(dto: FeedbackStatsDto): FeedbackStats {
  return {
    startDate: dto.start_date,
    endDate: dto.end_date,
    weeks: (dto.weeks ?? []).map(toWeeklyFeedbackStats),
  };
}

function toWeeklyFeedbackStats(dto: WeeklyFeedbackStatsDto): WeeklyFeedbackStats {
  return {
    weekStart: dto.week_start,
    weekEnd: dto.week_end,
    projects: (dto.projects ?? []).map(toProjectFeedbackStats),
  };
}

function toProjectFeedbackStats(dto: ProjectFeedbackStatsDto): ProjectFeedbackStats {
  return {
    projectId: dto.project_id,
    projectName: dto.project_name,
    totalCount: dto.total_count,
    usefulCount: dto.useful_count,
    notUsefulCount: dto.not_useful_count,
    usefulPercentage: dto.useful_percentage,
    notUsefulPercentage: dto.not_useful_percentage,
  };
}
```

## 5. New dependency — Chart.js

```
npm install chart.js
```

Also add `chartjs-plugin-datalabels` (the standard, officially-documented Chart.js plugin for
rendering per-bar text labels) since the useful/not-useful bars need a "value (percentage%)" label
baked onto each bar — Chart.js has no built-in data-label rendering, and hand-rolling label
positioning for grouped bars is unnecessary complexity given a well-maintained plugin exists for
exactly this:

```
npm install chartjs-plugin-datalabels
```

Register only the Chart.js pieces actually used (not the `chart.js/auto` bundle, to avoid pulling
in unused chart types/scales):

```ts
import {
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  Legend,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
} from 'chart.js';
import ChartDataLabels from 'chartjs-plugin-datalabels';

Chart.register(
  BarController,
  LineController,
  BarElement,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
  ChartDataLabels,
  weekBandsPlugin, // this file's own custom plugin, see §6 — not a package
);
```

(No `Title` plugin — which project each group of bars belongs to is shown via nested x-axis labels
instead, see §6/§8, not a chart-wide title. No `chartjs-plugin-annotation` either — the week-band
highlighting in §6 is a single fixed rectangle shape with no interactivity, small enough to be a
local plugin rather than a new dependency; see the sixth-pass revision note for the reasoning.)

## 6. New component — `features/reports/feedback-trend-chart.ts`

A presentational wrapper around a `<canvas>` + Chart.js instance. Signal `input()`s (matching this
repo's signal-first component style, e.g. `shared/components/combobox/combobox.ts`):

```ts
export type ChartCategoryLabel = string | string[];

readonly labels = input<ChartCategoryLabel[]>([]);
readonly totalCounts = input<number[]>([]);
readonly usefulCounts = input<number[]>([]);
readonly notUsefulCounts = input<number[]>([]);
readonly usefulPercentages = input<number[]>([]);
readonly notUsefulPercentages = input<number[]>([]);
```

`labels` accepts either a plain week string or a `[weekLabel, projectName]` pair per x-axis slot —
Chart.js's category scale renders an array entry as a multi-line tick, so passing `[weekLabel,
projectName]` shows the project's name stacked directly under its week on the axis. This is the
one and only place the chart shows which project a group of bars belongs to (see §8 for how the
page builds these pairs) — there is no separate title/legend mechanism for it.

Behavior:
- `viewChild.required<ElementRef<HTMLCanvasElement>>('canvas')` for the `<canvas #canvas>`.
- `Chart.register(...)` (§5) runs once at module scope, not per-instance.
- An `effect()` in the constructor rebuilds the chart's `data` whenever the input signals change
  (destroy-and-recreate is simplest and avoids stale dataset-count bugs; this chart re-renders at
  most once per fetch, so perf is a non-issue). Destroy the `Chart` instance in the effect's cleanup
  and again via `DestroyRef`/`ngOnDestroy` so navigating away doesn't leak the canvas context.
- Datasets — exactly 3 bar series + 1 line series, regardless of how many (week, project) slots are
  in `labels()`/the count arrays (i.e. adding more projects lengthens the arrays, it does not add
  more datasets):
  1. `type: 'bar'`, label `'Total'`, data = `totalCounts()`, datalabels disabled (`datalabels: { display: false }` on this dataset only — the requirement is value+percentage labels on the useful/not-useful bars specifically, not on Total).
  2. `type: 'bar'`, label `'Useful'`, data = `usefulCounts()`, `datalabels.formatter = (value, ctx) => \`${value} (${usefulPercentages()[ctx.dataIndex]}%)\``.
  3. `type: 'bar'`, label `'Not useful'`, data = `notUsefulCounts()`, `datalabels.formatter` analogous using `notUsefulPercentages()`.
  4. `type: 'line'`, label `'Useful trend'`, data = `computeLinearTrend(usefulCounts())` (§7 — computed over the flattened, week-major/project-minor sequence, same as the bars), no points (`pointRadius: 0`), dashed (`borderDash: [6, 4]`), `datalabels: { display: false }`, plotted on the same (shared) y-axis as the bars since it's also a count.
- `x` scale: `type: 'category'`, labels = `labels()` (nested `[week, project]` pairs, built by the
  page — see §8).
- Dark mode: Chart.js needs its grid/tick/legend colors set explicitly (they don't inherit
  Tailwind's `dark:` variants). Read `document.documentElement.classList.contains('dark')` once at
  chart-(re)build time to pick a light/dark color pair for `scales.x.ticks.color`,
  `scales.y.ticks.color`, `scales.x.grid.color`, `plugins.legend.labels.color` — mirroring how
  `ThemeService` already toggles a `dark` class on `<html>` (check `core/services/theme.service.ts`
  for the exact class/attribute it sets before wiring this up).
- **Week-band shading** (own local plugin, not a package): a custom `Plugin<'bar'>` object,
  `weekBandsPlugin` (`id: 'weekBands'`), defined in this same file and registered once alongside the
  rest (§5). Its `beforeDatasetsDraw(chart, _args, options)` hook reads
  `options.plugins.weekBands` (`{ ranges: WeekBandRange[]; color: string }`) and, for every other
  entry in `ranges`, fills a full-height translucent rectangle spanning that week's x-axis slots —
  edges computed from `chart.scales['x'].getPixelForTick(range.start/end)`, padded by half a tick's
  pixel width so the band fully covers its bars instead of stopping at tick centers.
  `computeWeekBandRanges(labels: ChartCategoryLabel[]): WeekBandRange[]` (exported, pure, unit-tested
  directly) groups consecutive slots sharing the same week — `label[0]` when `label` is a `[week,
  project]` pair, or the whole `label` otherwise — into `{ start, end }` index ranges.
  `buildConfig()` calls it once per render and sets `options.plugins.weekBands = { ranges,
  color: weekBandColor }`, where `weekBandColor` is a dark-mode-aware translucent slate
  (`rgba(100, 116, 139, 0.08)` light / `rgba(148, 163, 184, 0.12)` dark, computed alongside
  `textColor`/`gridColor` above).
  A `declare module 'chart.js' { interface PluginOptionsByType<TType extends ChartType> { weekBands?: {...} } }`
  augmentation — the same mechanism `chartjs-plugin-datalabels` itself uses to type its own
  `datalabels` option — makes `options.plugins.weekBands` type-check normally, no `as` cast needed.

## 7. New pure helper — `features/reports/trend.ts`

Exported and unit-testable on its own (least-squares linear regression over the useful-count
series, index-based x-axis):

```ts
export function computeLinearTrend(values: number[]): number[] {
  const n = values.length;
  if (n === 0) return [];

  const xs = values.map((_, i) => i);
  const sumX = xs.reduce((a, b) => a + b, 0);
  const sumY = values.reduce((a, b) => a + b, 0);
  const sumXY = xs.reduce((acc, x, i) => acc + x * values[i], 0);
  const sumXX = xs.reduce((acc, x) => acc + x * x, 0);
  const denom = n * sumXX - sumX * sumX;
  const slope = denom === 0 ? 0 : (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;

  return xs.map((x) => slope * x + intercept);
}
```

`n === 1` (denom `0`) degenerates to a flat line at that single value, which is correct.

## 8. New page — `features/reports/feedback-stats-page.ts` (+ `.html`, `.spec.ts`)

Mirrors `features/settings/settings-page.ts`'s file layout (no separate stylesheet — Tailwind
utility classes only) and `features/code-search/code-search-page.ts`'s project-loading/Combobox
pattern. Root element is full-width (`flex w-full flex-col gap-6 px-4 py-8`, matching
`code-search-page.html`), **not** `settings-page.html`'s `mx-auto max-w-3xl` — this page's content
(a chart with potentially many x-axis slots, §6) needs the room, unlike a narrow settings form.

State:
```ts
private readonly ALL_PROJECTS_ID = -1; // sentinel; real project ids are positive per the API contract

protected readonly projectOptions = signal<ComboboxOption[]>([]); // includes a synthetic
  // { id: ALL_PROJECTS_ID, label: 'All projects' } entry prepended to the real projects
protected readonly selectedProjectId = model<number | null>(this.ALL_PROJECTS_ID);
protected readonly startDate = signal(toDateInput(weeksAgo(4))); // native <input type="date">
  // value, pre-filled to 4 weeks ago (§ seventh-pass revision note); clearing it via
  // [appEscClearable] still leaves it genuinely empty, letting the API's own default window apply
protected readonly endDate = signal(toDateInput(new Date())); // pre-filled to today
protected readonly isLoading = signal(false);
protected readonly stats = signal<FeedbackStats | null>(null);
```

Behavior:
- Constructor loads `ProjectsService.list()` once (same as `CodeSearchPage`'s constructor), builds
  `projectOptions` with the "All projects" entry first, then calls `fetchStats()` once for the
  initial default view.
- `fetchStats()`: builds a `FeedbackStatsQuery` from `startDate`/`endDate` (converted to ISO
  date-times, e.g. append `T00:00:00Z`/`T23:59:59Z`, or send the raw date value — confirm the API
  accepts a plain `YYYY-MM-DD` for a `date-time` query param, otherwise convert explicitly) and
  `projectId: selectedProjectId() === ALL_PROJECTS_ID ? undefined : selectedProjectId()`. Sets
  `isLoading`, calls `feedbackStatsService.getStats(query)`, resets `isLoading` in both `complete`
  and `error` (matching `code-search-page.ts`'s `submit()` pattern) — the global
  `error-toast.interceptor.ts` handles user-facing error messaging, no local error state needed.
- A "Refresh"/"Apply" button triggers `fetchStats()` explicitly (matching the app's explicit-submit
  UX rather than fetching on every keystroke/selection) — selecting a different project or date and
  clicking the button re-fetches.
- `flatEntries = computed(() => ...)`: flattens the API's dense week × project grid into one flat
  list, one entry per `(week, project)` slot, in the order the API returns them (weeks ascending,
  projects ascending by id within each week — no client-side re-sorting):
  ```ts
  interface FlatEntry {
    weekLabel: string;
    projectName: string;
    totalCount: number;
    usefulCount: number;
    notUsefulCount: number;
    usefulPercentage: number;
    notUsefulPercentage: number;
  }
  ```
  For each week in `stats().weeks`, for each project in that week's `projects` array, push one
  `FlatEntry` (`weekLabel` via `formatWeekLabel(week.weekStart)`, `projectName` from
  `project.projectName ?? `#${project.projectId}`` as a defensive fallback for a null name). No
  aggregation and no per-project selection/lookup happens here — whatever the API returned (all
  registered projects, or just the one matching `project_id` when a single project was chosen
  server-side) is shown broken out, one group of bars per slot.
  `formatWeekLabel` is a small local function using `new Date(weekStart).toLocaleDateString(undefined, { day: '2-digit', month: '2-digit' })` (date-only ISO strings parse as UTC per spec, so no
  timezone-shift bug — confirmed this is the only date-formatting precedent gap in the codebase;
  `DatePipe` isn't usable here since the chart needs plain string arrays, not template bindings).
- `chartLabels = computed(() => this.flatEntries().map(e => [e.weekLabel, e.projectName]))` — the
  nested `[week, project]` pairs consumed by the chart (§6) so every group of bars is labeled with
  its project directly on the axis.
- `totalCounts()`, `usefulCounts()`, `notUsefulCounts()`, `usefulPercentages()`,
  `notUsefulPercentages()`: one `computed()` each, mapping `flatEntries()` to the relevant field.
- Template binds all of these into `<app-feedback-trend-chart [labels]="chartLabels()" ...>`
  (§6), plus the project `Combobox`, two `<input type="date">` fields for start/end
  (each with `[appEscClearable]`, matching every other text/date field in this app), and the
  refresh button. Show a simple loading indicator matching `code-search-page.html`'s
  button-label-toggle pattern (`{{ isLoading() ? 'Loading...' : 'Refresh' }}`, `[disabled]="isLoading()"`)
  — no dedicated spinner component exists in this app, don't introduce one.
- Empty state: if `flatEntries()` is empty (e.g. a narrow date range with no weeks, or zero
  registered projects — shouldn't normally happen given the API always returns overlapping weeks
  with every registered project, but is possible for a brand-new instance with no projects), show a
  plain "No data for this range" message instead of an empty chart.

## 9. Routing and navigation

- `src/app/app.routes.ts`: add, before the `'**'` wildcard:
  ```ts
  {
    path: 'reports',
    loadComponent: () => import('./features/reports/feedback-stats-page').then((m) => m.FeedbackStatsPage),
  },
  ```
- `src/app/app.html`: add a `Reports` link inside the existing nav `<div class="flex items-center gap-4">` block (same classes as the `Projects`/`Settings` links, placed after `Settings`), `routerLink="/reports"`.

## 10. Validation / error handling

- **Date range**: `fetchStats()` checks `startDate > endDate` (only when both are set — an ISO
  `YYYY-MM-DD` string comparison is sufficient, no `Date` parsing needed) before building the
  request, and short-circuits with `this.toast.error('Start date must be on or before End date.')`
  via the injected `ToastService` (`private readonly toast = inject(ToastService);`, same pattern as
  `settings-page.ts`'s URL validation) instead of calling the API with a range it would reject
  anyway. The Refresh button is **not** preemptively disabled for this — validation runs at
  click-time, matching `SettingsPage.save()`'s convention (always-enabled button, toast on invalid
  input), not a reactively-computed disabled state.
  **Rule**: this and any future validation message in this app names fields by their visible UI
  label ("Start date", "End date"), never the wire/JSON field name (`start_date`, `end_date`) the
  request body or DTO uses — the user reads the form by its labels.
- `project_id` mismatch (404) and any other error responses fall through to
  `error-toast.interceptor.ts`, same as every other service in this app — no bespoke handling.

## 11. Testing

- `trend.spec.ts`: `computeLinearTrend([])` → `[]`; single value → flat line at that value; a known
  linear sequence (e.g. `[1, 2, 3, 4]`) → trend equal to the input (already perfectly linear);
  a noisy series → assert slope direction (increasing/decreasing) rather than exact floating-point
  values.
- `feedback-stats.service.spec.ts`: follow `code-queries.service.spec.ts`'s `HttpTestingController`
  pattern — assert the request URL/params for (a) no query args (no params sent), (b) all three
  params set, (c) `project_id` omitted when the query's `projectId` is `undefined`; assert
  snake_case DTO → camelCase model mapping including `weeks: null`/`projects: null` → `[]`.
- `feedback-trend-chart.spec.ts`: `vi.mock('chart.js', ...)` (and the datalabels plugin import) so
  the spec asserts the component constructs `new Chart(canvas, config)` with the expected dataset
  shapes/labels/formatters, without needing real `<canvas>` 2D context support in jsdom (jsdom does
  not implement `CanvasRenderingContext2D`, and this repo has no canvas-mock devDependency — mocking
  the `Chart` class itself avoids introducing one). Destroy-on-destroy is asserted by checking the
  mocked instance's `destroy()` was called. Also cover: passing nested `[week, project]` pairs as
  `labels` passes them through to `config.data.labels` unchanged (there are still exactly 3 bar
  datasets + 1 line dataset regardless of how many slots are in the arrays);
  `config.options.plugins.weekBands.ranges` matches the week grouping for a given `labels` input.
  Since `weekBandsPlugin`'s actual canvas drawing can't be exercised without a real
  `CanvasRenderingContext2D` (unavailable in jsdom, same constraint as the rest of this file),
  `computeWeekBandRanges` is tested directly and separately (its own `describe` block, no
  `TestBed`/mocking needed — it's a pure function): empty input → `[]`; consecutive same-week slots
  merge into one range; plain string labels (no project dimension) each become their own
  single-slot range; the same week label reappearing non-consecutively starts a new range rather
  than merging with the earlier one.
- `feedback-stats-page.spec.ts`: follow `settings-page.spec.ts`'s hand-rolled-mock pattern —
  `{ provide: FeedbackStatsService, useValue: { getStats: vi.fn(() => of(mockStats)) } }` and
  `{ provide: ProjectsService, useValue: { list: vi.fn(() => of(mockProjects)) } }`. Cover: initial
  load fetches with defaults; a week with multiple projects flattens into one chart entry per
  project, each labeled with that project's name (assert `totalCounts()`/etc. arrays and the
  project names extracted from `chartLabels()`'s `[week, project]` pairs); multiple weeks each keep
  their own projects broken out separately (not merged across weeks); selecting a specific project
  and refreshing narrows to just the data the (mocked) service returns for that `project_id`;
  refresh button re-fetches with the currently-selected project/dates; loading-flag toggles around
  the request (mirroring `code-search-page.spec.ts`'s use of a controllable `Subject` to assert the
  button label mid-flight). Also cover (mock `ToastService` the same way `settings-page.spec.ts`
  does: `{ success: vi.fn(), error: vi.fn() }`): clicking Refresh with `startDate > endDate` calls
  `toast.error('Start date must be on or before End date.')` and does **not** call
  `feedbackStatsService.getStats` (assert the message contains neither `start_date` nor `end_date`);
  correcting the range and refreshing again calls `getStats` normally with no toast. Also cover the
  default date pre-fill deterministically via `vi.useFakeTimers()` + `vi.setSystemTime(fixedDate)`
  (restored with `vi.useRealTimers()` in a `finally`, so an assertion failure can't leak fake timers
  into later tests): both date `<input>`s show the expected `YYYY-MM-DD` values (today and 28 days
  earlier, computed the same local-date way the component does, not hardcoded literals — avoids
  timezone-dependent flakiness across CI runners), and the initial `getStats` call carries those same
  dates as `T00:00:00Z`/`T23:59:59Z`.

## 12. Out of scope

- No changes to `POST .../code-queries/feedback` (feedback submission) — that's already covered by
  the existing MCP tool (`submit_code_query_feedback`) and isn't part of this UI.
- No persistence of the selected project/date range across page reloads (consistent with how
  `code-search`'s filters/question are not persisted either — session-only state).
- No CSV/image export of the chart.
- No changes to `SPEC.md` (Portuguese product spec) as part of this — same rationale as the
  code-query-filters spec's out-of-scope note: a follow-up once the feature is built and reviewed.
