import { configureStore } from "@reduxjs/toolkit";
import marketUiReducer from "../features/market/marketUiSlice";
import { marketApi } from "../features/market/marketApi";

export const store = configureStore({
  reducer: {
    marketUi: marketUiReducer,
    [marketApi.reducerPath]: marketApi.reducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(marketApi.middleware),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;