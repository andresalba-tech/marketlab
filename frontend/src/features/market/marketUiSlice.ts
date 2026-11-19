import { createSlice } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";

const marketUiSlice = createSlice({
  name: "marketUi",
  initialState: {
    showTable: true,
    selectedIndicator: "",
  },
  reducers: {
    toggleTable(state) {
      state.showTable = !state.showTable;
    },
    setSelectedIndicator(state, action: PayloadAction<string>) {
      state.selectedIndicator = action.payload;
    },
  },
});

export const { toggleTable, setSelectedIndicator } = marketUiSlice.actions;
export default marketUiSlice.reducer;