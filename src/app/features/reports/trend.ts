/**
 * Least-squares linear regression over `values`, indexed 0..n-1 on the x-axis.
 * Used to draw a trend line following the useful-feedback volume across weeks.
 */
export function computeLinearTrend(values: number[]): number[] {
  const n = values.length;
  if (n === 0) {
    return [];
  }

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
