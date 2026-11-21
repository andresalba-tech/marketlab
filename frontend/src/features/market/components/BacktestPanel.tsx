import { useState } from "react";
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
import { useRunBacktestMutation } from "../marketApi";

type BacktestPanelProps = {
  symbol: string;
  interval: string;
  from: string;
  to: string;
};

const formatNumber = (value: number) =>
  value.toLocaleString("es-CO", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export function BacktestPanel({
  symbol,
  interval,
  from,
  to,
}: BacktestPanelProps) {
  const [capital, setCapital] = useState("10000");
  const [commission, setCommission] = useState("10");

  const [runBacktest, { data, isLoading, isError }] =
    useRunBacktestMutation();

  const initialCapital = Number(capital);
  const commissionBps = Number(commission);

  const validInputs =
    capital.trim() !== "" &&
    commission.trim() !== "" &&
    Number.isFinite(initialCapital) &&
    initialCapital > 0 &&
    Number.isFinite(commissionBps) &&
    commissionBps >= 0 &&
    commissionBps < 10000;

  const benchmarkByTime = new Map(
    (data?.benchmark.equityCurve ?? []).map((point) => [
      point.time,
      point.equity,
    ]),
  );

  const chartData = (data?.equityCurve ?? []).map((point) => ({
    time: point.time,
    strategy: point.equity,
    benchmark: benchmarkByTime.get(point.time) ?? null,
  }));

  return (
    <section aria-label="Backtesting">
      <h2>Backtest — RSI 2</h2>

      <p>
        {symbol} · {interval} · Datos simulados
        {" · "}
        {from || "Inicio disponible"} → {to || "Fin disponible"}
      </p>

      <p>
        Entrada: RSI 2 menor que 10. Salida: RSI 2 mayor que 70.
        Señal al cierre y ejecución en la siguiente apertura.
      </p>

      <form
        onSubmit={(event) => {
          event.preventDefault();

          if (!validInputs || isLoading) return;

          void runBacktest({
            symbol,
            interval,
            strategy: {
              name: "rsi2",
              entryBelow: 10,
              exitAbove: 70,
            },
            initialCapital,
            commissionBps,
            ...(from ? { from } : {}),
            ...(to ? { to } : {}),
          });
        }}
      >
        <label htmlFor="backtest-capital">Capital inicial: </label>
        <input
          id="backtest-capital"
          type="number"
          step="any"
          min="0"
          required
          value={capital}
          onChange={(event) => setCapital(event.target.value)}
        />

        <label htmlFor="backtest-commission">
          Comisión por entrada y salida (bps):{" "}
        </label>
        <input
          id="backtest-commission"
          type="number"
          step="any"
          min="0"
          max="9999.99"
          required
          value={commission}
          onChange={(event) => setCommission(event.target.value)}
        />

        <button
          type="submit"
          disabled={!validInputs || isLoading}
        >
          {isLoading ? "Ejecutando..." : "Ejecutar backtest"}
        </button>

        <p>10 bps equivalen a una comisión del 0,10 %.</p>
      </form>

      {isError && (
        <p role="alert">
          No se pudo ejecutar el backtest. Comprueba que el backend
          esté disponible y que el rango contenga datos.
        </p>
      )}

      {data && (
        <>
          <h3>Resultado</h3>

          <p>
            Capital utilizado: {formatNumber(data.request.initialCapital)}
            {" · "}
            Comisión utilizada: {data.request.commissionBps} bps
          </p>

          <table>
            <thead>
              <tr>
                <th scope="col">Métrica</th>
                <th scope="col">RSI 2</th>
                <th scope="col">Comprar y mantener</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">Capital final</th>
                <td>{formatNumber(data.metrics.finalCapital)}</td>
                <td>{formatNumber(data.benchmark.finalCapital)}</td>
              </tr>
              <tr>
                <th scope="row">Retorno total</th>
                <td>{formatNumber(data.metrics.totalReturnPct)} %</td>
                <td>{formatNumber(data.benchmark.totalReturnPct)} %</td>
              </tr>
              <tr>
                <th scope="row">Caída máxima</th>
                <td>{formatNumber(data.metrics.maxDrawdownPct)} %</td>
                <td>{formatNumber(data.benchmark.maxDrawdownPct)} %</td>
              </tr>
            </tbody>
          </table>

          <p>
            Operaciones cerradas: {data.metrics.tradeCount}
            {" · "}
            Ganadoras: {formatNumber(data.metrics.winRatePct)} %
          </p>

          <h3>Evolución del capital</h3>

          <div style={{ width: "100%", minWidth: 0, height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={chartData}
                margin={{ top: 10, right: 25, bottom: 10, left: 10 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="time" minTickGap={60} />
                <YAxis
                  width={90}
                  domain={["auto", "auto"]}
                  tickFormatter={formatNumber}
                />
                <Tooltip />
                <Legend />

                <Line
                  type="linear"
                  dataKey="strategy"
                  name="RSI 2"
                  stroke="#38bdf8"
                  dot={false}
                  isAnimationActive={false}
                />

                <Line
                  type="linear"
                  dataKey="benchmark"
                  name="Comprar y mantener"
                  stroke="#f97316"
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <h3>Operaciones</h3>

          {data.trades.length === 0 ? (
            <p>No se realizaron operaciones en este período.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table>
                <thead>
                  <tr>
                    <th scope="col">Entrada</th>
                    <th scope="col">Precio entrada</th>
                    <th scope="col">Salida</th>
                    <th scope="col">Precio salida</th>
                    <th scope="col">Comisiones</th>
                    <th scope="col">PnL neto</th>
                    <th scope="col">Retorno</th>
                    <th scope="col">Motivo de salida</th>
                  </tr>
                </thead>

                <tbody>
                  {data.trades.map((trade) => (
                    <tr key={trade.entryTime}>
                      <td>{trade.entryTime}</td>
                      <td>{formatNumber(trade.entryPrice)}</td>
                      <td>{trade.exitTime}</td>
                      <td>{formatNumber(trade.exitPrice)}</td>
                      <td>
                        {formatNumber(
                          trade.entryCommission + trade.exitCommission,
                        )}
                      </td>
                      <td>{formatNumber(trade.netPnl)}</td>
                      <td>{formatNumber(trade.returnPct)} %</td>
                      <td>
                        {trade.exitReason === "signal"
                          ? "Señal RSI"
                          : "Fin del período"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}