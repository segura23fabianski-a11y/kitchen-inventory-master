import * as React from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Delete, X, CornerDownLeft, Space, ArrowBigUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";

interface OnScreenKeyboardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: string;
  onConfirm: (value: string) => void;
  /** Label shown above the display */
  label?: string;
  /** Input type for validation hints */
  inputType?: "text" | "email" | "search";
}

const ROWS_LOWER = [
  ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
  ["a", "s", "d", "f", "g", "h", "j", "k", "l", "ñ"],
  ["z", "x", "c", "v", "b", "n", "m"],
];

const ROWS_UPPER = ROWS_LOWER.map((row) => row.map((k) => k.toUpperCase()));

const SYMBOLS_ROW1 = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];
const SYMBOLS_ROW2 = ["@", "#", "$", "%", "&", "-", "_", "+", "(", ")"];
const SYMBOLS_ROW3 = [".", ",", ":", ";", "!", "?", "/", "'"];

type Mode = "lower" | "upper" | "symbols";

export function OnScreenKeyboard({
  open,
  onOpenChange,
  value: initialValue,
  onConfirm,
  label,
  inputType = "text",
}: OnScreenKeyboardProps) {
  const [display, setDisplay] = React.useState(initialValue || "");
  const [mode, setMode] = React.useState<Mode>("lower");

  React.useEffect(() => {
    if (open) {
      setDisplay(initialValue || "");
      setMode("lower");
    }
  }, [open, initialValue]);

  const appendChar = (ch: string) => {
    setDisplay((prev) => prev + ch);
    // Auto-return to lowercase after one uppercase char
    if (mode === "upper") setMode("lower");
  };

  const backspace = () => setDisplay((prev) => prev.slice(0, -1));
  const clear = () => setDisplay("");

  const handleConfirm = () => {
    onConfirm(display);
    onOpenChange(false);
  };

  const handleCancel = () => onOpenChange(false);

  const btnClass =
    "h-11 min-w-[2.25rem] text-base font-medium rounded-lg active:scale-95 transition-transform select-none";

  const rows = mode === "symbols"
    ? [SYMBOLS_ROW1, SYMBOLS_ROW2, SYMBOLS_ROW3]
    : mode === "upper"
    ? ROWS_UPPER
    : ROWS_LOWER;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-lg p-3 gap-2"
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <VisuallyHidden>
          <DialogTitle>Teclado en pantalla</DialogTitle>
        </VisuallyHidden>

        {label && (
          <p className="text-xs text-muted-foreground text-center">{label}</p>
        )}

        {/* Display */}
        <div className="rounded-lg border bg-muted/50 px-3 py-2 text-lg font-medium text-foreground min-h-[2.75rem] flex items-center overflow-hidden break-all">
          {display || <span className="text-muted-foreground">...</span>}
          <span className="animate-pulse ml-0.5 text-primary">|</span>
        </div>

        {/* Key rows */}
        {rows.map((row, ri) => (
          <div key={ri} className="flex justify-center gap-1">
            {ri === 2 && mode !== "symbols" && (
              <Button
                type="button"
                variant={mode === "upper" ? "default" : "outline"}
                className={cn(btnClass, "px-2")}
                onClick={() => setMode(mode === "upper" ? "lower" : "upper")}
              >
                <ArrowBigUp className="h-5 w-5" />
              </Button>
            )}
            {row.map((key) => (
              <Button
                key={key}
                type="button"
                variant="secondary"
                className={cn(btnClass, "px-0 flex-1 max-w-[2.75rem]")}
                onClick={() => appendChar(key)}
              >
                {key}
              </Button>
            ))}
            {ri === 2 && (
              <Button
                type="button"
                variant="ghost"
                className={cn(btnClass, "px-2")}
                onClick={backspace}
              >
                <Delete className="h-5 w-5" />
              </Button>
            )}
          </div>
        ))}

        {/* Bottom row: symbols toggle, space, clear, actions */}
        <div className="flex gap-1">
          <Button
            type="button"
            variant="outline"
            className={cn(btnClass, "px-3 text-sm")}
            onClick={() => setMode(mode === "symbols" ? "lower" : "symbols")}
          >
            {mode === "symbols" ? "ABC" : "123"}
          </Button>
          {inputType === "email" && (
            <Button
              type="button"
              variant="secondary"
              className={cn(btnClass, "px-3")}
              onClick={() => appendChar("@")}
            >
              @
            </Button>
          )}
          <Button
            type="button"
            variant="secondary"
            className={cn(btnClass, "flex-1")}
            onClick={() => appendChar(" ")}
          >
            <Space className="h-4 w-4 mr-1" /> espacio
          </Button>
          <Button
            type="button"
            variant="outline"
            className={cn(btnClass, "px-3 text-destructive")}
            onClick={clear}
          >
            C
          </Button>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2 pt-1">
          <Button
            type="button"
            variant="outline"
            className="h-11 flex-1"
            onClick={handleCancel}
          >
            <X className="h-4 w-4 mr-1" /> Cancelar
          </Button>
          <Button
            type="button"
            className="h-11 flex-1 font-bold"
            onClick={handleConfirm}
          >
            <CornerDownLeft className="h-4 w-4 mr-1" /> OK
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
