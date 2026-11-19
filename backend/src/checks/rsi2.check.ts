import assert from "node:assert/strict";
import indicator from "../indicators/rsi2.js";
import type { Candle } from "../types/indicator.js";

function calculateValues(closes: number[]) {
  const candles: Candle[] = closes.map((close, index) => ({
    time: `2026-01-${String(index + 5).padStart(2, "0")}`,
    open: close,
    high: close,
    low: close,
    close,
    volume: 1000,
  }));

  const result = indicator.calculate({ candles, interval: "1d" });
  const series = result.series[0];

  assert.ok(series, "Debe existir una serie");
  assert.equal(result.display.placement, "panel");
  assert.equal(series.points.length, closes.length);

  return series.points.map((point) => point.value);
}

// Casos sin suficientes cierres.
assert.deepEqual(calculateValues([]), []);
assert.deepEqual(calculateValues([100]), [null]);
assert.deepEqual(calculateValues([100, 102]), [null, null]);

// Solo subidas.
assert.deepEqual(
  calculateValues([100, 102, 104, 106]),
  [null, null, 100, 100],
);

// Solo bajadas.
assert.deepEqual(
  calculateValues([106, 104, 102, 100]),
  [null, null, 0, 0],
);

// Sin cambios: nuestra convención es RSI = 50.
assert.deepEqual(
  calculateValues([100, 100, 100, 100]),
  [null, null, 50, 50],
);

// Subidas y bajadas: comprueba el suavizado de Wilder.
const mixed = calculateValues([100, 102, 101, 103]);
const expected = [null, null, 66.6666666667, 85.7142857143];

for (const [index, expectedValue] of expected.entries()) {
  const actualValue = mixed[index];

  if (expectedValue === null) {
    assert.equal(actualValue, null);
  } else {
    assert.ok(typeof actualValue === "number");
    assert.ok(
      Math.abs(actualValue - expectedValue) < 1e-8,
      `Resultado incorrecto en la posición ${index}: ${actualValue}`,
    );
  }
}

console.log("RSI 2: todas las comprobaciones pasaron.");