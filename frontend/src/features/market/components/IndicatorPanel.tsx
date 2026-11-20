import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type IndicatorPanelProps = {
  data: {
    time: string;
    indicatorValue: number | null;
  }[];
  name: string;
  domain: [number, number] | undefined;
};

export function IndicatorPanel({
  data,
  name,
  domain,
}: IndicatorPanelProps) {
  return (
    <section aria-label={`Gráfico de ${name}`}>
      <h2>{name}</h2>

      <div style={{ width: "100%", minWidth: 0, height: 220 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            syncId="market"
            syncMethod="value"
            margin={{ top: 10, right: 25, bottom: 10, left: 10 }}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="time" minTickGap={40} />
            <YAxis
              width={75}
              domain={domain ?? ["auto", "auto"]}
              tickFormatter={(value: number) => value.toFixed(2)}
            />
            <Tooltip />

            <Line
              type="linear"
              dataKey="indicatorValue"
              name={name}
              stroke="#a78bfa"
              strokeWidth={2}
              dot={false}
              connectNulls={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}