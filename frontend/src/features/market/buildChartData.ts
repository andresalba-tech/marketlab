import type { Candle } from "./marketApi";

type IndicatorPoint = {
  time: string;
  value: number | null;
};

export type MarketChartPoint = Candle & {
  indicatorValue: number | null;
};

export function buildChartData(
  candles: Candle[],
  points: IndicatorPoint[],
): MarketChartPoint[] {
  const valuesByDate = new Map(
    points.map((point) => [point.time, point.value]),
  );

  return candles.map((candle) => ({
    ...candle,
    indicatorValue: valuesByDate.get(candle.time) ?? null,
  }));
}