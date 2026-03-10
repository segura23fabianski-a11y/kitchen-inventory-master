import * as React from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Delete, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";

interface NumericKeypadProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: string;
  onConfirm: (value: string) => void;
/** Max decimal places (default 6) */
  maxDecimals?: number;
  /** Max value allowed (default Infinity) */
  maxValue?: number;
  /** Label shown above the display */
  label?: string;
  /** Show quick-add buttons */
  quickButtons?: number[];
}

const DEFAULT_QUICK = [0.1, 0.5, 1];

export function NumericKeypad({
  open,
  onOpenChange,
  value: initialValue,
  onConfirm,
  maxDecimals = 6,
  maxValue = Infinity,
  label,
  quickButtons = DEFAULT_QUICK,
}: NumericKeypadProps) {
  const [display, setDisplay] = React.useState(initialValue || "0");

  // Sync when opened
  React.useEffect(() => {
    if (open) {
      const v = initialValue && initialValue !== "0" ? initialValue : "0";
      setDisplay(v);
    }
  }, [open, initialValue]);

  const appendDigit = (digit: string) => {
    setDisplay((prev) => {
      if (digit === "." || digit === ",") {
        if (prev.includes(".")) return prev;
        return prev + ".";
      }
      // If display is "0" and digit is not ".", replace
      let next = prev === "0" ? digit : prev + digit;
      // Enforce max decimals
      const dotIdx = next.indexOf(".");
      if (dotIdx !== -1 && next.length - dotIdx - 1 > maxDecimals) {
        return prev;
      }
      // Enforce max value
      if (Number(next) > maxValue) return prev;
      return next;
    });
  };

  const backspace = () => {
    setDisplay((prev) => {
      if (prev.length <= 1) return "0";
      return prev.slice(0, -1);
    });
  };

  const clear = () => setDisplay("0");

  const addQuick = (amount: number) => {
    setDisplay((prev) => {
      const next = (Number(prev) + amount).toFixed(maxDecimals);
      // Trim trailing zeros but keep at least one decimal if it had one
      const trimmed = parseFloat(next).toString();
      if (Number(trimmed) > maxValue) return prev;
      return trimmed;
    });
  };

  const handleConfirm = () => {
    onConfirm(display);
    onOpenChange(false);
  };

  const handleCancel = () => {
    onOpenChange(false);
  };

  const btnClass =
    "h-14 text-xl font-semibold rounded-lg active:scale-95 transition-transform select-none";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xs p-4 gap-3" onPointerDownOutside={(e) => e.preventDefault()}>
        <VisuallyHidden><DialogTitle>Teclado numérico</DialogTitle></VisuallyHidden>
        {label && (
          <p className="text-sm text-muted-foreground text-center">{label}</p>
        )}
        {/* Display */}
        <div className="rounded-lg border bg-muted/50 px-4 py-3 text-right font-mono text-3xl font-bold tracking-wider text-foreground min-h-[3.5rem] flex items-center justify-end overflow-hidden">
          {display}
        </div>

        {/* Quick buttons */}
        {quickButtons.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {quickButtons.map((q) => (
              <Button
                key={q}
                type="button"
                variant="outline"
                size="sm"
                className="text-xs font-medium"
                onClick={() => addQuick(q)}
              >
                +{q}
              </Button>
            ))}
          </div>
        )}

        {/* Keypad grid */}
        <div className="grid grid-cols-3 gap-2">
          {["7", "8", "9", "4", "5", "6", "1", "2", "3"].map((d) => (
            <Button
              key={d}
              type="button"
              variant="secondary"
              className={btnClass}
              onClick={() => appendDigit(d)}
            >
              {d}
            </Button>
          ))}
          <Button
            type="button"
            variant="secondary"
            className={btnClass}
            onClick={() => appendDigit(".")}
          >
            .
          </Button>
          <Button
            type="button"
            variant="secondary"
            className={btnClass}
            onClick={() => appendDigit("0")}
          >
            0
          </Button>
          <Button
            type="button"
            variant="ghost"
            className={cn(btnClass, "text-base")}
            onClick={backspace}
          >
            <Delete className="h-5 w-5" />
          </Button>
        </div>

        {/* Actions */}
        <div className="grid grid-cols-3 gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-12"
            onClick={handleCancel}
          >
            <X className="h-4 w-4 mr-1" /> Cancelar
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-12 text-destructive"
            onClick={clear}
          >
            C
          </Button>
          <Button
            type="button"
            className="h-12 font-bold"
            onClick={handleConfirm}
          >
            OK
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
