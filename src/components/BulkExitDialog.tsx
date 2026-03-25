import { useState, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useRestaurantId } from "@/hooks/use-restaurant";
import { useAudit } from "@/hooks/use-audit";
import { useBackdate } from "@/hooks/use-backdate";
import { useToast } from "@/hooks/use-toast";
import { convertToProductUnit } from "@/lib/unit-conversion";
import { UnitSelector } from "@/components/UnitSelector";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { NumericKeypadInput } from "@/components/ui/numeric-keypad-input";
import { KioskTextInput } from "@/components/ui/kiosk-text-input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { CalendarIcon, Plus, Trash2, PackageMinus, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { formatCOP } from "@/lib/utils";

interface BulkExitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  products: any[];
}

interface ExitLine {
  id: string;
  productId: string;
  quantity: string;
  unit: string;
}

let lineCounter = 0;
const newLine = (): ExitLine => ({
  id: `bel-${++lineCounter}`,
  productId: "",
  quantity: "",
  unit: "",
});

export function BulkExitDialog({ open, onOpenChange, products }: BulkExitDialogProps) {
  const [lines, setLines] = useState<ExitLine[]>([newLine()]);
  const [movementDate, setMovementDate] = useState<Date | undefined>(undefined);
  const [movementTime, setMovementTime] = useState("12:00");
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const { user } = useAuth();
  const restaurantId = useRestaurantId();
  const { logAudit } = useAudit();
  const { backdatingAllowed, maxDays } = useBackdate();
  const { toast } = useToast();
  const qc = useQueryClient();

  const minDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - maxDays);
    return d;
  }, [maxDays]);

  const productMap = useMemo(
    () => Object.fromEntries((products ?? []).map((p: any) => [p.id, p])),
    [products]
  );

  const productOptions = useMemo(
    () =>
      (products ?? []).map((p: any) => ({
        value: p.id,
        label: `${p.name} (${p.unit})`,
        searchTerms: p.name,
      })),
    [products]
  );

  const addLine = () => setLines((prev) => [...prev, newLine()]);

  const removeLine = (id: string) =>
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((l) => l.id !== id)));

  const updateLine = (id: string, field: keyof ExitLine, value: string) =>
    setLines((prev) =>
      prev.map((l) => {
        if (l.id !== id) return l;
        const updated = { ...l, [field]: value };
        if (field === "productId") {
          const prod = productMap[value];
          updated.unit = prod?.unit ?? "";
        }
        return updated;
      })
    );

  const validLines = lines.filter((l) => l.productId && parseFloat(l.quantity) > 0);
  const isBackdating = movementDate != null;
  const needsReason = backdatingAllowed && isBackdating;
  const isValid =
    validLines.length > 0 && (!needsReason || (notes && notes.trim().length > 0));

  const totalCost = validLines.reduce((sum, l) => {
    const prod = productMap[l.productId];
    const qty = parseFloat(l.quantity) || 0;
    const uc = prod ? Number(prod.average_cost ?? 0) : 0;
    const baseQty = prod ? convertToProductUnit(qty, l.unit || prod.unit, prod.unit) : qty;
    return sum + baseQty * uc;
  }, 0);

  const buildMovementDate = (): string | undefined => {
    if (!movementDate) return undefined;
    const [h, m] = movementTime.split(":").map(Number);
    const d = new Date(movementDate);
    d.setHours(h || 0, m || 0, 0, 0);
    return d.toISOString();
  };

  const resetForm = () => {
    setLines([newLine()]);
    setMovementDate(undefined);
    setMovementTime("12:00");
    setNotes("");
  };

  const submitBulk = useMutation({
    mutationFn: async () => {
      if (!user || !restaurantId) throw new Error("Sin sesión");
      const mDate = buildMovementDate();

      if (needsReason && (!notes || notes.trim() === "")) {
        throw new Error("Se requiere un motivo obligatorio al registrar con fecha anterior");
      }

      for (const line of validLines) {
        const prod = productMap[line.productId];
        if (!prod) continue;
        const rawQty = parseFloat(line.quantity);
        const lineUnit = line.unit || prod.unit;
        const baseQty = convertToProductUnit(rawQty, lineUnit, prod.unit);
        const uc = Number(prod.average_cost ?? 0);

        const insertData: any = {
          product_id: line.productId,
          user_id: user.id,
          type: "salida",
          quantity: baseQty,
          unit_cost: uc,
          total_cost: baseQty * uc,
          notes: notes || "Salida masiva",
          restaurant_id: restaurantId,
          source_module: "bulk_exit",
        };
        if (mDate) insertData.movement_date = mDate;

        const { data: mov, error } = await supabase
          .from("inventory_movements")
          .insert(insertData)
          .select("id")
          .single();
        if (error) throw error;

        if (mDate) {
          await logAudit({
            entityType: "inventory_movement",
            entityId: mov.id,
            action: "BACKDATED_MOVEMENT",
            after: {
              product_id: line.productId,
              type: "salida",
              quantity: baseQty,
              input_unit: lineUnit,
              input_quantity: rawQty,
              unit_cost: uc,
              notes,
              movement_date: mDate,
            },
            metadata: {
              movement_date: mDate,
              created_at: new Date().toISOString(),
              motivo: notes,
              source: "bulk_exit",
            },
          });
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["movements"] });
      qc.invalidateQueries({ queryKey: ["movements-count"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      toast({
        title: "Salidas registradas",
        description: `${validLines.length} producto(s) — Total: {formatCOP(totalCost, 2)}`,
      });
      resetForm();
      onOpenChange(false);
    },
    onError: (e: any) =>
      toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) resetForm();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading flex items-center gap-2">
            <PackageMinus className="h-5 w-5 text-warning" />
            Salidas Masivas
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Date picker — always visible */}
          <Card className="border-dashed border-warning">
            <CardContent className="pt-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-warning">
                <CalendarIcon className="h-4 w-4" />
                Fecha de las salidas
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-start text-left font-normal"
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {movementDate
                        ? format(movementDate, "dd/MM/yyyy", { locale: es })
                        : "Hoy (actual)"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={movementDate}
                      onSelect={(d) => {
                        setMovementDate(d);
                        setDatePickerOpen(false);
                      }}
                      disabled={(date) =>
                        date > new Date() || (backdatingAllowed ? date < minDate : false)
                      }
                      initialFocus
                      className="p-3 pointer-events-auto"
                    />
                    {movementDate && (
                      <div className="border-t p-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-full"
                          onClick={() => {
                            setMovementDate(undefined);
                            setDatePickerOpen(false);
                          }}
                        >
                          Usar fecha actual
                        </Button>
                      </div>
                    )}
                  </PopoverContent>
                </Popover>
                <Input
                  type="time"
                  value={movementTime}
                  onChange={(e) => setMovementTime(e.target.value)}
                  disabled={!movementDate}
                />
              </div>
              {movementDate && (
                <p className="text-xs text-muted-foreground">
                  Se registrará con fecha efectiva:{" "}
                  {format(movementDate, "dd MMM yyyy", { locale: es })} {movementTime}h
                </p>
              )}
            </CardContent>
          </Card>

          {/* Product lines */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Productos</Label>
            <div className="space-y-2">
              {lines.map((line, idx) => {
                const prod = productMap[line.productId];
                const qty = parseFloat(line.quantity) || 0;
                const lineUnit = line.unit || (prod?.unit ?? "");
                const baseQty = prod ? convertToProductUnit(qty, lineUnit, prod.unit) : qty;
                const stock = prod ? Number(prod.current_stock ?? 0) : 0;
                const insuf = prod && baseQty > stock;

                return (
                  <div key={line.id} className="grid grid-cols-12 gap-2 items-end">
                    <div className="col-span-5">
                      {idx === 0 && (
                        <Label className="text-xs text-muted-foreground">Producto</Label>
                      )}
                      <SearchableSelect
                        options={productOptions}
                        value={line.productId}
                        onValueChange={(v) => updateLine(line.id, "productId", v)}
                        placeholder="Seleccionar..."
                        searchPlaceholder="Buscar producto..."
                      />
                    </div>
                    <div className="col-span-2">
                      {idx === 0 && (
                        <Label className="text-xs text-muted-foreground">Cantidad</Label>
                      )}
                      <NumericKeypadInput
                        mode="decimal"
                        value={line.quantity}
                        onChange={(v) => updateLine(line.id, "quantity", v)}
                        placeholder="0"
                        keypadLabel={prod ? `${prod.name}` : "Cantidad"}
                        forceKeypad
                      />
                    </div>
                    <div className="col-span-2">
                      {idx === 0 && (
                        <Label className="text-xs text-muted-foreground">Unidad</Label>
                      )}
                      {prod ? (
                        <UnitSelector
                          productUnit={prod.unit}
                          value={lineUnit}
                          onChange={(u) => updateLine(line.id, "unit", u)}
                        />
                      ) : (
                        <p className="h-10 flex items-center text-sm text-muted-foreground">—</p>
                      )}
                    </div>
                    <div className="col-span-2 text-xs text-muted-foreground flex items-center gap-1 h-10">
                      {prod && (
                        <span>
                          {stock} {prod.unit}
                          {insuf && (
                            <Badge variant="destructive" className="ml-1 text-[10px] px-1 h-4">
                              Insuf.
                            </Badge>
                          )}
                        </span>
                      )}
                    </div>
                    <div className="col-span-1 flex items-center h-10">
                      {lines.length > 1 && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => removeLine(line.id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <Button variant="outline" size="sm" onClick={addLine} type="button">
              <Plus className="h-4 w-4 mr-1" /> Agregar producto
            </Button>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label>{needsReason ? "Motivo / Notas *" : "Notas (opcional)"}</Label>
            <KioskTextInput
              value={notes}
              onChange={setNotes}
              placeholder={
                needsReason
                  ? "Motivo obligatorio para registro con fecha anterior..."
                  : "Observaciones de las salidas..."
              }
              keyboardLabel="Notas de salida"
              required={needsReason}
            />
          </div>

          {/* Summary */}
          {validLines.length > 0 && (
            <Card>
              <CardContent className="pt-4 space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Productos</span>
                  <span className="font-semibold">{validLines.length}</span>
                </div>
                <div className="flex justify-between text-sm font-semibold">
                  <span>Costo total estimado</span>
                  <span>{formatCOP(totalCost, 2)}</span>
                </div>
                {isBackdating && movementDate && (
                  <div className="flex justify-between text-xs text-warning">
                    <span>Fecha efectiva</span>
                    <span>
                      {format(movementDate, "dd MMM yyyy", { locale: es })} {movementTime}h
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Submit */}
          <Button
            className="w-full h-12 text-base"
            disabled={!isValid || submitBulk.isPending}
            onClick={() => submitBulk.mutate()}
          >
            {submitBulk.isPending ? (
              "Registrando..."
            ) : (
              <>
                <CheckCircle2 className="mr-2 h-5 w-5" />
                Confirmar {validLines.length} Salida{validLines.length !== 1 ? "s" : ""}
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
