import { createSlice } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";

const marketUiSlice = createSlice({
  name: "marketUi",
  initialState: {
    showTable: true,
    selectedIndicator: "",
    selectedInterval: "1d",
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
  },
});

export const {
  toggleTable,
  setSelectedIndicator,
  setSelectedInterval,
} = marketUiSlice.actions;
export default marketUiSlice.reducer;