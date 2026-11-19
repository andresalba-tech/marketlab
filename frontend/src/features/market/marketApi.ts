import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";

type Candle = {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

type MarketResponse = {
  symbol: string;
  interval: string;
  source: string;
  candles: Candle[];
};

type IndicatorResponse = {
  symbol: string;
  interval: string;
  source: string;
  indicator: string;
  series: {
    name: string;
    points: {
      time: string;
      value: number | null;
    }[];
  }[];
};

type IndicatorQuery = {
  symbol: string;
  name: string;
};

export const marketApi = createApi({
    reducerPath: "marketApi",
    baseQuery: fetchBaseQuery({ baseUrl: "/api/" }),
    endpoints: (builder) => ({
        getMarket: builder.query<MarketResponse, string>({
            query: (symbol) => `market/${encodeURIComponent(symbol)}`,
        }),

        getIndicator: builder.query<IndicatorResponse, IndicatorQuery>({
            query: ({ symbol, name }) =>
            `market/${encodeURIComponent(symbol)}/indicators/${encodeURIComponent(name)}`,
        }),

        getIndicators: builder.query<{ indicators: string[] }, void>({
            query: () => "indicators",
        }),
    }),
});

export const {
  useGetMarketQuery,
  useGetIndicatorQuery,
  useGetIndicatorsQuery,
} = marketApi;