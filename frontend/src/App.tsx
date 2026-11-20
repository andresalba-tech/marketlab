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
import { MarketTable } from "./features/market/components/MarketTable";
import { IntervalSelector } from "./features/market/components/IntervalSelector";
import { IndicatorSelector } from "./features/market/components/IndicatorSelector";
import { PriceChart } from "./features/market/components/PriceChart";
import { IndicatorPanel } from "./features/market/components/IndicatorPanel";
import { buildChartData } from "./features/market/buildChartData";
import { MarketStatus } from "./features/market/components/MarketStatus";

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
    currentData: availableIndicators,
    isError: isListError,
    isFetching: isListFetching,
    refetch: refetchList,
  } = useGetIndicatorsQuery(selectedInterval);

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
    return (
      <MarketStatus
        interval={selectedInterval}
        onIntervalChange={(interval) =>
          dispatch(setSelectedInterval(interval))
        }
      >
        <p role="status">
          Cargando precios del intervalo {selectedInterval}...
        </p>
      </MarketStatus>
    );
  }

  if (isError && !data) {
    return (
      <MarketStatus
        interval={selectedInterval}
        onIntervalChange={(interval) =>
          dispatch(setSelectedInterval(interval))
        }
      >
        <p role="alert">
          No se pudieron cargar los precios del intervalo
          {" "}{selectedInterval}.
        </p>

        <button
          type="button"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          Reintentar
        </button>
      </MarketStatus>
    );
  }

  if (!data || data.candles.length === 0) {
    return (
      <MarketStatus
        interval={selectedInterval}
        onIntervalChange={(interval) =>
          dispatch(setSelectedInterval(interval))
        }
      >
        <p role="status">
          No hay precios disponibles para el intervalo
          {" "}{selectedInterval}.
        </p>

        <button
          type="button"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          {isFetching ? "Actualizando..." : "Actualizar precios"}
        </button>
      </MarketStatus>
    );
  }

  const selectedSeries = activeIndicator
    ? indicatorData?.series[0]
    : undefined;

  const chartData = buildChartData(
    data.candles,
    selectedSeries?.points ?? [],
  );
  
  return (
    <main>
      <h1>MarketLab — {data.symbol}</h1>
      <p>
        Intervalo: {data.interval} · Datos simulados
        {data.interval !== "1d" && " · Horas en UTC"}
      </p>

      <IntervalSelector
        value={selectedInterval}
        onChange={(interval) =>
          dispatch(setSelectedInterval(interval))
        }
      />

      <section aria-label="Indicadores disponibles">
        <h2>Indicadores disponibles</h2>

        <button
          type="button"
          onClick={() => refetchList()}
          disabled={isListFetching}
        >
          {isListFetching ? "Buscando..." : "Actualizar lista"}
        </button>

        {isListFetching && (
          <p role="status">
            {availableIndicators
              ? "Actualizando indicadores..."
              : "Cargando indicadores..."}
          </p>
        )}

        {isListError && (
          <p role="alert">
            No se pudo actualizar la lista de indicadores.
          </p>
        )}

        <IndicatorSelector
          names={indicatorNames}
          value={activeIndicator}
          disabled={isListFetching}
          onChange={(name) =>
            dispatch(setSelectedIndicator(name))
          }
        />

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

      {activeIndicator && isIndicatorFetching && (
        <p role="status">
          {indicatorData
            ? `Actualizando ${activeIndicator}...`
            : `Cargando ${activeIndicator}...`}
        </p>
      )}

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

      <PriceChart
        data={chartData}
        overlayName={
          indicatorData?.display.placement === "overlay"
            ? selectedSeries?.name ?? null
            : null
        }
      />

      {selectedSeries && indicatorData?.display.placement === "panel" && (
        <IndicatorPanel
          data={chartData}
          name={selectedSeries.name}
          domain={indicatorData.display.domain}
        />
      )}

      <button type="button" onClick={() => dispatch(toggleTable())}>
        {showTable ? "Ocultar tabla" : "Mostrar tabla"}
      </button>

      {showTable && <MarketTable candles={data.candles} />}
    </main>
  );
}