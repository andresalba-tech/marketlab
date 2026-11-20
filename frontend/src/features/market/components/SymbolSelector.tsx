type SymbolSelectorProps = {
  value: string;
  onChange: (symbol: string) => void;
};

export function SymbolSelector({
  value,
  onChange,
}: SymbolSelectorProps) {
  return (
    <div>
      <label htmlFor="symbol-select">Símbolo: </label>

      <select
        id="symbol-select"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="MSFT">MSFT</option>
        <option value="AAPL">AAPL</option>
      </select>
    </div>
  );
}