import { describe, expect, it } from "vitest";
import { buildChartData } from "./buildChartData";
import type { Candle } from "./marketApi";

const candles: Candle[] = [
  {
    time: "2026-11-18",
    open: 100,
    high: 105,
    low: 98,
    close: 102,
    volume: 1000,
  },
  {
    time: "2026-11-19",
    open: 102,
    high: 108,
    low: 101,
    close: 106,
    volume: 1200,
  },
];

describe("buildChartData", () => {
  it("une por fecha aunque los puntos estén desordenados", () => {
    const result = buildChartData(candles, [
      { time: "2026-11-19", value: 80 },
      { time: "2026-11-18", value: 20 },
    ]);

    expect(result).toEqual([
      { ...candles[0], indicatorValue: 20 },
      { ...candles[1], indicatorValue: 80 },
    ]);
  });

  it("conserva cero y usa null cuando falta una fecha", () => {
    const result = buildChartData(candles, [
      { time: "2026-11-18", value: 0 },
    ]);

    expect(result.map((point) => point.indicatorValue))
      .toEqual([0, null]);
  });

  it("conserva los valores null del indicador", () => {
    const result = buildChartData(candles, [
      { time: "2026-11-18", value: null },
      { time: "2026-11-19", value: 50 },
    ]);

    expect(result.map((point) => point.indicatorValue))
      .toEqual([null, 50]);
  });

  it("no modifica las velas originales", () => {
    const original = structuredClone(candles);

    const result = buildChartData(candles, []);

    expect(candles).toEqual(original);
    expect(result).not.toBe(candles);
    expect(result[0]).not.toBe(candles[0]);
  });

  it("devuelve un array vacío cuando no hay velas", () => {
    expect(buildChartData([], [])).toEqual([]);
  });
});