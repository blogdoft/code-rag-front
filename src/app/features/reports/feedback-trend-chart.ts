import { Component, DestroyRef, ElementRef, effect, inject, input, viewChild } from '@angular/core';
import {
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  type ChartConfiguration,
  type ChartType,
  Legend,
  LinearScale,
  LineController,
  LineElement,
  type Plugin,
  PointElement,
  Tooltip,
} from 'chart.js';
import ChartDataLabels, { type Context } from 'chartjs-plugin-datalabels';
import { computeLinearTrend } from './trend';

/** A contiguous run of x-axis slot indices (inclusive) belonging to the same week. */
export interface WeekBandRange {
  start: number;
  end: number;
}

interface WeekBandsOptions {
  ranges: WeekBandRange[];
  color: string;
}

declare module 'chart.js' {
  interface PluginOptionsByType<TType extends ChartType> {
    weekBands?: WeekBandsOptions;
  }
}

/**
 * Shades every other week's group of bars with a subtle background band, so the eye can tell at a
 * glance where one week's slots end and the next week's begin — this matters once each week spans
 * multiple (one per project) x-axis slots instead of a single tick.
 */
const weekBandsPlugin: Plugin<'bar'> = {
  id: 'weekBands',
  beforeDatasetsDraw(chart, _args, options) {
    const { ranges, color } = options as WeekBandsOptions;
    if (!ranges || ranges.length === 0) {
      return;
    }
    const xScale = chart.scales['x'];
    const { ctx, chartArea } = chart;
    if (!xScale || !chartArea) {
      return;
    }

    const tickGap =
      ranges.length > 0 || xScale.ticks.length > 1
        ? Math.abs(xScale.getPixelForTick(1) - xScale.getPixelForTick(0)) / 2
        : 0;

    ctx.save();
    ctx.fillStyle = color;
    ranges.forEach((range, index) => {
      if (index % 2 !== 0) {
        return;
      }
      const left = Math.max(xScale.getPixelForTick(range.start) - tickGap, chartArea.left);
      const right = Math.min(xScale.getPixelForTick(range.end) + tickGap, chartArea.right);
      ctx.fillRect(left, chartArea.top, right - left, chartArea.bottom - chartArea.top);
    });
    ctx.restore();
  },
};

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
  weekBandsPlugin,
);

/** A category-axis tick: a plain week label, or a `[week, project]` pair for nested/grouped ticks. */
export type ChartCategoryLabel = string | string[];

/** Groups consecutive x-axis slots that share the same week (the label's first element, if nested). */
export function computeWeekBandRanges(labels: ChartCategoryLabel[]): WeekBandRange[] {
  const ranges: WeekBandRange[] = [];
  let currentWeek: string | null = null;

  labels.forEach((label, index) => {
    const week = Array.isArray(label) ? label[0] : label;
    if (week === currentWeek && ranges.length > 0) {
      ranges[ranges.length - 1].end = index;
    } else {
      ranges.push({ start: index, end: index });
      currentWeek = week;
    }
  });

  return ranges;
}

/**
 * The trend line should follow each week's *total* useful count across all projects, not the
 * per-(week, project) slot values it's plotted against - otherwise the regression is skewed by
 * how many projects happen to have data in a given week rather than the week-over-week volume.
 * Sums `usefulCounts` within each week's range, fits the line through those weekly totals, then
 * broadcasts each week's fitted value back out to every slot in that week so the line still has
 * one point per x-axis slot (flat across a week's slots, sloping week to week).
 */
function computeWeeklyUsefulTrend(usefulCounts: number[], ranges: WeekBandRange[]): number[] {
  const weeklyTotals = ranges.map((range) => {
    let sum = 0;
    for (let i = range.start; i <= range.end; i++) {
      sum += usefulCounts[i] ?? 0;
    }
    return sum;
  });
  const weeklyTrend = computeLinearTrend(weeklyTotals);

  const result = new Array<number>(usefulCounts.length);
  ranges.forEach((range, index) => {
    for (let i = range.start; i <= range.end; i++) {
      result[i] = weeklyTrend[index];
    }
  });
  return result;
}

@Component({
  selector: 'app-feedback-trend-chart',
  templateUrl: './feedback-trend-chart.html',
})
export class FeedbackTrendChart {
  readonly labels = input<ChartCategoryLabel[]>([]);
  readonly totalCounts = input<number[]>([]);
  readonly usefulCounts = input<number[]>([]);
  readonly notUsefulCounts = input<number[]>([]);
  readonly usefulPercentages = input<number[]>([]);
  readonly notUsefulPercentages = input<number[]>([]);

  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private chart: Chart | null = null;

  constructor() {
    effect(() => {
      const config = buildConfig(
        this.labels(),
        this.totalCounts(),
        this.usefulCounts(),
        this.notUsefulCounts(),
        this.usefulPercentages(),
        this.notUsefulPercentages(),
      );
      this.chart?.destroy();
      this.chart = new Chart(this.canvas().nativeElement, config);
    });

    inject(DestroyRef).onDestroy(() => this.chart?.destroy());
  }
}

function buildConfig(
  labels: ChartCategoryLabel[],
  totalCounts: number[],
  usefulCounts: number[],
  notUsefulCounts: number[],
  usefulPercentages: number[],
  notUsefulPercentages: number[],
): ChartConfiguration {
  const isDark = document.documentElement.classList.contains('dark');
  const textColor = isDark ? '#e2e8f0' : '#334155';
  const gridColor = isDark ? 'rgba(226, 232, 240, 0.1)' : 'rgba(51, 65, 85, 0.1)';
  const weekBandColor = isDark ? 'rgba(148, 163, 184, 0.12)' : 'rgba(100, 116, 139, 0.08)';
  const weekRanges = computeWeekBandRanges(labels);

  return {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          type: 'bar',
          label: 'Total',
          data: totalCounts,
          backgroundColor: '#94a3b8',
          datalabels: { display: false },
        },
        {
          type: 'bar',
          label: 'Useful',
          data: usefulCounts,
          backgroundColor: '#22c55e',
          datalabels: {
            anchor: 'end',
            align: 'end',
            color: textColor,
            font: { size: 10 },
            formatter: (value: number, ctx: Context) => `${value} (${usefulPercentages[ctx.dataIndex]}%)`,
          },
        },
        {
          type: 'bar',
          label: 'Not useful',
          data: notUsefulCounts,
          backgroundColor: '#ef4444',
          datalabels: {
            anchor: 'end',
            align: 'end',
            color: textColor,
            font: { size: 10 },
            formatter: (value: number, ctx: Context) => `${value} (${notUsefulPercentages[ctx.dataIndex]}%)`,
          },
        },
        {
          type: 'line',
          label: 'Useful trend',
          data: computeWeeklyUsefulTrend(usefulCounts, weekRanges),
          borderColor: '#0ea5e9',
          borderDash: [6, 4],
          pointRadius: 0,
          tension: 0,
          datalabels: { display: false },
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          ticks: { color: textColor },
          grid: { color: gridColor },
        },
        y: {
          beginAtZero: true,
          ticks: { color: textColor },
          grid: { color: gridColor },
        },
      },
      plugins: {
        legend: { labels: { color: textColor } },
        weekBands: {
          ranges: weekRanges,
          color: weekBandColor,
        },
      },
    },
  };
}
