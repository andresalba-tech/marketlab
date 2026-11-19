import { marketFixture } from "../data/marketFixture.js";
import { intradayFixture } from "../data/intradayFixture.js";

export function getMarketFixture(interval: string) {
  switch (interval) {
    case "1d":
      return marketFixture;

    case "5m":
      return intradayFixture;

    default:
      return null;
  }
}