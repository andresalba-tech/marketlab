import type {
  IndicatorDefinition,
  IndicatorPoint,
} from "../types/indicator.js";

const LOOKBACK = 252;
const SKIP_RECENT = 21;

const indicator: IndicatorDefinition = {
  description:
    "Momentum 12-1: aproximación de 252 y 21 sesiones, expresada en porcentaje.",

  calculate({ candles, interval }) {
    if (interval !== "1d") {
        throw new Error("Momentum 12-1 requiere velas diarias: intervalo 1d.");
    }
    const points: IndicatorPoint[] = candles.map((candle, index) => {
      if (index < LOOKBACK) {
        return {
          time: candle.time,
          value: null,
        };
      }

      const pastCandle = candles[index - LOOKBACK];
      const recentCandle = candles[index - SKIP_RECENT];

      if (pastCandle === undefined || recentCandle === undefined) {
        throw new Error("Faltan velas necesarias para calcular Momentum.");
      }

      if (pastCandle.close <= 0) {
        throw new Error("El cierre base debe ser mayor que cero.");
      }

      const value =
        (recentCandle.close / pastCandle.close - 1) * 100;

      return {
        time: candle.time,
        value,
      };
    });

    return {
      display: {
        placement: "panel",
      },
      series: [
        {
          name: "Momentum 12-1 (%)",
          points,
        },
      ],
    };
  },
};

export default indicator;