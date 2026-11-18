import { createSlice } from "@reduxjs/toolkit";

const marketUiSlice = createSlice({
  name: "marketUi",
  initialState: {
    showTable: true,
  },
  reducers: {
    toggleTable(state) {
      state.showTable = !state.showTable;
    },
  },
});

export const { toggleTable } = marketUiSlice.actions;
export default marketUiSlice.reducer;