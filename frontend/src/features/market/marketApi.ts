import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import type {
  BacktestRequest,
  BacktestResult,
} from "./backtestTypes";

export type Candle = {
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
  display: {
    placement: "overlay" | "panel";
    domain?: [number, number];
  };
  series: {
    name: string;
    points: {
      time: string;
      value: number | null;
    }[];
  }[];
};

type MarketQuery = {
  symbol: string;
  interval: string;
  from?: string;
  to?: string;
};

type IndicatorQuery = MarketQuery & {
  name: string;
};

export const marketApi = createApi({
    reducerPath: "marketApi",
    baseQuery: fetchBaseQuery({ baseUrl: "/api/" }),
    endpoints: (builder) => ({
      
        getMarket: builder.query<MarketResponse, MarketQuery>({
          query: ({ symbol, interval, from, to }) => ({
            url: `market/${encodeURIComponent(symbol)}`,
            params: {
              interval,
              ...(from ? { from } : {}),
              ...(to ? { to } : {}),
            },
          }),
        }),

        getIndicator: builder.query<IndicatorResponse, IndicatorQuery>({
          query: ({ symbol, name, interval, from, to }) => ({
            url: `market/${encodeURIComponent(symbol)}/indicators/${encodeURIComponent(name)}`,
            params: {
              interval,
              ...(from ? { from } : {}),
              ...(to ? { to } : {}),
            },
          }),
        }),

        getIndicators: builder.query<{ indicators: string[] }, string>({
          query: (interval) => ({
            url: "indicators",
            params: { interval },
          }),
        }),

        runBacktest: builder.mutation<BacktestResult, BacktestRequest>({
          query: (request) => ({
            url: "backtests",
            method: "POST",
            body: request,
          }),
        }),
    }),
});

export const {
  useGetMarketQuery,
  useGetIndicatorQuery,
  useGetIndicatorsQuery,
  useRunBacktestMutation,
} = marketApi;