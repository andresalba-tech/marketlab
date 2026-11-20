import type { Candle } from "../marketApi";

type MarketTableProps = {
  candles: Candle[];
};

export function MarketTable({ candles }: MarketTableProps) {
  return (
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
        {candles.map((candle) => (
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
  );
}