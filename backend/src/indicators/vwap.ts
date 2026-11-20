import type {
  IndicatorDefinition,
  IndicatorPoint,
} from "../types/indicator.js";

const indicator: IndicatorDefinition = {
  description:
    "VWAP por sesión, aproximado con precio típico y volumen de velas intradía.",

  supportedIntervals: ["1m", "5m", "15m", "30m", "1h"],

  calculate({ candles, interval }) {
    const supportedIntervals = ["1m", "5m", "15m", "30m", "1h"];

    if (!supportedIntervals.includes(interval)) {
      throw new Error("VWAP requiere un intervalo intradía compatible.");
    }

    const points: IndicatorPoint[] = [];

    let currentSession: string | undefined;
    let cumulativePriceVolume = 0;
    let cumulativeVolume = 0;

    for (const candle of candles) {
      if (!candle.session?.trim()) {
        throw new Error("Cada vela de VWAP debe indicar su sesión.");
      }

      if (!Number.isFinite(candle.volume) || candle.volume < 0) {
        throw new Error("El volumen debe ser finito y no negativo.");
      }

      if (
        !Number.isFinite(candle.high) ||
        !Number.isFinite(candle.low) ||
        !Number.isFinite(candle.close)
      ) {
        throw new Error("Los precios de VWAP deben ser finitos.");
      }

      if (candle.session !== currentSession) {
        currentSession = candle.session;
        cumulativePriceVolume = 0;
        cumulativeVolume = 0;
      }

      const typicalPrice =
        (candle.high + candle.low + candle.close) / 3;

      cumulativePriceVolume += typicalPrice * candle.volume;
      cumulativeVolume += candle.volume;

      points.push({
        time: candle.time,
        value:
          cumulativeVolume === 0
            ? null
            : cumulativePriceVolume / cumulativeVolume,
      });
    }

    return {
      display: {
        placement: "overlay",
      },
      series: [
        {
          name: "VWAP por sesión",
          points,
        },
      ],
    };
  },
};

export default indicator;