import { useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { Plus, FlaskConical, History, Percent, ArrowRight } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

export default function Transformations() {
  const restaurantId = useRestaurantId();
  const { user } = useAuth();
  const { logAudit } = useAudit();
  const queryClient = useQueryClient();

  const [tab, setTab] = useState("register");
  const [processDialogOpen, setProcessDialogOpen] = useState(false);

  // Process form
  const [processName, setProcessName] = useState("");
  const [processInputId, setProcessInputId] = useState("");
  const [processOutputId, setProcessOutputId] = useState("");
  const [processWasteId, setProcessWasteId] = useState("");
  const [processYield, setProcessYield] = useState("");

  // Registration form
  const [selectedProcessId, setSelectedProcessId] = useState("");
  const [inputProductId, setInputProductId] = useState("");
  const [outputProductId, setOutputProductId] = useState("");
  const [wasteProductId, setWasteProductId] = useState("");
  const [inputQty, setInputQty] = useState("");
  const [outputQty, setOutputQty] = useState("");
  const [wasteQty, setWasteQty] = useState("");
  const [notes, setNotes] = useState("");

  // Queries
  const { data: products = [] } = useQuery({
    queryKey: ["products", restaurantId],
    queryFn: async () => {
      const { data } = await supabase
        .from("products")
        .select("id, name, unit, current_stock, average_cost")
        .order("name");
      return data ?? [];
    },
    enabled: !!restaurantId,
  });

  const { data: processes = [] } = useQuery({
    queryKey: ["transformation_processes", restaurantId],
    queryFn: async () => {
      const { data } = await supabase
        .from("transformation_processes" as any)
        .select("*")
        .eq("restaurant_id", restaurantId!)
        .eq("active", true)
        .order("name");
      return (data ?? []) as any[];
    },
    enabled: !!restaurantId,
  });

  const { data: logs = [] } = useQuery({
    queryKey: ["transformation_logs", restaurantId],
    queryFn: async () => {
      const { data } = await supabase
        .from("transformation_logs" as any)
        .select("*")
        .eq("restaurant_id", restaurantId!)
        .order("performed_at", { ascending: false })
        .limit(100);
      return (data ?? []) as any[];
    },
    enabled: !!restaurantId,
  });

  const productMap = Object.fromEntries(products.map((p) => [p.id, p]));

  // Create process
  const createProcess = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("transformation_processes" as any).insert({
        restaurant_id: restaurantId,
        name: processName.trim(),
        input_product_id: processInputId,
        output_product_id: processOutputId,
        waste_product_id: processWasteId || null,
        expected_yield: processYield ? parseFloat(processYield) : 0,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transformation_processes"] });
      setProcessDialogOpen(false);
      setProcessName("");
      setProcessInputId("");
      setProcessOutputId("");
      setProcessWasteId("");
      setProcessYield("");
      toast({ title: "Proceso creado correctamente" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // Execute transformation
  const executeTransformation = useMutation({
    mutationFn: async () => {
      if (!user || !restaurantId) throw new Error("Sin sesión");
      const inQty = Math.abs(parseFloat(inputQty));
      const outQty = Math.abs(parseFloat(outputQty));
      if (!inQty || !outQty) throw new Error("Cantidades inválidas");
      if (outQty > inQty) throw new Error("La cantidad de salida no puede ser mayor a la entrada");

      const waste = wasteQty ? Math.abs(parseFloat(wasteQty)) : inQty - outQty;
      const yieldPct = (outQty / inQty) * 100;

      const inputProduct = productMap[inputProductId];
      const outputProduct = productMap[outputProductId];
      if (!inputProduct || !outputProduct) throw new Error("Productos no encontrados");

      if (inQty > inputProduct.current_stock) {
        throw new Error(`Stock insuficiente de ${inputProduct.name}. Disponible: ${inputProduct.current_stock} ${inputProduct.unit}`);
      }

      const unitCostInput = inputProduct.average_cost || 0;
      const totalCostInput = inQty * unitCostInput;
      const unitCostOutput = outQty > 0 ? totalCostInput / outQty : 0;

      // 1. Salida del producto de entrada
      const { error: e1 } = await supabase.from("inventory_movements").insert({
        restaurant_id: restaurantId,
        product_id: inputProductId,
        user_id: user.id,
        type: "salida",
        quantity: inQty,
        unit_cost: unitCostInput,
        total_cost: totalCostInput,
        notes: `Transformación: ${processName || "manual"} → ${outputProduct.name}`,
      });
      if (e1) throw e1;

      // 2. Entrada del producto de salida
      const { error: e2 } = await supabase.from("inventory_movements").insert({
        restaurant_id: restaurantId,
        product_id: outputProductId,
        user_id: user.id,
        type: "entrada",
        quantity: outQty,
        unit_cost: unitCostOutput,
        total_cost: totalCostInput,
        notes: `Transformación: ${inputProduct.name} → ${outputProduct.name}`,
      });
      if (e2) throw e2;

      // 3. Merma (si hay producto de merma)
      if (wasteProductId && waste > 0) {
        const { error: e3 } = await supabase.from("inventory_movements").insert({
          restaurant_id: restaurantId,
          product_id: wasteProductId,
          user_id: user.id,
          type: "entrada",
          quantity: waste,
          unit_cost: 0,
          total_cost: 0,
          notes: `Merma de transformación: ${inputProduct.name}`,
        });
        if (e3) throw e3;
      }

      // 4. Log
      const { error: e4 } = await supabase.from("transformation_logs" as any).insert({
        restaurant_id: restaurantId,
        process_id: selectedProcessId || null,
        input_product_id: inputProductId,
        output_product_id: outputProductId,
        waste_product_id: wasteProductId || null,
        input_quantity: inQty,
        output_quantity: outQty,
        waste_quantity: waste,
        yield_percentage: yieldPct,
        performed_by: user.id,
        notes: notes || null,
      } as any);
      if (e4) throw e4;

      // 5. Audit
      await logAudit({
        entityType: "transformation",
        entityId: inputProductId,
        action: "CREATE",
        after: {
          input: { product: inputProduct.name, qty: inQty },
          output: { product: outputProduct.name, qty: outQty },
          waste,
          yield: yieldPct,
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transformation_logs"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      resetRegistrationForm();
      toast({ title: "Transformación registrada", description: "Inventario actualizado correctamente" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const resetRegistrationForm = () => {
    setSelectedProcessId("");
    setInputProductId("");
    setOutputProductId("");
    setWasteProductId("");
    setInputQty("");
    setOutputQty("");
    setWasteQty("");
    setNotes("");
  };

  const handleProcessSelect = (processId: string) => {
    setSelectedProcessId(processId);
    const proc = processes.find((p: any) => p.id === processId);
    if (proc) {
      setInputProductId(proc.input_product_id);
      setOutputProductId(proc.output_product_id);
      setWasteProductId(proc.waste_product_id || "");
    }
  };

  const calculatedWaste = inputQty && outputQty ? Math.max(0, parseFloat(inputQty) - parseFloat(outputQty)) : 0;
  const calculatedYield = inputQty && outputQty && parseFloat(inputQty) > 0
    ? ((parseFloat(outputQty) / parseFloat(inputQty)) * 100).toFixed(1)
    : "0";

  const processName_ = selectedProcessId
    ? (processes.find((p: any) => p.id === selectedProcessId) as any)?.name || ""
    : "";

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <FlaskConical className="h-6 w-6" />
              Transformaciones de Productos
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Registra procesos donde un producto se convierte en otro con merma natural
            </p>
          </div>
          <Dialog open={processDialogOpen} onOpenChange={setProcessDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Plus className="h-4 w-4 mr-1" /> Nuevo Proceso
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Crear Proceso de Transformación</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Nombre del proceso</Label>
                  <Input value={processName} onChange={(e) => setProcessName(e.target.value)} placeholder="Ej: Pelar papa" />
                </div>
                <div>
                  <Label>Producto de entrada</Label>
                  <Select value={processInputId} onValueChange={setProcessInputId}>
                    <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                    <SelectContent>
                      {products.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.name} ({p.unit})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Producto de salida</Label>
                  <Select value={processOutputId} onValueChange={setProcessOutputId}>
                    <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                    <SelectContent>
                      {products.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.name} ({p.unit})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Producto de merma (opcional)</Label>
                  <Select value={processWasteId} onValueChange={setProcessWasteId}>
                    <SelectTrigger><SelectValue placeholder="Sin producto de merma" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sin producto de merma</SelectItem>
                      {products.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.name} ({p.unit})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Rendimiento esperado (%)</Label>
                  <Input type="number" value={processYield} onChange={(e) => setProcessYield(e.target.value)} placeholder="Ej: 84" />
                </div>
                <Button
                  onClick={() => createProcess.mutate()}
                  disabled={!processName.trim() || !processInputId || !processOutputId || createProcess.isPending}
                  className="w-full"
                >
                  Crear Proceso
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="register">
              <FlaskConical className="h-4 w-4 mr-1" /> Registrar
            </TabsTrigger>
            <TabsTrigger value="history">
              <History className="h-4 w-4 mr-1" /> Historial
            </TabsTrigger>
            <TabsTrigger value="processes">
              <Percent className="h-4 w-4 mr-1" /> Procesos
            </TabsTrigger>
          </TabsList>

          {/* REGISTER TAB */}
          <TabsContent value="register">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Registrar Transformación</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                {/* Optional: select pre-defined process */}
                {processes.length > 0 && (
                  <div>
                    <Label>Proceso predefinido (opcional)</Label>
                    <Select value={selectedProcessId} onValueChange={handleProcessSelect}>
                      <SelectTrigger><SelectValue placeholder="Seleccionar proceso o registrar manualmente" /></SelectTrigger>
                      <SelectContent>
                        {processes.map((p: any) => (
                          <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Input */}
                  <Card className="border-2 border-destructive/30">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-destructive">Producto Entrada (sale)</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div>
                        <Label>Producto</Label>
                        <Select value={inputProductId} onValueChange={setInputProductId}>
                          <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                          <SelectContent>
                            {products.map((p) => (
                              <SelectItem key={p.id} value={p.id}>{p.name} ({p.unit}) — Stock: {p.current_stock}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Cantidad</Label>
                        <Input type="number" min="0" step="0.01" value={inputQty} onChange={(e) => setInputQty(e.target.value)} placeholder="Ej: 50" />
                        {inputProductId && productMap[inputProductId] && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Stock: {productMap[inputProductId].current_stock} {productMap[inputProductId].unit}
                          </p>
                        )}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Arrow */}
                  <div className="hidden md:flex items-center justify-center">
                    <ArrowRight className="h-8 w-8 text-muted-foreground" />
                  </div>

                  {/* Output */}
                  <Card className="border-2 border-primary/30">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-primary">Producto Salida (entra)</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div>
                        <Label>Producto</Label>
                        <Select value={outputProductId} onValueChange={setOutputProductId}>
                          <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                          <SelectContent>
                            {products.map((p) => (
                              <SelectItem key={p.id} value={p.id}>{p.name} ({p.unit})</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Cantidad</Label>
                        <Input type="number" min="0" step="0.01" value={outputQty} onChange={(e) => setOutputQty(e.target.value)} placeholder="Ej: 42" />
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Waste product */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Producto de merma (opcional)</Label>
                    <Select value={wasteProductId} onValueChange={(v) => setWasteProductId(v === "none" ? "" : v)}>
                      <SelectTrigger><SelectValue placeholder="Sin producto de merma" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sin producto de merma</SelectItem>
                        {products.map((p) => (
                          <SelectItem key={p.id} value={p.id}>{p.name} ({p.unit})</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Cantidad merma (auto si vacío)</Label>
                    <Input type="number" min="0" step="0.01" value={wasteQty} onChange={(e) => setWasteQty(e.target.value)} placeholder={`Auto: ${calculatedWaste}`} />
                  </div>
                </div>

                {/* Calculated metrics */}
                {inputQty && outputQty && (
                  <div className="flex gap-4 flex-wrap">
                    <Badge variant="secondary" className="text-sm py-1 px-3">
                      Merma: {wasteQty ? parseFloat(wasteQty) : calculatedWaste} {inputProductId ? productMap[inputProductId]?.unit : ""}
                    </Badge>
                    <Badge variant={parseFloat(calculatedYield) >= 80 ? "default" : "destructive"} className="text-sm py-1 px-3">
                      Rendimiento: {calculatedYield}%
                    </Badge>
                  </div>
                )}

                <div>
                  <Label>Notas (opcional)</Label>
                  <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Observaciones del proceso..." rows={2} />
                </div>

                <Button
                  onClick={() => executeTransformation.mutate()}
                  disabled={!inputProductId || !outputProductId || !inputQty || !outputQty || executeTransformation.isPending}
                  className="w-full"
                  size="lg"
                >
                  {executeTransformation.isPending ? "Procesando..." : "Registrar Transformación"}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* HISTORY TAB */}
          <TabsContent value="history">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Historial de Transformaciones</CardTitle>
              </CardHeader>
              <CardContent>
                {logs.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">No hay transformaciones registradas</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Fecha</TableHead>
                          <TableHead>Entrada</TableHead>
                          <TableHead>Qty Entrada</TableHead>
                          <TableHead>Salida</TableHead>
                          <TableHead>Qty Salida</TableHead>
                          <TableHead>Merma</TableHead>
                          <TableHead>Rendimiento</TableHead>
                          <TableHead>Notas</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {logs.map((log: any) => (
                          <TableRow key={log.id}>
                            <TableCell className="whitespace-nowrap text-sm">
                              {format(new Date(log.performed_at), "dd/MM/yy HH:mm", { locale: es })}
                            </TableCell>
                            <TableCell className="text-sm">{productMap[log.input_product_id]?.name ?? "—"}</TableCell>
                            <TableCell className="text-sm">{log.input_quantity}</TableCell>
                            <TableCell className="text-sm">{productMap[log.output_product_id]?.name ?? "—"}</TableCell>
                            <TableCell className="text-sm">{log.output_quantity}</TableCell>
                            <TableCell className="text-sm">{log.waste_quantity}</TableCell>
                            <TableCell>
                              <Badge variant={log.yield_percentage >= 80 ? "default" : "destructive"} className="text-xs">
                                {parseFloat(log.yield_percentage).toFixed(1)}%
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">{log.notes || "—"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* PROCESSES TAB */}
          <TabsContent value="processes">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Procesos Definidos</CardTitle>
              </CardHeader>
              <CardContent>
                {processes.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">No hay procesos definidos. Crea uno con el botón "Nuevo Proceso".</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nombre</TableHead>
                        <TableHead>Producto Entrada</TableHead>
                        <TableHead>Producto Salida</TableHead>
                        <TableHead>Producto Merma</TableHead>
                        <TableHead>Rendimiento Esperado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {processes.map((p: any) => (
                        <TableRow key={p.id}>
                          <TableCell className="font-medium">{p.name}</TableCell>
                          <TableCell>{productMap[p.input_product_id]?.name ?? "—"}</TableCell>
                          <TableCell>{productMap[p.output_product_id]?.name ?? "—"}</TableCell>
                          <TableCell>{p.waste_product_id ? (productMap[p.waste_product_id]?.name ?? "—") : "—"}</TableCell>
                          <TableCell>
                            {p.expected_yield > 0 ? <Badge variant="secondary">{p.expected_yield}%</Badge> : "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
