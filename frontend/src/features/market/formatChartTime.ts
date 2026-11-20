export function formatChartTime(time: string): string {
  // Vela diaria: "2026-11-18" → "18/11"
  if (time.length === 10) {
    return `${time.slice(8, 10)}/${time.slice(5, 7)}`;
  }

  // Vela intradía: mostramos fecha y hora en UTC.
  const date = new Date(time);

  if (Number.isNaN(date.getTime())) {
    return time;
  }

  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");

  return `${day}/${month} ${hours}:${minutes}`;
}