import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getCompatibleUnits } from "@/lib/unit-conversion";

interface UnitSelectorProps {
  productUnit: string;
  value: string;
  onChange: (unit: string) => void;
  className?: string;
}

/**
 * Dropdown that shows only units compatible with the product's base unit.
 * For discrete units (unidad, caja, etc.), renders a static label instead.
 */
export function UnitSelector({ productUnit, value, onChange, className }: UnitSelectorProps) {
  const units = getCompatibleUnits(productUnit);

  if (units.length <= 1) {
    return <p className={`h-10 flex items-center text-sm ${className ?? ""}`}>{units[0] ?? productUnit}</p>;
  }

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={className}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {units.map((u) => (
          <SelectItem key={u} value={u}>{u}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
