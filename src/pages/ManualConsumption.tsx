import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useAudit } from "@/hooks/use-audit";
import { useRestaurantId } from "@/hooks/use-restaurant";
import { useToast } from "@/hooks/use-toast";
import { convertToProductUnit } from "@/lib/unit-conversion";
import { UnitSelector } from "@/components/UnitSelector";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { NumericKeypadInput } from "@/components/ui/numeric-keypad-input";
import { KioskTextInput } from "@/components/ui/kiosk-text-input";
import {
  ChevronLeft,
  CheckCircle2,
  History,
  CalendarDays,
  Droplets,
  Search,
  Plus,
  Package,
} from "lucide-react";

type Step = "product" | "confirm" | "history" | "manage";

export default function ManualConsumption() {
  const [step, setStep] = useState<Step>("product");
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState<number>(0);
  const [inputUnit, setInputUnit] = useState("");
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [search, setSearch] = useState("");
  const [newServiceName, setNewServiceName] = useState("");
  const [newServiceDesc, setNewServiceDesc] = useState("");
  const [manageOpen, setManageOpen] = useState(false);

  const { user } = useAuth();
  const { toast } = useToast();
  const { logAudit } = useAudit();
  const restaurantId = useRestaurantId();
  const qc = useQueryClient();

  // Products
  const { data: products } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, unit, current_stock, average_cost")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  // Operational services
  const { data: services } = useQuery({
    queryKey: ["operational-services"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("operational_services")
        .select("*")
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  // Recent history
  const { data: history } = useQuery({
    queryKey: ["manual-consumption-history"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_movements")
        .select("id, created_at, notes, quantity, total_cost, product_id, service_id")
        .eq("type", "operational_consumption")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });

  const productMap = new Map(products?.map((p) => [p.id, p]) ?? []);
  const serviceMap = new Map(services?.map((s) => [s.id, s]) ?? []);
  const selectedProduct = selectedProductId ? productMap.get(selectedProductId) : null;
  const selectedService = selectedServiceId ? serviceMap.get(selectedServiceId) : null;
  const effectiveUnit = inputUnit || selectedProduct?.unit || "unidad";
  const convertedQty = selectedProduct
    ? convertToProductUnit(quantity, effectiveUnit, selectedProduct.unit)
    : quantity;

  const estimatedCost = selectedProduct && convertedQty > 0
    ? convertedQty * Number(selectedProduct.average_cost)
    : 0;

  const hasStock = selectedProduct
    ? Number(selectedProduct.current_stock) >= convertedQty
    : false;

  const canConfirm =
    selectedProductId && quantity > 0 && selectedServiceId && hasStock;

  const filteredProducts = useMemo(() => {
    if (!products) return [];
    if (!search.trim()) return products;
    const q = search.toLowerCase();
    return products.filter((p) => p.name.toLowerCase().includes(q));
  }, [products, search]);

  // Mutations
  const confirmMutation = useMutation({
    mutationFn: async () => {
      const unitCost = Number(selectedProduct!.average_cost);
      const totalCost = convertedQty * unitCost;

      const { error } = await supabase.from("inventory_movements").insert({
        product_id: selectedProductId!,
        user_id: user!.id,
        type: "operational_consumption",
        quantity: convertedQty,
        unit_cost: unitCost,
        total_cost: totalCost,
        service_id: selectedServiceId!,
        notes: effectiveUnit !== selectedProduct?.unit
          ? `${notes.trim() || `Consumo operativo: ${selectedService?.name} — ${selectedProduct?.name}`} | ${quantity} ${effectiveUnit} → ${convertedQty.toFixed(4)} ${selectedProduct?.unit}`
          : notes.trim() || `Consumo operativo: ${selectedService?.name} — ${selectedProduct?.name} x${convertedQty} ${selectedProduct?.unit}`,
        restaurant_id: restaurantId!,
      } as any);
      if (error) throw error;

      await logAudit({
        entityType: "operational_consumption",
        entityId: selectedProductId!,
        action: "CREATE",
        after: {
          product_id: selectedProductId,
          product_name: selectedProduct?.name,
          quantity,
          unit: selectedProduct?.unit,
          service: selectedService?.name,
          total_cost: totalCost,
        },
        canRollback: false,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["movements"] });
      qc.invalidateQueries({ queryKey: ["manual-consumption-history"] });
      toast({
        title: "✅ Consumo registrado",
        description: `${selectedProduct?.name} — ${quantity} ${selectedProduct?.unit} — $${estimatedCost.toFixed(2)}`,
      });
      resetAll();
    },
    onError: (e: any) =>
      toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const createServiceMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("operational_services").insert({
        name: newServiceName.trim(),
        description: newServiceDesc.trim() || null,
        restaurant_id: restaurantId!,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["operational-services"] });
      setNewServiceName("");
      setNewServiceDesc("");
      toast({ title: "Servicio creado" });
    },
    onError: (e: any) =>
      toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const resetAll = () => {
    setStep("product");
    setSelectedProductId(null);
    setQuantity(0);
    setSelectedServiceId(null);
    setNotes("");
    setSearch("");
  };

  return (
    <AppLayout>
      <div className="mx-auto max-w-xl space-y-6">
        {/* Header */}
        <div className="text-center">
          <h1 className="font-heading text-3xl font-bold">Consumo Manual</h1>
          <p className="text-muted-foreground">
            Registro de químicos y consumibles sin receta
          </p>
        </div>

        {/* Step indicators */}
        <div className="flex items-center justify-center gap-2 text-sm">
          <Badge variant={step === "product" ? "default" : "secondary"}>
            1. Producto
          </Badge>
          <span className="text-muted-foreground">→</span>
          <Badge variant={step === "confirm" ? "default" : "secondary"}>
            2. Confirmar
          </Badge>
        </div>

        {/* Top actions */}
        {step === "product" && (
          <div className="flex justify-between gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setManageOpen(true)}
            >
              <Plus className="mr-1 h-3.5 w-3.5" /> Servicios
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setStep("history")}
            >
              <History className="mr-1 h-3.5 w-3.5" /> Historial
            </Button>
          </div>
        )}

        {/* ===== Step 1: Select product ===== */}
        {step === "product" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Droplets className="h-5 w-5 text-primary" /> Seleccionar
                producto
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <KioskTextInput
                  className="pl-10"
                  placeholder="Buscar producto..."
                  value={search}
                  onChange={setSearch}
                  keyboardLabel="Buscar producto"
                  inputType="search"
                />
              </div>
              <div className="max-h-[50vh] overflow-y-auto space-y-2">
                {filteredProducts.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    Sin resultados
                  </p>
                ) : (
                  filteredProducts.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => {
                        setSelectedProductId(p.id);
                        setQuantity(0);
                        setSelectedServiceId(null);
                        setNotes("");
                        setStep("confirm");
                      }}
                      className="w-full rounded-lg border-2 border-border p-4 text-left transition-all hover:shadow-md hover:border-primary active:scale-[0.99] focus:outline-none focus:ring-2 focus:ring-primary"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-heading font-bold">{p.name}</p>
                          <p className="text-xs text-muted-foreground">
                            Stock: {Number(p.current_stock).toFixed(2)}{" "}
                            {p.unit} · Costo: $
                            {Number(p.average_cost).toFixed(2)}/{p.unit}
                          </p>
                        </div>
                        <Package className="h-5 w-5 text-muted-foreground" />
                      </div>
                    </button>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* ===== Step 2: Quantity, Service, Confirm ===== */}
        {step === "confirm" && selectedProduct && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setStep("product");
                    setSelectedProductId(null);
                  }}
                >
                  <ChevronLeft className="h-5 w-5" />
                </Button>
                <CardTitle className="text-lg">
                  {selectedProduct.name}
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Quantity */}
              <div className="space-y-2">
                <Label>
                  Cantidad ({selectedProduct.unit}) *
                </Label>
                <NumericKeypadInput
                  mode="decimal"
                  value={quantity || ""}
                  onChange={(v) => setQuantity(Math.max(0, Number(v) || 0))}
                  min="0.001"
                  keypadLabel={`Cantidad en ${selectedProduct.unit}`}
                  className="text-center text-2xl font-bold h-14"
                />
                <p className="text-xs text-muted-foreground text-center">
                  Stock disponible:{" "}
                  {Number(selectedProduct.current_stock).toFixed(2)}{" "}
                  {selectedProduct.unit}
                </p>
              </div>

              {/* Service */}
              <div className="space-y-2">
                <Label>Servicio / Área *</Label>
                <Select
                  value={selectedServiceId ?? ""}
                  onValueChange={setSelectedServiceId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar servicio..." />
                  </SelectTrigger>
                  <SelectContent>
                    {services?.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {(!services || services.length === 0) && (
                  <p className="text-xs text-muted-foreground">
                    No hay servicios. Crea uno con el botón "Servicios".
                  </p>
                )}
              </div>

              {/* Notes */}
              <div className="space-y-2">
                <Label>Notas (opcional)</Label>
                <KioskTextInput
                  value={notes}
                  onChange={setNotes}
                  placeholder="Observaciones..."
                  keyboardLabel="Notas del consumo"
                />
              </div>

              {/* Summary */}
              <div className="rounded-md bg-muted p-4 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Producto</span>
                  <span className="font-medium">{selectedProduct.name}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Cantidad</span>
                  <span className="font-medium">
                    {quantity} {selectedProduct.unit}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Servicio</span>
                  <span className="font-medium">
                    {selectedService?.name ?? "—"}
                  </span>
                </div>
                <div className="border-t border-border pt-2 flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    Costo estimado
                  </span>
                  <span className="font-heading text-2xl font-bold">
                    ${estimatedCost.toFixed(2)}
                  </span>
                </div>
              </div>

              {!hasStock && quantity > 0 && (
                <p className="text-sm text-destructive text-center font-medium">
                  ⚠️ Stock insuficiente
                </p>
              )}

              {/* Actions */}
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    setStep("product");
                    setSelectedProductId(null);
                  }}
                >
                  Cancelar
                </Button>
                <Button
                  className="flex-1 h-14 text-lg"
                  disabled={!canConfirm || confirmMutation.isPending}
                  onClick={() => confirmMutation.mutate()}
                >
                  {confirmMutation.isPending ? (
                    "Registrando..."
                  ) : (
                    <span className="flex items-center gap-2">
                      <CheckCircle2 className="h-5 w-5" /> Confirmar
                    </span>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ===== History ===== */}
        {step === "history" && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setStep("product")}
                >
                  <ChevronLeft className="h-5 w-5" />
                </Button>
                <CardTitle className="text-lg flex items-center gap-2">
                  <History className="h-5 w-5 text-primary" /> Historial
                  reciente
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              {!history?.length ? (
                <p className="text-center text-muted-foreground py-8">
                  Sin registros recientes
                </p>
              ) : (
                <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                  {history.map((h) => {
                    const prod = productMap.get(h.product_id);
                    const svc = h.service_id
                      ? serviceMap.get(h.service_id)
                      : null;
                    return (
                      <div
                        key={h.id}
                        className="flex items-center gap-3 rounded-lg border p-3"
                      >
                        <Droplets className="h-5 w-5 text-primary shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">
                            {prod?.name ?? "—"} · {Number(h.quantity).toFixed(2)}{" "}
                            {prod?.unit}
                          </p>
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <CalendarDays className="h-3 w-3" />
                            {new Date(h.created_at).toLocaleString("es", {
                              day: "2-digit",
                              month: "short",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                            {svc && (
                              <Badge
                                variant="outline"
                                className="ml-1 text-[10px] py-0"
                              >
                                {svc.name}
                              </Badge>
                            )}
                          </p>
                        </div>
                        <span className="font-heading font-bold text-sm">
                          ${Number(h.total_cost).toFixed(2)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* ===== Manage Services Dialog ===== */}
        <Dialog open={manageOpen} onOpenChange={setManageOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="font-heading">
                Servicios operativos
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {/* Existing services */}
              {services && services.length > 0 && (
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {services.map((s) => (
                    <div
                      key={s.id}
                      className="flex items-center justify-between rounded border px-3 py-2 text-sm"
                    >
                      <span className="font-medium">{s.name}</span>
                      {s.description && (
                        <span className="text-xs text-muted-foreground truncate ml-2">
                          {s.description}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Add new */}
              <div className="border-t pt-3 space-y-2">
                <Label>Nuevo servicio</Label>
                <KioskTextInput
                  value={newServiceName}
                  onChange={setNewServiceName}
                  placeholder="Ej: Lavado de menaje"
                  keyboardLabel="Nombre del servicio"
                />
                <KioskTextInput
                  value={newServiceDesc}
                  onChange={setNewServiceDesc}
                  placeholder="Descripción (opcional)"
                  keyboardLabel="Descripción"
                />
                <Button
                  className="w-full"
                  disabled={
                    !newServiceName.trim() ||
                    createServiceMutation.isPending
                  }
                  onClick={() => createServiceMutation.mutate()}
                >
                  <Plus className="mr-1 h-4 w-4" />{" "}
                  {createServiceMutation.isPending
                    ? "Creando..."
                    : "Crear servicio"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
