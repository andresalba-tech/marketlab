import type { ReactNode } from "react";
import { IntervalSelector } from "./IntervalSelector";
import { SymbolSelector } from "./SymbolSelector";

type MarketStatusProps = {
  symbol: string;
  onSymbolChange: (symbol: string) => void;
  interval: string;
  onIntervalChange: (interval: string) => void;
  children: ReactNode;
};

export function MarketStatus({
  symbol,
  onSymbolChange,
  interval,
  onIntervalChange,
  children,
}: MarketStatusProps) {
  return (
    <main>
      <h1>MarketLab — {symbol}</h1>

      <SymbolSelector value={symbol} onChange={onSymbolChange} />

      <IntervalSelector
        value={interval}
        onChange={onIntervalChange}
      />

      {children}
    </main>
  );
}