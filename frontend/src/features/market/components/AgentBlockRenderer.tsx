import type { AgentBlock } from "../chatTypes";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { sanitizeSvg } from "../sanitizeSvg";
import { SafeMarkdown } from "./SafeMarkdown";

export function AgentBlockRenderer({ block }: { block: AgentBlock }) {
  switch (block.type) {
    case "markdown":
      return <SafeMarkdown text={block.text} />;

    case "error":
      return <p role="alert">{block.message}</p>;

    case "table":
      return (
        <div style={{ overflowX: "auto" }}>
          <table>
            <caption>{block.title}</caption>

            <thead>
              <tr>
                {block.columns.map((column, index) => (
                  <th key={index} scope="col">
                    {column}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {block.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, columnIndex) => (
                    <td key={columnIndex}>
                      {cell === null ? "—" : String(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );

    case "file":
      if (
        !/^\/api\/reports\/[a-zA-Z0-9_-]+\/download$/.test(
          block.downloadUrl,
        )
      ) {
        return <p role="alert">Enlace de descarga inválido.</p>;
      }

      return (
        <p>
          <a href={block.downloadUrl} download={block.filename}>
            Descargar {block.filename}
          </a>
        </p>
      );

      case "chart": {
        // Unimos las series por fecha para dibujarlas en el mismo gráfico.
        const rowsByTime = new Map<
            string,
            { time: string; [key: string]: string | number | null }
        >();

        block.series.forEach((series, seriesIndex) => {
            for (const point of series.points) {
            let row = rowsByTime.get(point.time);

            if (!row) {
                row = { time: point.time };
                rowsByTime.set(point.time, row);
            }

            row[`series${seriesIndex}`] = point.value;
            }
        });

        const chartData = [...rowsByTime.values()].sort(
            (first, second) => first.time.localeCompare(second.time),
        );

        const colors = ["#38bdf8", "#f97316", "#a78bfa"];

        return (
            <section aria-label={block.title}>
            <h4>{block.title}</h4>

            {chartData.length === 0 ? (
                <p>No hay datos para mostrar.</p>
            ) : (
                <div style={{ width: "100%", minWidth: 0, height: 300 }}>
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                    data={chartData}
                    margin={{ top: 10, right: 25, bottom: 10, left: 10 }}
                    >
                    <CartesianGrid strokeDasharray="3 3" />

                    <XAxis dataKey="time" minTickGap={40} />

                    <YAxis
                        width={90}
                        domain={["auto", "auto"]}
                        tickFormatter={(value: number) =>
                        value.toLocaleString("es-CO", {
                            maximumFractionDigits: 2,
                        })
                        }
                    />

                    <Tooltip />
                    <Legend />

                    {block.series.map((series, index) => (
                        <Line
                        key={`${block.id}-series-${index}`}
                        type="linear"
                        dataKey={`series${index}`}
                        name={series.name}
                        stroke={colors[index % colors.length] ?? "#38bdf8"}
                        strokeWidth={2}
                        dot={false}
                        connectNulls={false}
                        isAnimationActive={false}
                        />
                    ))}
                    </LineChart>
                </ResponsiveContainer>
                </div>
            )}
            </section>
        );
    }

    case "svg": {
        const cleanSvg = sanitizeSvg(block.content);

        if (!cleanSvg.trim()) {
            return <p role="alert">El gráfico SVG no es válido.</p>;
        }

        const imageUrl =
            `data:image/svg+xml;charset=utf-8,${encodeURIComponent(cleanSvg)}`;

        return (
            <figure style={{ margin: "16px 0" }}>
            <figcaption>{block.title}</figcaption>

            <img
                src={imageUrl}
                alt={block.title}
                style={{
                display: "block",
                width: "100%",
                maxWidth: 740,
                height: "auto",
                margin: "12px auto",
                }}
            />
            </figure>
        );
    }

    default:
      return <p role="alert">Formato de bloque no compatible.</p>;
  }
}