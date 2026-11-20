type IndicatorSelectorProps = {
  names: string[];
  value: string;
  disabled: boolean;
  onChange: (name: string) => void;
};

export function IndicatorSelector({
  names,
  value,
  disabled,
  onChange,
}: IndicatorSelectorProps) {
  return (
    <div>
      <label htmlFor="indicator-select">Indicador: </label>

      <select
        id="indicator-select"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
      >
        <option value="">Sin indicador</option>

        {names.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>
    </div>
  );
}