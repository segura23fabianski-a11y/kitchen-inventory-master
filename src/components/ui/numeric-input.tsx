import * as React from "react";
import { cn } from "@/lib/utils";

export interface NumericInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "type"> {
  /** "decimal" for kg/costs, "integer" for units */
  mode?: "decimal" | "integer";
  value: string | number;
  onChange: (value: string) => void;
}

/**
 * Numeric input optimised for kiosk / tablet:
 *  – Opens numeric keypad on mobile (inputMode + pattern)
 *  – Normalises comma → dot
 *  – Blocks invalid characters
 */
const NumericInput = React.forwardRef<HTMLInputElement, NumericInputProps>(
  ({ className, mode = "decimal", value, onChange, ...props }, ref) => {
    const isDecimal = mode === "decimal";

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      let v = e.target.value;
      // Normalise comma to dot
      v = v.replace(",", ".");
      // Strip anything that isn't digit, dot, or minus
      if (isDecimal) {
        v = v.replace(/[^0-9.\-]/g, "");
        // Allow only one dot
        const parts = v.split(".");
        if (parts.length > 2) v = parts[0] + "." + parts.slice(1).join("");
      } else {
        v = v.replace(/[^0-9\-]/g, "");
      }
      onChange(v);
    };

    return (
      <input
        ref={ref}
        type="number"
        inputMode={isDecimal ? "decimal" : "numeric"}
        pattern={isDecimal ? "[0-9]*[.,]?[0-9]*" : "[0-9]*"}
        step={isDecimal ? "0.01" : "1"}
        autoComplete="off"
        value={value}
        onChange={handleChange}
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className
        )}
        {...props}
      />
    );
  }
);
NumericInput.displayName = "NumericInput";

export { NumericInput };
