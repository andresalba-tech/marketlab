import assert from "node:assert/strict";
import indicator from "../indicators/sma200.js";
import type { Candle } from "../types/indicator.js";

// Datos sintéticos: 201 sesiones con cierres de 1 a 201.
const candles: Candle[] = [];
const date = new Date("2025-01-06T00:00:00Z");

while (candles.length < 201) {
  const day = date.getUTCDay();

  // Omitimos fines de semana, sin modelar festivos bursátiles.
  if (day !== 0 && day !== 6) {
    const close = candles.length + 1;

    candles.push({
      time: date.toISOString().slice(0, 10),
      open: close,
      high: close,
      low: close,
      close,
      volume: 1000,
    });
  }

  date.setUTCDate(date.getUTCDate() + 1);
}

const result = indicator.calculate({ candles });
const series = result.series[0];

assert.ok(series, "Debe existir una serie de resultados");
assert.equal(series.points.length, 201);

// No hay suficientes datos durante las primeras 199 sesiones.
assert.ok(
  series.points.slice(0, 199).every((point) => point.value === null),
);

// Promedio de los cierres del 1 al 200.
assert.equal(series.points[199]?.value, 100.5);

// La ventana avanza: sale el 1 y entra el 201.
assert.equal(series.points[200]?.value, 101.5);

// Sin velas, la serie debe estar vacía.
const emptyResult = indicator.calculate({ candles: [] });
assert.deepEqual(emptyResult.series[0]?.points, []);

console.log("SMA 200: todas las comprobaciones pasaron.");