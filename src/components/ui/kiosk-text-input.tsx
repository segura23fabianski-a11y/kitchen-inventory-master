import * as React from "react";
import { Input } from "@/components/ui/input";
import { OnScreenKeyboard } from "./on-screen-keyboard";
import { useKioskMode } from "@/hooks/use-kiosk-mode";
import { Keyboard } from "lucide-react";
import { cn } from "@/lib/utils";

interface KioskTextInputProps
  extends Omit<React.ComponentProps<"input">, "onChange" | "value"> {
  value: string;
  onChange: (value: string) => void;
  /** Label shown on the keyboard */
  keyboardLabel?: string;
  /** Force on-screen keyboard even outside kiosk mode */
  forceKeyboard?: boolean;
  /** Input type hint for keyboard layout */
  inputType?: "text" | "email" | "search";
}

const KioskTextInput = React.forwardRef<HTMLInputElement, KioskTextInputProps>(
  (
    {
      value,
      onChange,
      keyboardLabel,
      forceKeyboard,
      inputType = "text",
      className,
      ...props
    },
    ref
  ) => {
    const { kioskMode } = useKioskMode();
    const [kbOpen, setKbOpen] = React.useState(false);
    const useKb = forceKeyboard || kioskMode;

    const handleInteraction = (e: React.MouseEvent | React.FocusEvent) => {
      if (useKb) {
        e.preventDefault();
        (e.target as HTMLInputElement).blur();
        setKbOpen(true);
      }
    };

    const handleConfirm = (v: string) => {
      onChange(v);
    };

    return (
      <div className="relative">
        <Input
          ref={ref}
          value={value}
          onChange={useKb ? undefined : (e) => onChange(e.target.value)}
          readOnly={useKb}
          onClick={handleInteraction}
          onFocus={
            useKb
              ? (e) => {
                  e.preventDefault();
                  e.target.blur();
                  setKbOpen(true);
                }
              : undefined
          }
          className={cn(useKb && "cursor-pointer caret-transparent", className)}
          {...props}
        />
        {!useKb && (
          <button
            type="button"
            tabIndex={-1}
            onClick={() => setKbOpen(true)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5"
            aria-label="Abrir teclado en pantalla"
          >
            <Keyboard className="h-4 w-4" />
          </button>
        )}
        <OnScreenKeyboard
          open={kbOpen}
          onOpenChange={setKbOpen}
          value={value}
          onConfirm={handleConfirm}
          label={keyboardLabel}
          inputType={inputType}
        />
      </div>
    );
  }
);
KioskTextInput.displayName = "KioskTextInput";

export { KioskTextInput };
