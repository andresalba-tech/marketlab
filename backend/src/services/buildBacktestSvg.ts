import type { BacktestResult } from "../types/backtest.js";

export function buildBacktestSvg(result: BacktestResult): string {
  const rows = [
    {
      label: "Retorno RSI 2",
      value: result.metrics.totalReturnPct,
      color: "#0284c7",
    },
    {
      label: "Retorno benchmark",
      value: result.benchmark.totalReturnPct,
      color: "#ea580c",
    },
    {
      label: "Drawdown RSI 2",
      value: result.metrics.maxDrawdownPct,
      color: "#0284c7",
    },
    {
      label: "Drawdown benchmark",
      value: result.benchmark.maxDrawdownPct,
      color: "#ea580c",
    },
  ];

  if (rows.some((row) => !Number.isFinite(row.value))) {
    throw new Error("No se puede generar un SVG con métricas no finitas.");
  }

  const maximum = Math.max(
    1,
    ...rows.map((row) => Math.abs(row.value)),
  );

  const zeroX = 420;
  const halfWidth = 170;

  const bars = rows.map((row, index) => {
    const y = 85 + index * 55;
    const width = (Math.abs(row.value) / maximum) * halfWidth;
    const x = row.value < 0 ? zeroX - width : zeroX;

    return `
      <text x="20" y="${y + 17}" fill="#0f172a">
        ${row.label}
      </text>
      <rect
        x="${x}"
        y="${y}"
        width="${width}"
        height="24"
        fill="${row.color}"
      />
      <text x="610" y="${y + 17}" fill="#0f172a">
        ${row.value.toFixed(2)} %
      </text>
    `;
  }).join("");

  return `
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 740 340"
      width="740"
      height="340"
      role="img"
    >
      <title>Retorno y drawdown: RSI 2 frente a benchmark</title>
      <desc>
        Datos simulados. Retornos negativos a la izquierda de cero.
        El drawdown se expresa como magnitud positiva.
      </desc>
      <rect x="0" y="0" width="740" height="340" fill="#ffffff" />
      <g font-family="sans-serif" font-size="14">
        <text x="20" y="32" font-size="20" fill="#0f172a">
          RSI 2 frente a comprar y mantener
        </text>
        <text x="20" y="55" fill="#475569">
          Datos simulados · Valores en porcentaje
        </text>
        <line
          x1="${zeroX}"
          y1="75"
          x2="${zeroX}"
          y2="290"
          stroke="#64748b"
        />
        <text x="${zeroX - 4}" y="310" fill="#475569">0</text>
        ${bars}
      </g>
    </svg>
  `.trim();
}