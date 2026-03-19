import * as React from "react";
import { Check, ChevronsUpDown, X, Keyboard } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { OnScreenKeyboard } from "./on-screen-keyboard";
import { useKioskMode } from "@/hooks/use-kiosk-mode";

export interface SearchableSelectOption {
  value: string;
  label: string;
  searchTerms?: string; // extra text to search against (codes, NIT, etc.)
}

interface SearchableSelectProps {
  options: SearchableSelectOption[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  className?: string;
  triggerClassName?: string;
  disabled?: boolean;
  clearable?: boolean;
  /** Force on-screen keyboard regardless of kiosk mode */
  forceKeyboard?: boolean;
}

export const SearchableSelect = React.forwardRef<HTMLButtonElement, SearchableSelectProps>(function SearchableSelectInner({
  options,
  value,
  onValueChange,
  placeholder = "Seleccionar...",
  searchPlaceholder = "Buscar...",
  emptyMessage = "Sin resultados.",
  className,
  triggerClassName,
  disabled = false,
  clearable = false,
  forceKeyboard,
}, ref) {
  const [open, setOpen] = React.useState(false);
  const { kioskMode } = useKioskMode();
  const useKb = forceKeyboard || kioskMode;
  const [kbOpen, setKbOpen] = React.useState(false);
  const [kioskSearch, setKioskSearch] = React.useState("");

  const selectedOption = options.find((o) => o.value === value);

  // Reset kiosk search when popover closes
  React.useEffect(() => {
    if (!open) setKioskSearch("");
  }, [open]);

  // In kiosk mode, filter options client-side using kioskSearch
  const filteredOptions = React.useMemo(() => {
    if (!useKb || !kioskSearch.trim()) return options;
    const terms = kioskSearch.toLowerCase().trim().split(/\s+/);
    return options.filter((o) => {
      const haystack = `${o.label} ${o.searchTerms || ""}`.toLowerCase();
      return terms.every((t) => haystack.includes(t));
    });
  }, [options, kioskSearch, useKb]);

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            ref={ref}
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className={cn(
              "w-full justify-between font-normal",
              !value && "text-muted-foreground",
              triggerClassName,
            )}
          >
            <span className="truncate">
              {selectedOption ? selectedOption.label : placeholder}
            </span>
            <div className="ml-1 flex shrink-0 items-center gap-1">
              {clearable && value && (
                <X
                  className="h-3.5 w-3.5 opacity-50 hover:opacity-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    onValueChange("");
                  }}
                />
              )}
              <ChevronsUpDown className="h-3.5 w-3.5 opacity-50" />
            </div>
          </Button>
        </PopoverTrigger>
        <PopoverContent className={cn("w-[--radix-popover-trigger-width] p-0", className)} align="start">
          <Command
            filter={useKb ? undefined : (value, search) => {
              const option = options.find((o) => o.value === value);
              if (!option) return 0;
              const haystack = `${option.label} ${option.searchTerms || ""}`.toLowerCase();
              const terms = search.toLowerCase().split(/\s+/);
              return terms.every((t) => haystack.includes(t)) ? 1 : 0;
            }}
          >
            {useKb ? (
              <div className="flex items-center border-b px-3 gap-2">
                <button
                  type="button"
                  className="flex-1 flex items-center h-11 py-3 text-sm text-left cursor-pointer"
                  onClick={() => setKbOpen(true)}
                >
                  <span className={cn("truncate", !kioskSearch && "text-muted-foreground")}>
                    {kioskSearch || searchPlaceholder}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setKbOpen(true)}
                  className="text-muted-foreground hover:text-foreground p-1"
                  aria-label="Abrir teclado"
                >
                  <Keyboard className="h-4 w-4" />
                </button>
                {kioskSearch && (
                  <button
                    type="button"
                    onClick={() => setKioskSearch("")}
                    className="text-muted-foreground hover:text-foreground p-1"
                    aria-label="Limpiar búsqueda"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            ) : (
              <CommandInput placeholder={searchPlaceholder} />
            )}
            <CommandList>
              <CommandEmpty>{emptyMessage}</CommandEmpty>
              <CommandGroup>
                {filteredOptions.map((option) => (
                  <CommandItem
                    key={option.value}
                    value={option.value}
                    onSelect={(v) => {
                      onValueChange(v === value ? "" : v);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value === option.value ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <span className="truncate">{option.label}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {useKb && (
        <OnScreenKeyboard
          open={kbOpen}
          onOpenChange={setKbOpen}
          value={kioskSearch}
          onConfirm={(v) => setKioskSearch(v)}
          label="Buscar"
          inputType="search"
        />
      )}
    </>
  );
});
SearchableSelect.displayName = "SearchableSelect";
