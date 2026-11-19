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
import {
  toggleTable,
  setSelectedIndicator,
  setSelectedInterval,
} from "./features/market/marketUiSlice";
import {
  useGetMarketQuery,
  useGetIndicatorQuery,
  useGetIndicatorsQuery,
} from "./features/market/marketApi";

export default function App() {
  const dispatch = useAppDispatch();

  const showTable = useAppSelector((state) => state.marketUi.showTable);
  const selectedIndicator = useAppSelector(
    (state) => state.marketUi.selectedIndicator,
  );

  const selectedInterval = useAppSelector(
    (state) => state.marketUi.selectedInterval,
  );

  const {
    currentData: data,
    isLoading,
    isFetching,
    isError,
    refetch,
  } = useGetMarketQuery({
    symbol: "MSFT",
    interval: selectedInterval,
  });

  const {
    data: availableIndicators,
    isLoading: isListLoading,
    isError: isListError,
    isFetching: isListFetching,
    refetch: refetchList,
  } = useGetIndicatorsQuery();

  const indicatorNames = availableIndicators?.indicators ?? [];

  const activeIndicator = indicatorNames.includes(selectedIndicator)
    ? selectedIndicator
    : "";

  const {
    currentData: indicatorData,
    isFetching: isIndicatorFetching,
    isError: isIndicatorError,
    refetch: refetchIndicator,
  } = useGetIndicatorQuery(
    {
      symbol: "MSFT",
      name: activeIndicator,
      interval: selectedInterval,
    },
    {
      skip: activeIndicator === "",
    },
  );

  if (isLoading || (isFetching && !data)) {
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

  const selectedSeries = activeIndicator
    ? indicatorData?.series[0]
    : undefined;

  const valuesByDate = new Map(
    (selectedSeries?.points ?? []).map((point) => [
      point.time,
      point.value,
    ]),
  );

  const chartData = data.candles.map((candle) => ({
    ...candle,
    indicatorValue: valuesByDate.get(candle.time) ?? null,
  }));
  
  return (
    <main>
      <h1>MarketLab — {data.symbol}</h1>
      <p>Intervalo: {data.interval} · Datos simulados</p>

      <div>
        <label htmlFor="interval-select">Intervalo: </label>

        <select
          id="interval-select"
          value={selectedInterval}
          onChange={(event) =>
            dispatch(setSelectedInterval(event.target.value))
          }
        >
          <option value="1d">Diario</option>
          <option value="5m">5 minutos</option>
        </select>
      </div>

      <section aria-label="Indicadores disponibles">
        <h2>Indicadores disponibles</h2>

        <button
          type="button"
          onClick={() => refetchList()}
          disabled={isListFetching}
        >
          {isListFetching ? "Buscando..." : "Actualizar lista"}
        </button>

        {isListLoading && <p>Cargando indicadores...</p>}

        {isListError && (
          <p role="alert">
            No se pudo actualizar la lista de indicadores.
          </p>
        )}

        <label htmlFor="indicator-select">Indicador: </label>

        <select
          id="indicator-select"
          value={activeIndicator}
          onChange={(event) =>
            dispatch(setSelectedIndicator(event.target.value))
          }
          disabled={isListLoading}
        >
          <option value="">Sin indicador</option>

          {indicatorNames.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>

        {availableIndicators && indicatorNames.length === 0 && (
          <p>No hay indicadores disponibles.</p>
        )}
      </section>

      <button
        type="button"
        onClick={() => {
          refetch();

          if (activeIndicator) {
            refetchIndicator();
          }
        }}
        disabled={isFetching || isIndicatorFetching}
      >
        {isFetching || isIndicatorFetching
          ? "Actualizando..."
          : "Actualizar precios e indicador"}
      </button>

      {activeIndicator && isIndicatorError && (
        <p role="alert">
          No se pudo actualizar el indicador {activeIndicator}.
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
              {selectedSeries && indicatorData?.display.placement === "overlay" && (
                <Line
                  type="linear"
                  dataKey="indicatorValue"
                  name={selectedSeries.name}
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

      {selectedSeries && indicatorData?.display.placement === "panel" && (
        <section aria-label={`Gráfico de ${selectedSeries.name}`}>
          <h2>{selectedSeries.name}</h2>

          <div style={{ width: "100%", minWidth: 0, height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={chartData}
                syncId="market"
                syncMethod="value"
                margin={{ top: 10, right: 25, bottom: 10, left: 10 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="time" minTickGap={40} />
                <YAxis
                  width={75}
                  domain={indicatorData?.display.domain ?? ["auto", "auto"]}
                  tickFormatter={(value: number) => value.toFixed(2)}
                />
                <Tooltip />

                <Line
                  type="linear"
                  dataKey="indicatorValue"
                  name={selectedSeries.name}
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
      )}

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