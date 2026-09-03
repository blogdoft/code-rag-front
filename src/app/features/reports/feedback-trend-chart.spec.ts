import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FeedbackTrendChart, computeWeekBandRanges } from './feedback-trend-chart';

const { chartConstructor, destroy } = vi.hoisted(() => {
  const destroy = vi.fn();
  const chartConstructor = vi.fn().mockImplementation(function (this: unknown) {
    return { destroy };
  });
  return { chartConstructor, destroy };
});

vi.mock('chart.js', () => ({
  Chart: Object.assign(chartConstructor, { register: vi.fn() }),
  BarController: {},
  BarElement: {},
  CategoryScale: {},
  Legend: {},
  LinearScale: {},
  LineController: {},
  LineElement: {},
  PointElement: {},
  Tooltip: {},
}));

vi.mock('chartjs-plugin-datalabels', () => ({ default: {} }));

describe('FeedbackTrendChart', () => {
  let fixture: ComponentFixture<FeedbackTrendChart>;

  beforeEach(() => {
    chartConstructor.mockClear();
    destroy.mockClear();
    TestBed.configureTestingModule({});
    fixture = TestBed.createComponent(FeedbackTrendChart);
  });

  it('constructs a Chart with a bar/useful/not-useful/trend dataset shape', () => {
    fixture.componentRef.setInput('labels', ['08/01', '08/08']);
    fixture.componentRef.setInput('totalCounts', [10, 20]);
    fixture.componentRef.setInput('usefulCounts', [6, 14]);
    fixture.componentRef.setInput('notUsefulCounts', [4, 6]);
    fixture.componentRef.setInput('usefulPercentages', [60, 70]);
    fixture.componentRef.setInput('notUsefulPercentages', [40, 30]);
    fixture.detectChanges();

    expect(chartConstructor).toHaveBeenCalledTimes(1);
    const [, config] = chartConstructor.mock.calls[0];
    expect(config.data.labels).toEqual(['08/01', '08/08']);

    const [total, useful, notUseful, trend] = config.data.datasets;
    expect(total).toMatchObject({ type: 'bar', label: 'Total', data: [10, 20] });
    expect(useful).toMatchObject({ type: 'bar', label: 'Useful', data: [6, 14] });
    expect(notUseful).toMatchObject({ type: 'bar', label: 'Not useful', data: [4, 6] });
    expect(trend).toMatchObject({ type: 'line', label: 'Useful trend' });
  });

  it('formats the useful bar label as "value (percentage%)"', () => {
    fixture.componentRef.setInput('labels', ['08/01']);
    fixture.componentRef.setInput('totalCounts', [10]);
    fixture.componentRef.setInput('usefulCounts', [6]);
    fixture.componentRef.setInput('notUsefulCounts', [4]);
    fixture.componentRef.setInput('usefulPercentages', [60]);
    fixture.componentRef.setInput('notUsefulPercentages', [40]);
    fixture.detectChanges();

    const [, config] = chartConstructor.mock.calls[0];
    const [, useful, notUseful] = config.data.datasets;
    expect(useful.datalabels.formatter(6, { dataIndex: 0 })).toBe('6 (60%)');
    expect(notUseful.datalabels.formatter(4, { dataIndex: 0 })).toBe('4 (40%)');
  });

  it('computes the trend line from useful counts', () => {
    fixture.componentRef.setInput('labels', ['a', 'b', 'c']);
    fixture.componentRef.setInput('usefulCounts', [1, 2, 3]);
    fixture.componentRef.setInput('totalCounts', [1, 2, 3]);
    fixture.componentRef.setInput('notUsefulCounts', [0, 0, 0]);
    fixture.componentRef.setInput('usefulPercentages', [100, 100, 100]);
    fixture.componentRef.setInput('notUsefulPercentages', [0, 0, 0]);
    fixture.detectChanges();

    const [, config] = chartConstructor.mock.calls[0];
    const [, , , trend] = config.data.datasets;
    expect(trend.data).toEqual([1, 2, 3]);
  });

  it('rebuilds the chart (destroying the previous instance) when inputs change', () => {
    fixture.componentRef.setInput('labels', ['a']);
    fixture.componentRef.setInput('usefulCounts', [1]);
    fixture.detectChanges();
    expect(chartConstructor).toHaveBeenCalledTimes(1);

    fixture.componentRef.setInput('labels', ['a', 'b']);
    fixture.componentRef.setInput('usefulCounts', [1, 2]);
    fixture.detectChanges();

    expect(destroy).toHaveBeenCalledTimes(1);
    expect(chartConstructor).toHaveBeenCalledTimes(2);
  });

  it('accepts nested [week, project] label pairs so the axis shows which project each group is', () => {
    fixture.componentRef.setInput('labels', [
      ['08/01', 'alpha'],
      ['08/01', 'beta'],
    ]);
    fixture.componentRef.setInput('totalCounts', [10, 5]);
    fixture.componentRef.setInput('usefulCounts', [6, 5]);
    fixture.componentRef.setInput('notUsefulCounts', [4, 0]);
    fixture.componentRef.setInput('usefulPercentages', [60, 100]);
    fixture.componentRef.setInput('notUsefulPercentages', [40, 0]);
    fixture.detectChanges();

    const [, config] = chartConstructor.mock.calls[0];
    expect(config.data.labels).toEqual([
      ['08/01', 'alpha'],
      ['08/01', 'beta'],
    ]);
  });

  it('destroys the chart when the component is destroyed', () => {
    fixture.detectChanges();
    fixture.destroy();

    expect(destroy).toHaveBeenCalled();
  });

  it('passes week-band ranges (grouped by the [week, project] pairs) to the chart config', () => {
    fixture.componentRef.setInput('labels', [
      ['08/01', 'alpha'],
      ['08/01', 'beta'],
      ['08/08', 'alpha'],
    ]);
    fixture.componentRef.setInput('totalCounts', [10, 5, 3]);
    fixture.componentRef.setInput('usefulCounts', [6, 5, 2]);
    fixture.componentRef.setInput('notUsefulCounts', [4, 0, 1]);
    fixture.componentRef.setInput('usefulPercentages', [60, 100, 67]);
    fixture.componentRef.setInput('notUsefulPercentages', [40, 0, 33]);
    fixture.detectChanges();

    const [, config] = chartConstructor.mock.calls[0];
    expect(config.options.plugins.weekBands.ranges).toEqual([
      { start: 0, end: 1 },
      { start: 2, end: 2 },
    ]);
  });
});

describe('computeWeekBandRanges', () => {
  it('returns an empty array for no labels', () => {
    expect(computeWeekBandRanges([])).toEqual([]);
  });

  it('groups consecutive slots sharing the same week into one range', () => {
    expect(
      computeWeekBandRanges([
        ['08/01', 'alpha'],
        ['08/01', 'beta'],
        ['08/01', 'gamma'],
        ['08/08', 'alpha'],
        ['08/08', 'beta'],
      ]),
    ).toEqual([
      { start: 0, end: 2 },
      { start: 3, end: 4 },
    ]);
  });

  it('treats plain string labels (no project dimension) as one-slot weeks each', () => {
    expect(computeWeekBandRanges(['08/01', '08/08', '08/15'])).toEqual([
      { start: 0, end: 0 },
      { start: 1, end: 1 },
      { start: 2, end: 2 },
    ]);
  });

  it('starts a new range when the same week label reappears non-consecutively', () => {
    expect(
      computeWeekBandRanges([
        ['08/01', 'alpha'],
        ['08/08', 'alpha'],
        ['08/01', 'beta'],
      ]),
    ).toEqual([
      { start: 0, end: 0 },
      { start: 1, end: 1 },
      { start: 2, end: 2 },
    ]);
  });
});
