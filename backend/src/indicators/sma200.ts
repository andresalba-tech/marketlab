import type {
  IndicatorDefinition,
  IndicatorPoint,
} from "../types/indicator.js";

const PERIOD = 200;

const indicator: IndicatorDefinition = {
  description: "Media móvil simple de los últimos 200 cierres diarios.",

  calculate({ candles }) {
    const points: IndicatorPoint[] = [];
    let sum = 0;

    for (const [index, candle] of candles.entries()) {
      sum += candle.close;

      if (index >= PERIOD) {
        const outgoingCandle = candles[index - PERIOD];

        if (outgoingCandle === undefined) {
          throw new Error("Falta una vela necesaria para calcular la SMA.");
        }

        sum -= outgoingCandle.close;
      }

      points.push({
        time: candle.time,
        value: index >= PERIOD - 1 ? sum / PERIOD : null,
      });
    }

    return {
      series: [
        {
          name: "SMA 200",
          points,
        },
      ],
    };
  },
};

export default indicator;