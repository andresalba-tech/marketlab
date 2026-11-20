import { useState } from "react";

type DateRange = {
  from: string;
  to: string;
};

type DateRangeSelectorProps = {
  value: DateRange;
  onApply: (range: DateRange) => void;
};

export function DateRangeSelector({
  value,
  onApply,
}: DateRangeSelectorProps) {
  const [from, setFrom] = useState(value.from);
  const [to, setTo] = useState(value.to);

  const invalidRange = from !== "" && to !== "" && from > to;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();

        if (!invalidRange) {
          onApply({ from, to });
        }
      }}
    >
      <label htmlFor="range-from">Desde: </label>
      <input
        id="range-from"
        type="date"
        value={from}
        onChange={(event) => setFrom(event.target.value)}
      />

      <label htmlFor="range-to">Hasta: </label>
      <input
        id="range-to"
        type="date"
        value={to}
        onChange={(event) => setTo(event.target.value)}
      />

      <button type="submit" disabled={invalidRange}>
        Aplicar rango
      </button>

      <button
        type="button"
        onClick={() => {
          setFrom("");
          setTo("");
          onApply({ from: "", to: "" });
        }}
      >
        Todo el historial
      </button>

      {invalidRange && (
        <p role="alert">
          Desde no puede ser posterior a Hasta.
        </p>
      )}

      <p>Fechas inclusivas en UTC.</p>
    </form>
  );
}