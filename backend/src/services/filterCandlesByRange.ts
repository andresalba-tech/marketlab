import type { Candle } from "../types/indicator.js";

function parseDate(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("Las fechas deben tener el formato YYYY-MM-DD.");
  }

  const timestamp = Date.parse(`${value}T00:00:00.000Z`);

  if (
    !Number.isFinite(timestamp) ||
    new Date(timestamp).toISOString().slice(0, 10) !== value
  ) {
    throw new Error(`Fecha inválida: ${value}`);
  }

  return timestamp;
}

export function filterCandlesByRange(
  candles: readonly Candle[],
  from?: string,
  to?: string,
): Candle[] {
  const start = from === undefined ? undefined : parseDate(from);
  const end = to === undefined ? undefined : parseDate(to);

  if (start !== undefined && end !== undefined && start > end) {
    throw new Error("from no puede ser posterior a to.");
  }

  const endExclusive =
    end === undefined ? undefined : end + 24 * 60 * 60 * 1000;

  return candles.filter((candle) => {
    const time = Date.parse(candle.time);

    return (
      (start === undefined || time >= start) &&
      (endExclusive === undefined || time < endExclusive)
    );
  });
}