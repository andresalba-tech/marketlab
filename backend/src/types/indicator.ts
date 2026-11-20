export type Candle = {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  session?: string;
};

export type IndicatorPoint = {
  time: string;
  value: number | null;
};

export type IndicatorSeries = {
  name: string;
  points: IndicatorPoint[];
};

export type IndicatorInput = {
  candles: Candle[];
  interval: string;
};

export type IndicatorResult = {
  display: IndicatorDisplay;
  series: IndicatorSeries[];
};

export type IndicatorDefinition = {
  description: string;
  supportedIntervals: string[];
  calculate: (input: IndicatorInput) => IndicatorResult;
};

export type IndicatorDisplay = {
  placement: "overlay" | "panel";
  domain?: [number, number];
};