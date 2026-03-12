import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useAudit } from "@/hooks/use-audit";
import { usePermissions } from "@/hooks/use-permissions";
import { useBackdate } from "@/hooks/use-backdate";
import { convertToProductUnit, getCompatibleUnits } from "@/lib/unit-conversion";
import { UnitSelector } from "@/components/UnitSelector";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Plus, ArrowDownCircle, ArrowUpCircle, Settings2, Trash2, Search, CalendarIcon } from "lucide-react";
import BulkUploadDialog from "@/components/BulkUploadDialog";
import { NumericKeypadInput } from "@/components/ui/numeric-keypad-input";
import { useRestaurantId } from "@/hooks/use-restaurant";
import { KioskTextInput } from "@/components/ui/kiosk-text-input";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { PaginationControls } from "@/components/ui/pagination-controls";

export default function Movements() {
  const [open, setOpen] = useState(false);
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [inputUnit, setInputUnit] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [notes, setNotes] = useState("");
  const [search, setSearch] = useState("");
  const [productPopoverOpen, setProductPopoverOpen] = useState(false);
  const [movementDate, setMovementDate] = useState<Date | undefined>(undefined);
  const [movementTime, setMovementTime] = useState("12:00");
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const { user, hasRole } = useAuth();
  const { logAudit } = useAudit();
  const { hasPermission } = usePermissions();
  const { backdatingAllowed, maxDays } = useBackdate();
  const restaurantId = useRestaurantId();
  const canCreate = hasPermission("movements_create");
  const canDelete = hasPermission("movements_delete");

  const allowedTypes = hasRole("admin")
    ? ["entrada", "salida", "ajuste"]
    : hasRole("bodega")
    ? ["entrada", "salida", "ajuste"]
    : ["salida"];

  const [type, setType] = useState<string>(allowedTypes[0]);
  const { toast } = useToast();
  const qc = useQueryClient();

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const { data: movementCount } = useQuery({
    queryKey: ["movements-count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("inventory_movements")
        .select("id", { count: "exact", head: true });
      if (error) throw error;
      return count ?? 0;
    },
  });

  const totalCount = movementCount ?? 0;

  const { data: movements, isLoading } = useQuery({
    queryKey: ["movements", page, pageSize],
    queryFn: async () => {
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      const { data, error } = await supabase
        .from("inventory_movements")
        .select("*, products(name, unit)")
        .order("created_at", { ascending: false })
        .range(from, to);
      if (error) throw error;
      return data;
    },
  });

  const { data: profiles } = useQuery({
    queryKey: ["all-profiles"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("user_id, full_name");
      return data ?? [];
    },
  });

  const profileMap = new Map(profiles?.map((p) => [p.user_id, p.full_name]) ?? []);

  const { data: products } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("id, name, unit, average_cost, barcode").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: productCodes } = useQuery({
    queryKey: ["product-codes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("product_codes").select("*");
      if (error) throw error;
      return data;
    },
  });

  const selectedProduct = products?.find((p) => p.id === productId);
  const effectiveUnit = inputUnit || selectedProduct?.unit || "unidad";
  const convertedQty = selectedProduct
    ? convertToProductUnit(Number(quantity) || 0, effectiveUnit, selectedProduct.unit)
    : Number(quantity) || 0;
  const computedTotal = convertedQty * (Number(unitCost) || 0);

  const isBackdating = backdatingAllowed && movementDate != null;

  const buildMovementDate = (): string | undefined => {
    if (!movementDate) return undefined;
    const [h, m] = movementTime.split(":").map(Number);
    const d = new Date(movementDate);
    d.setHours(h || 0, m || 0, 0, 0);
    return d.toISOString();
  };

  const addMovement = useMutation({
    mutationFn: async () => {
      const uc = Number(unitCost) || 0;
      const rawQty = Number(quantity);
      const prod = products?.find((p) => p.id === productId);
      const qty = prod ? convertToProductUnit(rawQty, effectiveUnit, prod.unit) : rawQty;
      const mDate = buildMovementDate();

      // Validate backdating notes
      if (mDate && (!notes || notes.trim() === "")) {
        throw new Error("Se requiere un motivo obligatorio al registrar con fecha anterior");
      }

      const insertData: any = {
        product_id: productId,
        user_id: user!.id,
        type,
        quantity: qty,
        unit_cost: uc,
        total_cost: qty * uc,
        notes: effectiveUnit !== prod?.unit
          ? `${notes ? notes + " | " : ""}Ingresado: ${rawQty} ${effectiveUnit} → ${qty.toFixed(4)} ${prod?.unit}`
          : notes,
        restaurant_id: restaurantId!,
      };
      if (mDate) insertData.movement_date = mDate;

      const { data: mov, error } = await supabase
        .from("inventory_movements")
        .insert(insertData)
        .select("id")
        .single();
      if (error) throw error;

      // Audit backdated movements and adjustments
      if (mDate || type === "ajuste") {
        await logAudit({
          entityType: "inventory_movement",
          entityId: mov.id,
          action: mDate ? "BACKDATED_MOVEMENT" : "CREATE",
          after: { product_id: productId, type, quantity: qty, unit_cost: uc, notes, movement_date: mDate },
          canRollback: type === "ajuste",
          metadata: mDate ? { movement_date: mDate, created_at: new Date().toISOString(), motivo: notes } : undefined,
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["movements"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      setOpen(false);
      resetForm();
      toast({ title: "Movimiento registrado" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const resetForm = () => {
    setProductId("");
    setType(allowedTypes[0]);
    setQuantity("");
    setInputUnit("");
    setUnitCost("");
    setNotes("");
    setMovementDate(undefined);
    setMovementTime("12:00");
  };

  const handleProductChange = (id: string) => {
    setProductId(id);
    const prod = products?.find((p) => p.id === id);
    if (prod) {
      setUnitCost(String(prod.average_cost));
      setInputUnit(prod.unit); // default to product's base unit
    }
    setProductPopoverOpen(false);
    setTimeout(() => {
      const qtyInput = document.querySelector<HTMLInputElement>('[data-mov-qty-input]');
      qtyInput?.focus();
      qtyInput?.click();
    }, 50);
  };

  const typeIcon = (t: string) => {
    if (t === "entrada") return <ArrowDownCircle className="h-4 w-4 text-success" />;
    if (t === "salida") return <ArrowUpCircle className="h-4 w-4 text-warning" />;
    return <Settings2 className="h-4 w-4 text-muted-foreground" />;
  };

  const typeBadge = (t: string) => {
    if (t === "entrada") return <Badge className="bg-success text-success-foreground">Entrada</Badge>;
    if (t === "salida") return <Badge className="bg-warning text-warning-foreground">Salida</Badge>;
    return <Badge variant="secondary">Ajuste</Badge>;
  };

  const deleteMovement = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("inventory_movements").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["movements"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      toast({ title: "Movimiento eliminado" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const isValid = productId && Number(quantity) > 0 && (!isBackdating || (notes && notes.trim().length > 0));

  const minDate = new Date();
  minDate.setDate(minDate.getDate() - maxDays);

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-heading text-3xl font-bold">Movimientos</h1>
            <p className="text-muted-foreground">
              {hasRole("cocina") ? "Registro de consumos" : "Registro de entradas, salidas y ajustes"}
            </p>
          </div>
          {canCreate && (
          <div className="flex items-center gap-2">
            {allowedTypes.includes("entrada") && <BulkUploadDialog products={products} />}
            <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
              <DialogTrigger asChild>
                <Button><Plus className="mr-2 h-4 w-4" /> Nuevo Movimiento</Button>
              </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="font-heading">Registrar Movimiento</DialogTitle>
              </DialogHeader>
              <form onSubmit={(e) => { e.preventDefault(); if (isValid) addMovement.mutate(); }} className="space-y-4">
                <div className="space-y-2">
                  <Label>Producto *</Label>
                  <Popover open={productPopoverOpen} onOpenChange={setProductPopoverOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                        {productId ? products?.find((p) => p.id === productId)?.name ?? "Seleccionar..." : "Seleccionar producto..."}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                      <Command>
                        <CommandInput placeholder="Buscar por nombre o código..." onValueChange={(val) => {
                          const q = val.trim().toLowerCase();
                          if (q) {
                            const byBarcode = products?.find((p) => p.barcode?.toLowerCase() === q);
                            if (byBarcode) { handleProductChange(byBarcode.id); return; }
                            const byCode = productCodes?.find((c) => c.code.toLowerCase() === q);
                            if (byCode) { handleProductChange(byCode.product_id); return; }
                          }
                        }} />
                        <CommandList>
                          <CommandEmpty>No se encontró producto.</CommandEmpty>
                          <CommandGroup>
                            {products?.map((p) => {
                              const pCodes = productCodes?.filter((c) => c.product_id === p.id);
                              const codesStr = pCodes?.map((c) => c.code).join(", ");
                              return (
                                <CommandItem key={p.id} value={`${p.name} ${p.barcode ?? ""} ${codesStr ?? ""}`} onSelect={() => handleProductChange(p.id)}>
                                  <Check className={cn("mr-2 h-4 w-4", productId === p.id ? "opacity-100" : "opacity-0")} />
                                  {p.name} ({p.unit})
                                  {codesStr && <span className="ml-2 text-xs text-muted-foreground">[{codesStr}]</span>}
                                </CommandItem>
                              );
                            })}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="space-y-2">
                  <Label>Tipo</Label>
                  <Select value={type} onValueChange={setType}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {allowedTypes.includes("entrada") && <SelectItem value="entrada">Entrada</SelectItem>}
                      {allowedTypes.includes("salida") && <SelectItem value="salida">Salida</SelectItem>}
                      {allowedTypes.includes("ajuste") && <SelectItem value="ajuste">Ajuste</SelectItem>}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Cantidad *</Label>
                    <NumericKeypadInput mode="decimal" value={quantity} onChange={setQuantity} min="0.001" required keypadLabel="Cantidad" data-mov-qty-input />
                  </div>
                  <div className="space-y-2">
                    <Label>Unidad</Label>
                    {selectedProduct ? (
                      <UnitSelector productUnit={selectedProduct.unit} value={effectiveUnit} onChange={setInputUnit} />
                    ) : (
                      <p className="h-10 flex items-center text-sm text-muted-foreground">—</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label>Costo Unitario ({selectedProduct?.unit ?? ""})</Label>
                    <NumericKeypadInput mode="decimal" value={unitCost} onChange={setUnitCost} min="0" keypadLabel="Costo unitario" quickButtons={[1, 5, 10]} />
                  </div>
                </div>
                {effectiveUnit !== selectedProduct?.unit && Number(quantity) > 0 && (
                  <div className="rounded-md bg-accent/50 p-2 text-xs text-muted-foreground">
                    {quantity} {effectiveUnit} = <span className="font-semibold">{convertedQty.toFixed(4)} {selectedProduct?.unit}</span>
                  </div>
                )}
                {computedTotal > 0 && (
                  <div className="rounded-md bg-muted p-3 text-sm">
                    <span className="text-muted-foreground">Costo total:</span>{" "}
                    <span className="font-semibold">${computedTotal.toFixed(2)}</span>
                  </div>
                )}

                {/* Backdating date picker - only shown when allowed */}
                {backdatingAllowed && (
                  <div className="space-y-2 rounded-md border border-dashed border-warning p-3">
                    <div className="flex items-center gap-2 text-sm font-medium text-warning">
                      <CalendarIcon className="h-4 w-4" />
                      Fecha del movimiento (modo inicialización)
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className="w-full justify-start text-left font-normal">
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {movementDate ? format(movementDate, "dd/MM/yyyy", { locale: es }) : "Hoy (actual)"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={movementDate}
                            onSelect={(d) => { setMovementDate(d); setDatePickerOpen(false); }}
                            disabled={(date) => date > new Date() || date < minDate}
                            initialFocus
                          />
                          {movementDate && (
                            <div className="border-t p-2">
                              <Button variant="ghost" size="sm" className="w-full" onClick={() => { setMovementDate(undefined); setDatePickerOpen(false); }}>
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
                        Se registrará con fecha efectiva: {format(movementDate, "dd MMM yyyy", { locale: es })} {movementTime}h.
                        El motivo es obligatorio.
                      </p>
                    )}
                  </div>
                )}

                <div className="space-y-2">
                  <Label>{isBackdating ? "Motivo / Notas *" : "Notas (opcional)"}</Label>
                  <KioskTextInput
                    value={notes}
                    onChange={setNotes}
                    placeholder={isBackdating ? "Motivo obligatorio para registro con fecha anterior..." : "Observaciones..."}
                    keyboardLabel="Notas del movimiento"
                    required={isBackdating}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={addMovement.isPending || !isValid}>
                  {addMovement.isPending ? "Registrando..." : isBackdating ? "Registrar con fecha anterior" : "Registrar"}
                </Button>
              </form>
            </DialogContent>
            </Dialog>
          </div>
          )}
        </div>

        <Card>
          <CardContent className="p-0">
            <div className="p-4 pb-0">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <KioskTextInput className="pl-10" placeholder="Buscar por producto..." value={search} onChange={setSearch} keyboardLabel="Buscar movimiento" inputType="search" />
              </div>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Producto</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Cantidad</TableHead>
                  <TableHead>Costo Unit.</TableHead>
                  <TableHead>Costo Total</TableHead>
                  <TableHead>Usuario</TableHead>
                  <TableHead>Fecha Efectiva</TableHead>
                  <TableHead>Registrado</TableHead>
                  {canDelete && <TableHead className="w-12"></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Cargando...</TableCell></TableRow>
                ) : !movements?.length ? (
                  <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Sin movimientos</TableCell></TableRow>
                ) : (
                  movements
                    .filter((m) => fuzzyMatch((m as any).products?.name || "", search))
                    .map((m) => {
                      const mDate = (m as any).movement_date;
                      const isBackdated = mDate && Math.abs(new Date(mDate).getTime() - new Date(m.created_at).getTime()) > 60000;
                      return (
                        <TableRow key={m.id}>
                          <TableCell className="font-medium flex items-center gap-2">
                            {typeIcon(m.type)}
                            {(m as any).products?.name}
                          </TableCell>
                          <TableCell>{typeBadge(m.type)}</TableCell>
                          <TableCell className="font-semibold">{Number(m.quantity)}</TableCell>
                          <TableCell>${Number(m.unit_cost).toFixed(2)}</TableCell>
                          <TableCell className="font-semibold">${Number(m.total_cost).toFixed(2)}</TableCell>
                          <TableCell className="text-muted-foreground">{profileMap.get(m.user_id) || "—"}</TableCell>
                          <TableCell className="text-sm">
                            <span className={isBackdated ? "text-warning font-medium" : "text-muted-foreground"}>
                              {format(new Date(mDate || m.created_at), "dd MMM yyyy, HH:mm", { locale: es })}
                            </span>
                            {isBackdated && <Badge variant="outline" className="ml-1 text-xs">Retroactivo</Badge>}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-xs">
                            {format(new Date(m.created_at), "dd MMM, HH:mm", { locale: es })}
                          </TableCell>
                          {canDelete && (
                            <TableCell>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => deleteMovement.mutate(m.id)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    })
                )}
              </TableBody>
            </Table>
            <PaginationControls
              page={page}
              pageSize={pageSize}
              totalCount={totalCount}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
            />
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
