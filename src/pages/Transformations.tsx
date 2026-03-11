import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurantId } from "@/hooks/use-restaurant";
import { useAuth } from "@/lib/auth";
import { useAudit } from "@/hooks/use-audit";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { Plus, FlaskConical, History, Percent, ArrowRight, Trash2, PackagePlus } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

/* ─── Types ─── */
interface OutputLine {
  id: string;
  productId: string;
  outputType: "output" | "byproduct" | "waste";
  quantity: string;
  expectedYield: string;
}

const OUTPUT_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  output: { label: "Producto", color: "default" },
  byproduct: { label: "Subproducto", color: "secondary" },
  waste: { label: "Merma", color: "destructive" },
};

let lineIdCounter = 0;
const newLine = (): OutputLine => ({
  id: `line-${++lineIdCounter}`,
  productId: "",
  outputType: "output",
  quantity: "",
  expectedYield: "",
});

/* ─── Page ─── */
export default function Transformations() {
  const restaurantId = useRestaurantId();
  const { user } = useAuth();
  const { logAudit } = useAudit();
  const qc = useQueryClient();

  const [tab, setTab] = useState("register");

  /* ── Queries ── */
  const { data: products = [] } = useQuery({
    queryKey: ["products", restaurantId],
    queryFn: async () => {
      const { data } = await supabase
        .from("products")
        .select("id, name, unit, current_stock, average_cost, last_unit_cost")
        .order("name");
      return data ?? [];
    },
    enabled: !!restaurantId,
  });

  const { data: definitions = [], isLoading: defsLoading } = useQuery({
    queryKey: ["transformation_definitions", restaurantId],
    queryFn: async () => {
      const { data } = await supabase
        .from("transformation_definitions" as any)
        .select("*, transformation_definition_outputs(*)")
        .eq("restaurant_id", restaurantId!)
        .eq("active", true)
        .order("name");
      return (data ?? []) as any[];
    },
    enabled: !!restaurantId,
  });

  const { data: runs = [] } = useQuery({
    queryKey: ["transformation_runs", restaurantId],
    queryFn: async () => {
      const { data } = await supabase
        .from("transformation_runs" as any)
        .select("*, transformation_run_outputs(*)")
        .eq("restaurant_id", restaurantId!)
        .order("run_date", { ascending: false })
        .limit(100);
      return (data ?? []) as any[];
    },
    enabled: !!restaurantId,
  });

  const pMap = useMemo(() => Object.fromEntries(products.map((p) => [p.id, p])), [products]);

  /* ══════════════════════════════════════════
     DEFINITION DIALOG
     ══════════════════════════════════════════ */
  const [defOpen, setDefOpen] = useState(false);
  const [defName, setDefName] = useState("");
  const [defInputId, setDefInputId] = useState("");
  const [defOutputs, setDefOutputs] = useState<OutputLine[]>([newLine()]);

  const resetDefForm = () => {
    setDefName("");
    setDefInputId("");
    setDefOutputs([newLine()]);
  };

  const addDefOutput = () => setDefOutputs((prev) => [...prev, newLine()]);
  const removeDefOutput = (id: string) => setDefOutputs((prev) => prev.filter((l) => l.id !== id));
  const updateDefOutput = (id: string, field: keyof OutputLine, value: string) =>
    setDefOutputs((prev) => prev.map((l) => (l.id === id ? { ...l, [field]: value } : l)));

  const createDef = useMutation({
    mutationFn: async () => {
      const validOutputs = defOutputs.filter((o) => o.productId);
      if (!validOutputs.length) throw new Error("Agrega al menos un producto de salida");

      const { data: def, error: e1 } = await supabase
        .from("transformation_definitions" as any)
        .insert({ restaurant_id: restaurantId, name: defName.trim(), input_product_id: defInputId } as any)
        .select("id")
        .single();
      if (e1) throw e1;

      const outputs = validOutputs.map((o) => ({
        transformation_definition_id: (def as any).id,
        output_product_id: o.productId,
        output_type: o.outputType,
        expected_yield_percent: o.expectedYield ? parseFloat(o.expectedYield) : null,
      }));
      const { error: e2 } = await supabase.from("transformation_definition_outputs" as any).insert(outputs as any);
      if (e2) throw e2;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["transformation_definitions"] });
      setDefOpen(false);
      resetDefForm();
      toast({ title: "Proceso creado correctamente" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  /* ══════════════════════════════════════════
     EXECUTION FORM
     ══════════════════════════════════════════ */
  const [selDefId, setSelDefId] = useState("");
  const [execInputId, setExecInputId] = useState("");
  const [execInputQty, setExecInputQty] = useState("");
  const [execOutputs, setExecOutputs] = useState<OutputLine[]>([newLine()]);
  const [execNotes, setExecNotes] = useState("");

  const addExecOutput = () => setExecOutputs((prev) => [...prev, newLine()]);
  const removeExecOutput = (id: string) => setExecOutputs((prev) => prev.filter((l) => l.id !== id));
  const updateExecOutput = (id: string, field: keyof OutputLine, value: string) =>
    setExecOutputs((prev) => prev.map((l) => (l.id === id ? { ...l, [field]: value } : l)));

  const resetExecForm = () => {
    setSelDefId("");
    setExecInputId("");
    setExecInputQty("");
    setExecOutputs([newLine()]);
    setExecNotes("");
  };

  const handleDefSelect = (defId: string) => {
    setSelDefId(defId);
    const def = definitions.find((d: any) => d.id === defId);
    if (!def) return;
    setExecInputId(def.input_product_id);
    const outs = (def.transformation_definition_outputs || []).map((o: any) => ({
      id: `line-${++lineIdCounter}`,
      productId: o.output_product_id,
      outputType: o.output_type,
      quantity: "",
      expectedYield: o.expected_yield_percent?.toString() || "",
    }));
    setExecOutputs(outs.length ? outs : [newLine()]);
  };

  // Totals
  const totalOutputQty = execOutputs.reduce((s, o) => {
    const q = parseFloat(o.quantity) || 0;
    return o.outputType !== "waste" ? s + q : s;
  }, 0);
  const totalWasteQty = execOutputs.reduce((s, o) => {
    const q = parseFloat(o.quantity) || 0;
    return o.outputType === "waste" ? s + q : s;
  }, 0);
  const totalAllOutputs = totalOutputQty + totalWasteQty;
  const inputQtyNum = parseFloat(execInputQty) || 0;
  const impliedWaste = Math.max(0, inputQtyNum - totalAllOutputs);
  const overallYield = inputQtyNum > 0 ? ((totalOutputQty / inputQtyNum) * 100).toFixed(1) : "0";
  const overTotal = totalAllOutputs > inputQtyNum && inputQtyNum > 0;

  const execTransformation = useMutation({
    mutationFn: async () => {
      if (!user || !restaurantId) throw new Error("Sin sesión");
      if (inputQtyNum <= 0) throw new Error("Cantidad de entrada inválida");
      const validOutputs = execOutputs.filter((o) => o.productId && parseFloat(o.quantity) > 0);
      if (!validOutputs.length) throw new Error("Agrega al menos una salida con cantidad");
      if (overTotal) throw new Error("La suma de salidas supera la cantidad de entrada");

      const inputProduct = pMap[execInputId];
      if (!inputProduct) throw new Error("Producto de entrada no encontrado");
      if (inputQtyNum > inputProduct.current_stock) {
        throw new Error(`Stock insuficiente de ${inputProduct.name}. Disponible: ${inputProduct.current_stock} ${inputProduct.unit}`);
      }

      const unitCostInput = inputProduct.average_cost > 0 ? inputProduct.average_cost : (inputProduct.last_unit_cost || 0);
      const totalCostInput = inputQtyNum * unitCostInput;

      // 1. SALIDA del producto de entrada
      const { error: e1 } = await supabase.from("inventory_movements").insert({
        restaurant_id: restaurantId,
        product_id: execInputId,
        user_id: user.id,
        type: "salida",
        quantity: inputQtyNum,
        unit_cost: unitCostInput,
        total_cost: totalCostInput,
        notes: `Transformación: ${pMap[execInputId]?.name}`,
      });
      if (e1) throw e1;

      // 2. ENTRADA / MERMA para cada output
      for (const out of validOutputs) {
        const qty = Math.abs(parseFloat(out.quantity));
        const outProduct = pMap[out.productId];
        const movType = out.outputType === "waste" ? "merma" : "entrada";
        const outUnitCost = out.outputType === "waste" ? 0 : (totalOutputQty > 0 ? (totalCostInput * (qty / totalOutputQty)) / qty : 0);
        const outTotal = out.outputType === "waste" ? 0 : (totalOutputQty > 0 ? totalCostInput * (qty / totalOutputQty) : 0);

        const { error } = await supabase.from("inventory_movements").insert({
          restaurant_id: restaurantId,
          product_id: out.productId,
          user_id: user.id,
          type: movType,
          quantity: qty,
          unit_cost: outUnitCost,
          total_cost: outTotal,
          notes: `Transformación de ${inputProduct.name} → ${outProduct?.name || ""}`,
        });
        if (error) throw error;
      }

      // 3. Log run
      const yieldPct = inputQtyNum > 0 ? (totalOutputQty / inputQtyNum) * 100 : 0;
      const { data: run, error: e3 } = await supabase.from("transformation_runs" as any).insert({
        restaurant_id: restaurantId,
        transformation_definition_id: selDefId || null,
        input_product_id: execInputId,
        input_quantity: inputQtyNum,
        input_unit_cost: unitCostInput,
        total_output: totalOutputQty,
        total_waste: totalWasteQty + impliedWaste,
        overall_yield: yieldPct,
        created_by: user.id,
        notes: execNotes || null,
      } as any).select("id").single();
      if (e3) throw e3;

      // 4. Log run outputs
      const runOutputs = validOutputs.map((o) => {
        const qty = Math.abs(parseFloat(o.quantity));
        const calcCost = o.outputType === "waste" ? 0 : (totalOutputQty > 0 ? (totalCostInput * (qty / totalOutputQty)) / qty : 0);
        return {
          transformation_run_id: (run as any).id,
          output_product_id: o.productId,
          output_type: o.outputType,
          quantity: qty,
          yield_percent: inputQtyNum > 0 ? (qty / inputQtyNum) * 100 : 0,
          calculated_unit_cost: calcCost,
        };
      });
      const { error: e4 } = await supabase.from("transformation_run_outputs" as any).insert(runOutputs as any);
      if (e4) throw e4;

      // 5. Audit
      await logAudit({
        entityType: "transformation",
        entityId: (run as any).id,
        action: "CREATE",
        after: {
          input: { product: inputProduct.name, qty: inputQtyNum },
          outputs: validOutputs.map((o) => ({
            product: pMap[o.productId]?.name,
            qty: parseFloat(o.quantity),
            type: o.outputType,
          })),
          yield: yieldPct,
        },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["transformation_runs"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      resetExecForm();
      toast({ title: "Transformación registrada", description: "Inventario actualizado correctamente" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  /* ── Render helpers ── */
  const renderOutputLines = (
    lines: OutputLine[],
    update: (id: string, field: keyof OutputLine, value: string) => void,
    remove: (id: string) => void,
    add: () => void,
    showQty: boolean,
    showYield: boolean,
  ) => (
    <div className="space-y-3">
      {lines.map((line, idx) => (
        <div key={line.id} className="grid grid-cols-12 gap-2 items-end">
          <div className={showQty ? "col-span-4" : "col-span-5"}>
            {idx === 0 && <Label className="text-xs">Producto</Label>}
            <SearchableSelect
              options={products.map((p) => ({ value: p.id, label: `${p.name} (${p.unit})`, searchTerms: p.name }))}
              value={line.productId}
              onValueChange={(v) => update(line.id, "productId", v)}
              placeholder="Seleccionar..."
              searchPlaceholder="Buscar producto..."
            />
          </div>
          <div className="col-span-3">
            {idx === 0 && <Label className="text-xs">Tipo</Label>}
            <Select value={line.outputType} onValueChange={(v) => update(line.id, "outputType", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="output">Producto</SelectItem>
                <SelectItem value="byproduct">Subproducto</SelectItem>
                <SelectItem value="waste">Merma</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {showQty && (
            <div className="col-span-2">
              {idx === 0 && <Label className="text-xs">Cantidad</Label>}
              <Input type="number" min="0" step="0.01" value={line.quantity} onChange={(e) => update(line.id, "quantity", e.target.value)} placeholder="0" />
            </div>
          )}
          {showYield && (
            <div className="col-span-2">
              {idx === 0 && <Label className="text-xs">Rend. %</Label>}
              <Input type="number" min="0" max="100" step="0.1" value={line.expectedYield} onChange={(e) => update(line.id, "expectedYield", e.target.value)} placeholder="%" />
            </div>
          )}
          <div className="col-span-1">
            {lines.length > 1 && (
              <Button variant="ghost" size="icon" onClick={() => remove(line.id)} className="h-9 w-9">
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            )}
          </div>
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={add} type="button">
        <Plus className="h-4 w-4 mr-1" /> Agregar salida
      </Button>
    </div>
  );

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <FlaskConical className="h-6 w-6" />
              Transformaciones de Productos
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Registra procesos donde un producto se convierte en varios productos derivados
            </p>
          </div>
          <Dialog open={defOpen} onOpenChange={(o) => { setDefOpen(o); if (!o) resetDefForm(); }}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm"><Plus className="h-4 w-4 mr-1" /> Nuevo Proceso</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Definir Proceso de Transformación</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Nombre del proceso</Label>
                  <Input value={defName} onChange={(e) => setDefName(e.target.value)} placeholder="Ej: Despiece de pollo" />
                </div>
                <div>
                  <Label>Producto de entrada</Label>
                  <SearchableSelect
                    options={products.map((p) => ({ value: p.id, label: `${p.name} (${p.unit})`, searchTerms: p.name }))}
                    value={defInputId}
                    onValueChange={setDefInputId}
                    placeholder="Seleccionar..."
                    searchPlaceholder="Buscar producto..."
                  />
                </div>
                <div>
                  <Label className="text-sm font-medium">Productos de salida</Label>
                  {renderOutputLines(defOutputs, updateDefOutput, removeDefOutput, addDefOutput, false, true)}
                </div>
                <Button
                  onClick={() => createDef.mutate()}
                  disabled={!defName.trim() || !defInputId || !defOutputs.some((o) => o.productId) || createDef.isPending}
                  className="w-full"
                >
                  {createDef.isPending ? "Creando..." : "Crear Proceso"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="register"><FlaskConical className="h-4 w-4 mr-1" /> Registrar</TabsTrigger>
            <TabsTrigger value="history"><History className="h-4 w-4 mr-1" /> Historial</TabsTrigger>
            <TabsTrigger value="processes"><Percent className="h-4 w-4 mr-1" /> Procesos</TabsTrigger>
          </TabsList>

          {/* ── REGISTER ── */}
          <TabsContent value="register">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Registrar Transformación</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                {/* Process selector */}
                {definitions.length > 0 && (
                  <div>
                    <Label>Proceso predefinido (opcional)</Label>
                    <Select value={selDefId} onValueChange={handleDefSelect}>
                      <SelectTrigger><SelectValue placeholder="Seleccionar proceso o registrar manualmente" /></SelectTrigger>
                      <SelectContent>
                        {definitions.map((d: any) => (
                          <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Input section */}
                <Card className="border-2 border-destructive/30">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-destructive flex items-center gap-2">
                      <PackagePlus className="h-4 w-4" /> Producto de Entrada (se descuenta)
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label>Producto</Label>
                      <SearchableSelect
                        options={products.map((p) => ({ value: p.id, label: `${p.name} (${p.unit}) — Stock: ${p.current_stock}`, searchTerms: p.name }))}
                        value={execInputId}
                        onValueChange={setExecInputId}
                        placeholder="Seleccionar..."
                        searchPlaceholder="Buscar producto..."
                      />
                    </div>
                    <div>
                      <Label>Cantidad</Label>
                      <Input type="number" min="0" step="0.01" value={execInputQty} onChange={(e) => setExecInputQty(e.target.value)} placeholder="Ej: 10" />
                      {execInputId && pMap[execInputId] && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Stock: {pMap[execInputId].current_stock} {pMap[execInputId].unit}
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Arrow */}
                <div className="flex justify-center">
                  <ArrowRight className="h-6 w-6 text-muted-foreground rotate-90" />
                </div>

                {/* Outputs section */}
                <Card className="border-2 border-primary/30">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-primary">Productos de Salida (se agregan al inventario)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {renderOutputLines(execOutputs, updateExecOutput, removeExecOutput, addExecOutput, true, false)}
                  </CardContent>
                </Card>

                {/* Summary metrics */}
                {inputQtyNum > 0 && execOutputs.some((o) => parseFloat(o.quantity) > 0) && (() => {
                  const inputP = pMap[execInputId];
                  const costOrigin = inputP ? (inputP.average_cost > 0 ? inputP.average_cost : (inputP.last_unit_cost || 0)) : 0;
                  const totalCost = inputQtyNum * costOrigin;
                  const calcOutputCosts = execOutputs
                    .filter((o) => o.productId && parseFloat(o.quantity) > 0 && o.outputType !== "waste")
                    .map((o) => {
                      const q = parseFloat(o.quantity);
                      const newUnitCost = totalOutputQty > 0 ? (totalCost * (q / totalOutputQty)) / q : 0;
                      return { name: pMap[o.productId]?.name || "—", unit: pMap[o.productId]?.unit || "", newUnitCost, qty: q };
                    });

                  return (
                    <Card className="border border-accent/40 bg-accent/5">
                      <CardContent className="pt-4 space-y-3">
                        <div className="flex gap-3 flex-wrap items-center">
                          <Badge variant="secondary" className="text-sm py-1 px-3">
                            Total salidas: {totalAllOutputs.toFixed(2)} / {inputQtyNum}
                          </Badge>
                          {impliedWaste > 0.001 && (
                            <Badge variant="outline" className="text-sm py-1 px-3">
                              Merma implícita: {impliedWaste.toFixed(2)}
                            </Badge>
                          )}
                          <Badge variant={parseFloat(overallYield) >= 70 ? "default" : "destructive"} className="text-sm py-1 px-3">
                            Rendimiento: {overallYield}%
                          </Badge>
                          {overTotal && (
                            <Badge variant="destructive" className="text-sm py-1 px-3">
                              ⚠ Suma supera la entrada
                            </Badge>
                          )}
                        </div>

                        {costOrigin > 0 && (
                          <div className="space-y-2 text-sm">
                            <div className="flex items-center gap-4 text-muted-foreground">
                              <span>Costo origen: <strong className="text-foreground">${costOrigin.toLocaleString("es-CO", { minimumFractionDigits: 2 })}</strong> / {inputP?.unit}</span>
                              <span>Costo total entrada: <strong className="text-foreground">${totalCost.toLocaleString("es-CO", { minimumFractionDigits: 2 })}</strong></span>
                            </div>
                            {calcOutputCosts.length > 0 && (
                              <div className="border-t border-border pt-2 space-y-1">
                                <span className="text-xs font-medium text-muted-foreground">Nuevo costo calculado por producto de salida:</span>
                                {calcOutputCosts.map((c, i) => (
                                  <div key={i} className="flex items-center gap-2">
                                    <ArrowRight className="h-3 w-3 text-primary" />
                                    <span className="font-medium">{c.name}</span>
                                    <span className="text-primary font-semibold">
                                      ${c.newUnitCost.toLocaleString("es-CO", { minimumFractionDigits: 2 })} / {c.unit}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })()}

                <div>
                  <Label>Notas (opcional)</Label>
                  <Textarea value={execNotes} onChange={(e) => setExecNotes(e.target.value)} placeholder="Observaciones..." rows={2} />
                </div>

                <Button
                  onClick={() => execTransformation.mutate()}
                  disabled={!execInputId || inputQtyNum <= 0 || !execOutputs.some((o) => o.productId && parseFloat(o.quantity) > 0) || overTotal || execTransformation.isPending}
                  className="w-full"
                  size="lg"
                >
                  {execTransformation.isPending ? "Procesando..." : "Registrar Transformación"}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── HISTORY ── */}
          <TabsContent value="history">
            <Card>
              <CardHeader><CardTitle className="text-lg">Historial de Transformaciones</CardTitle></CardHeader>
              <CardContent>
                {runs.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">No hay transformaciones registradas</p>
                ) : (
                  <div className="space-y-4">
                    {runs.map((run: any) => {
                      const outs = run.transformation_run_outputs || [];
                      return (
                        <Card key={run.id} className="border">
                          <CardContent className="pt-4 space-y-2">
                            <div className="flex items-center justify-between flex-wrap gap-2">
                              <div className="flex items-center gap-2">
                                <span className="text-sm text-muted-foreground">
                                  {format(new Date(run.run_date), "dd/MM/yy HH:mm", { locale: es })}
                                </span>
                                <Badge variant={run.overall_yield >= 70 ? "default" : "destructive"}>
                                  Rend: {parseFloat(run.overall_yield).toFixed(1)}%
                                </Badge>
                              </div>
                              {run.notes && <span className="text-xs text-muted-foreground">{run.notes}</span>}
                            </div>
                            <div className="flex items-center gap-2 text-sm">
                              <Badge variant="destructive" className="text-xs">ENTRADA</Badge>
                              <span className="font-medium">{pMap[run.input_product_id]?.name ?? "—"}</span>
                              <span>{run.input_quantity} {pMap[run.input_product_id]?.unit}</span>
                              {run.input_unit_cost > 0 && (
                                <span className="text-xs text-muted-foreground ml-1">
                                  (${parseFloat(run.input_unit_cost).toLocaleString("es-CO", { minimumFractionDigits: 2 })} / {pMap[run.input_product_id]?.unit})
                                </span>
                              )}
                            </div>
                            <div className="ml-4 border-l-2 border-primary/20 pl-3 space-y-1">
                              {outs.map((o: any) => (
                                <div key={o.id} className="flex items-center gap-2 text-sm">
                                  <Badge variant={OUTPUT_TYPE_LABELS[o.output_type]?.color as any ?? "secondary"} className="text-xs">
                                    {OUTPUT_TYPE_LABELS[o.output_type]?.label ?? o.output_type}
                                  </Badge>
                                  <span>{pMap[o.output_product_id]?.name ?? "—"}</span>
                                  <span className="text-muted-foreground">{o.quantity} {pMap[o.output_product_id]?.unit}</span>
                                  <span className="text-xs text-muted-foreground">({parseFloat(o.yield_percent).toFixed(1)}%)</span>
                                  {o.calculated_unit_cost > 0 && o.output_type !== "waste" && (
                                    <span className="text-xs text-primary font-medium ml-1">
                                      → ${parseFloat(o.calculated_unit_cost).toLocaleString("es-CO", { minimumFractionDigits: 2 })} / {pMap[o.output_product_id]?.unit}
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── PROCESSES ── */}
          <TabsContent value="processes">
            <Card>
              <CardHeader><CardTitle className="text-lg">Procesos Definidos</CardTitle></CardHeader>
              <CardContent>
                {definitions.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">No hay procesos definidos. Crea uno con "Nuevo Proceso".</p>
                ) : (
                  <div className="space-y-4">
                    {definitions.map((def: any) => {
                      const outs = def.transformation_definition_outputs || [];
                      return (
                        <Card key={def.id} className="border">
                          <CardContent className="pt-4 space-y-2">
                            <h3 className="font-semibold">{def.name}</h3>
                            <div className="flex items-center gap-2 text-sm">
                              <Badge variant="destructive" className="text-xs">ENTRADA</Badge>
                              <span>{pMap[def.input_product_id]?.name ?? "—"} ({pMap[def.input_product_id]?.unit})</span>
                            </div>
                            <div className="ml-4 border-l-2 border-primary/20 pl-3 space-y-1">
                              {outs.map((o: any) => (
                                <div key={o.id} className="flex items-center gap-2 text-sm">
                                  <Badge variant={OUTPUT_TYPE_LABELS[o.output_type]?.color as any ?? "secondary"} className="text-xs">
                                    {OUTPUT_TYPE_LABELS[o.output_type]?.label ?? o.output_type}
                                  </Badge>
                                  <span>{pMap[o.output_product_id]?.name ?? "—"}</span>
                                  {o.expected_yield_percent && (
                                    <span className="text-xs text-muted-foreground">({o.expected_yield_percent}%)</span>
                                  )}
                                </div>
                              ))}
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
