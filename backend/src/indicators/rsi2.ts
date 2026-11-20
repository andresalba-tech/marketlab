import type {
  IndicatorDefinition,
  IndicatorPoint,
} from "../types/indicator.js";

const PERIOD = 2;

const indicator: IndicatorDefinition = {
  description: "RSI de 2 períodos con suavizado de Wilder.",

  supportedIntervals: ["1m", "5m", "15m", "30m", "1h", "1d"],

  calculate({ candles }) {
    const points: IndicatorPoint[] = [];

    let averageGain = 0;
    let averageLoss = 0;

    for (const [index, candle] of candles.entries()) {
      const previousCandle = candles[index - 1];

      if (previousCandle === undefined) {
        points.push({
          time: candle.time,
          value: null,
        });
        continue;
      }

      const change = candle.close - previousCandle.close;
      const gain = Math.max(change, 0);
      const loss = Math.max(-change, 0);

      if (index <= PERIOD) {
        averageGain += gain / PERIOD;
        averageLoss += loss / PERIOD;
      } else {
        averageGain =
          (averageGain * (PERIOD - 1) + gain) / PERIOD;

        averageLoss =
          (averageLoss * (PERIOD - 1) + loss) / PERIOD;
      }

      if (index < PERIOD) {
        points.push({
          time: candle.time,
          value: null,
        });
        continue;
      }

      let value: number;

      if (averageGain === 0 && averageLoss === 0) {
        value = 50;
      } else if (averageLoss === 0) {
        value = 100;
      } else if (averageGain === 0) {
        value = 0;
      } else {
        const relativeStrength = averageGain / averageLoss;
        value = 100 - 100 / (1 + relativeStrength);
      }

      points.push({
        time: candle.time,
        value,
      });
    }

    return {
      display: 
        {
          placement: "panel",
          domain: [0, 100],
        },
      series: [
        {
          name: "RSI 2",
          points,
        },
      ],
    };
  },
};

export default indicator;