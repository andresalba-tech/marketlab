import { createSlice } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";

const marketUiSlice = createSlice({
  name: "marketUi",
  initialState: {
    showTable: true,
    selectedIndicator: "",
    selectedInterval: "1d",
    selectedSymbol: "MSFT",
    dateRange: {
      from: "",
      to: "",
    },
  },
  reducers: {
    toggleTable(state) {
      state.showTable = !state.showTable;
    },
    setSelectedIndicator(state, action: PayloadAction<string>) {
      state.selectedIndicator = action.payload;
    },
    setSelectedInterval(state, action: PayloadAction<string>) {
      state.selectedInterval = action.payload;
      state.selectedIndicator = "";
    },
    setSelectedSymbol(state, action: PayloadAction<string>) {
      state.selectedSymbol = action.payload;
    },
    setDateRange(
      state,
      action: PayloadAction<{ from: string; to: string }>,
    ) {
      state.dateRange = action.payload;
    },
  },
});

export const {
  toggleTable,
  setSelectedIndicator,
  setSelectedInterval,
  setSelectedSymbol,
  setDateRange,
} = marketUiSlice.actions;
export default marketUiSlice.reducer;