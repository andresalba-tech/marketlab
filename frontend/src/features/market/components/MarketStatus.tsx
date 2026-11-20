import type { ReactNode } from "react";
import { IntervalSelector } from "./IntervalSelector";

type MarketStatusProps = {
  interval: string;
  onIntervalChange: (interval: string) => void;
  children: ReactNode;
};

export function MarketStatus({
  interval,
  onIntervalChange,
  children,
}: MarketStatusProps) {
  return (
    <main>
      <h1>MarketLab — MSFT</h1>

      <IntervalSelector
        value={interval}
        onChange={onIntervalChange}
      />

      {children}
    </main>
  );
}