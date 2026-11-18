import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useAppDispatch, useAppSelector } from "./app/hooks";
import { toggleTable } from "./features/market/marketUiSlice";
import {
  useGetMarketQuery,
  useGetIndicatorQuery,
} from "./features/market/marketApi";

export default function App() {
  const dispatch = useAppDispatch();
  const showTable = useAppSelector((state) => state.marketUi.showTable);

  const { data, isLoading, isFetching, isError, refetch } = useGetMarketQuery("MSFT");

  const {
    data: indicatorData,
    isFetching: isIndicatorFetching,
    isError: isIndicatorError,
    refetch: refetchIndicator,
  } = useGetIndicatorQuery({
    symbol: "MSFT",
    name: "sma200",
  });

  if (isLoading) {
    return <p>Cargando precios...</p>;
  }

  if (isError && !data) {
    return (
      <div role="alert">
        <p>No se pudieron cargar los datos.</p>
        <button type="button" onClick={() => refetch()}>
          Reintentar
        </button>
      </div>
    );
  }

  if (!data || data.candles.length === 0) {
    return <p>No hay precios disponibles.</p>;
  }

  const smaPoints = indicatorData?.series[0]?.points ?? [];

  const smaByDate = new Map(
    smaPoints.map((point) => [point.time, point.value]),
  );

  const chartData = data.candles.map((candle) => ({
    ...candle,
    sma200: smaByDate.get(candle.time) ?? null,
  }));
  
  return (
    <main>
      <h1>MarketLab — {data.symbol}</h1>
      <p>Intervalo: {data.interval} · Datos simulados</p>

    <button
      type="button"
      onClick={() => {
        refetch();
        refetchIndicator();
      }}
      disabled={isFetching || isIndicatorFetching}
    >
      {isFetching || isIndicatorFetching
        ? "Actualizando..."
        : "Actualizar precios e indicador"}
    </button>

    {isIndicatorError && (
      <p role="alert">
        No se pudo actualizar la SMA 200.
        {indicatorData
          ? " Se conserva el último resultado recibido."
          : " El indicador no está disponible."}
      </p>
    )}

      {isError && (
        <p role="alert">
          No se pudieron actualizar los precios. Se muestran los últimos
          datos recibidos.
        </p>
      )}

      <section aria-label="Gráfico de precios de cierre">
        <h2>Precio de cierre</h2>

        <div style={{ width: "100%", minWidth: 0, height: 300 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={chartData}
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
              <Line
                type="linear"
                dataKey="sma200"
                name="SMA 200"
                stroke="#f97316"
                strokeWidth={2}
                dot={false}
                connectNulls={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <button type="button" onClick={() => dispatch(toggleTable())}>
        {showTable ? "Ocultar tabla" : "Mostrar tabla"}
      </button>

      {showTable && (
        <table>
          <thead>
            <tr>
              <th scope="col">Fecha</th>
              <th scope="col">Apertura</th>
              <th scope="col">Máximo</th>
              <th scope="col">Mínimo</th>
              <th scope="col">Cierre</th>
              <th scope="col">Volumen</th>
            </tr>
          </thead>

          <tbody>
            {data.candles.map((candle) => (
              <tr key={candle.time}>
                <td>{candle.time}</td>
                <td>{candle.open}</td>
                <td>{candle.high}</td>
                <td>{candle.low}</td>
                <td>{candle.close}</td>
                <td>{candle.volume.toLocaleString("es-CO")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}