type IntervalSelectorProps = {
  value: string;
  onChange: (interval: string) => void;
};

export function IntervalSelector({
  value,
  onChange,
}: IntervalSelectorProps) {
  return (
    <div>
      <label htmlFor="interval-select">Intervalo: </label>

      <select
        id="interval-select"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="1d">Diario</option>
        <option value="5m">5 minutos</option>
      </select>
    </div>
  );
}