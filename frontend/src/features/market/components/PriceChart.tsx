import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Candle } from "../marketApi";

type PriceChartProps = {
  data: (Candle & { indicatorValue: number | null })[];
  overlayName: string | null;
};

export function PriceChart({
  data,
  overlayName,
}: PriceChartProps) {
  return (
    <section aria-label="Gráfico de precios de cierre">
      <h2>Precio de cierre</h2>

      <div style={{ width: "100%", minWidth: 0, height: 300 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            syncId="market"
            syncMethod="value"
            margin={{ top: 10, right: 25, bottom: 10, left: 10 }}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="time" />
            <YAxis
              domain={["dataMin - 5", "dataMax + 5"]}
              width={75}
              tickFormatter={(value: number) => value.toFixed(2)}
            />
            <Tooltip />

            <Line
              type="linear"
              dataKey="close"
              name="Precio de cierre"
              stroke="#38bdf8"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />

            {overlayName !== null && (
              <Line
                type="linear"
                dataKey="indicatorValue"
                name={overlayName}
                stroke="#f97316"
                strokeWidth={2}
                dot={false}
                connectNulls={false}
                isAnimationActive={false}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}