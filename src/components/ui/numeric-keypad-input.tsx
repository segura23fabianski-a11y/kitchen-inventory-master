import * as React from "react";
import { NumericInput, type NumericInputProps } from "./numeric-input";
import { NumericKeypad } from "./numeric-keypad";
import { useKioskMode } from "@/hooks/use-kiosk-mode";
import { Calculator } from "lucide-react";
import { cn } from "@/lib/utils";

interface NumericKeypadInputProps extends NumericInputProps {
  /** Label for the keypad display */
  keypadLabel?: string;
  /** Max decimal places for keypad */
  maxDecimals?: number;
  /** Max value for keypad */
  maxValue?: number;
  /** Quick-add buttons */
  quickButtons?: number[];
  /** Force keypad even outside kiosk mode */
  forceKeypad?: boolean;
}

/**
 * A numeric input that opens a built-in NumericKeypad on tap in kiosk mode.
 * In non-kiosk mode, it acts as a normal NumericInput with an optional keypad button.
 */
const NumericKeypadInput = React.forwardRef<HTMLInputElement, NumericKeypadInputProps>(
  (
    {
      keypadLabel,
      maxDecimals = 3,
      maxValue,
      quickButtons,
      forceKeypad,
      className,
      value,
      onChange,
      ...props
    },
    ref
  ) => {
    const { kioskMode } = useKioskMode();
    const [keypadOpen, setKeypadOpen] = React.useState(false);
    const useKeypad = forceKeypad || kioskMode;

    const handleInputInteraction = (e: React.MouseEvent | React.FocusEvent) => {
      if (useKeypad) {
        e.preventDefault();
        (e.target as HTMLInputElement).blur();
        setKeypadOpen(true);
      }
    };

    const handleConfirm = (v: string) => {
      onChange(v === "0" ? "" : v);
    };

    return (
      <div className="relative">
        <NumericInput
          ref={ref}
          value={value}
          onChange={onChange}
          readOnly={useKeypad}
          onClick={handleInputInteraction}
          onFocus={useKeypad ? (e) => { e.preventDefault(); e.target.blur(); setKeypadOpen(true); } : undefined}
          className={cn(useKeypad && "cursor-pointer caret-transparent", className)}
          {...props}
        />
        {!useKeypad && (
          <button
            type="button"
            tabIndex={-1}
            onClick={() => setKeypadOpen(true)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5"
            aria-label="Abrir teclado numérico"
          >
            <Calculator className="h-4 w-4" />
          </button>
        )}
        <NumericKeypad
          open={keypadOpen}
          onOpenChange={setKeypadOpen}
          value={String(value || "0")}
          onConfirm={handleConfirm}
          maxDecimals={maxDecimals}
          maxValue={maxValue}
          label={keypadLabel}
          quickButtons={quickButtons}
        />
      </div>
    );
  }
);
NumericKeypadInput.displayName = "NumericKeypadInput";

export { NumericKeypadInput };
