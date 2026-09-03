import { computeLinearTrend } from './trend';

describe('computeLinearTrend', () => {
  it('returns an empty array for no values', () => {
    expect(computeLinearTrend([])).toEqual([]);
  });

  it('returns a flat line at the single value for one data point', () => {
    expect(computeLinearTrend([42])).toEqual([42]);
  });

  it('returns the input unchanged for an already-linear sequence', () => {
    expect(computeLinearTrend([1, 2, 3, 4])).toEqual([1, 2, 3, 4]);
  });

  it('returns a flat line at the mean for a constant sequence', () => {
    expect(computeLinearTrend([5, 5, 5])).toEqual([5, 5, 5]);
  });

  it('fits an increasing trend through noisy increasing data', () => {
    const trend = computeLinearTrend([1, 5, 2, 8, 6]);
    expect(trend[trend.length - 1]).toBeGreaterThan(trend[0]);
  });

  it('fits a decreasing trend through noisy decreasing data', () => {
    const trend = computeLinearTrend([9, 4, 7, 2, 1]);
    expect(trend[trend.length - 1]).toBeLessThan(trend[0]);
  });
});
