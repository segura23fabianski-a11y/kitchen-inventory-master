import { useState, useCallback, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurantId } from "@/hooks/use-restaurant";
import { useAuth } from "@/lib/auth";
import { useContractServiceRates } from "@/hooks/use-contract-service-rates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Plus, Send, X, ShoppingCart, Building2, Minus, Printer, Search,
  MessageSquare, ChevronLeft, Users, Package, DollarSign, AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { printKitchenComanda } from "@/lib/pos-printing";
import { fuzzyMatch } from "@/lib/search-utils";
import { formatCOP } from "@/lib/utils";

const SERVICE_OPTIONS = [
  { value: "breakfast", label: "Desayuno" },
  { value: "lunch", label: "Almuerzo" },
  { value: "dinner", label: "Cena" },
  { value: "snack", label: "Lonche" },
];

const DEST_OPTIONS = [
  { value: "company_area", label: "Área empresa" },
  { value: "dining_area", label: "Comedor" },
  { value: "room", label: "Habitación" },
  { value: "reception", label: "Recepción" },
  { value: "other", label: "Otro" },
];

const STATUS_LABELS: Record<string, string> = {
  open: "Abierto", sent_to_kitchen: "En cocina", served: "Servido", closed: "Cerrado", cancelled: "Cancelado",
};

const STATUS_COLORS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  open: "outline", sent_to_kitchen: "default", served: "secondary", closed: "secondary", cancelled: "destructive",
};

interface OrderLine {
  contractGroupId: string;
  contractGroupName: string;
  items: { menu_item_id: string; name: string; quantity: number; notes: string }[];
}

export default function POSCorporateTab() {
  const restaurantId = useRestaurantId();
  const { user } = useAuth();
  const qc = useQueryClient();
  const { resolveServiceRate } = useContractServiceRates();

  const [creating, setCreating] = useState(false);
  const [companyId, setCompanyId] = useState("");
  const [contractId, setContractId] = useState("");
  const [servicePeriod, setServicePeriod] = useState("lunch");
  const [destType, setDestType] = useState("company_area");
  const [destDetail, setDestDetail] = useState("");
  const [isTestRecord, setIsTestRecord] = useState(false);
  const [filterStatus, setFilterStatus] = useState("active");

  // Lines state
  const [lines, setLines] = useState<OrderLine[]>([]);
  const [currentGroupId, setCurrentGroupId] = useState("");
  const [currentItems, setCurrentItems] = useState<{ menu_item_id: string; name: string; quantity: number; notes: string }[]>([]);

  // Menu navigation
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [menuSearch, setMenuSearch] = useState("");
  const [notesItemIdx, setNotesItemIdx] = useState<number | null>(null);

  // Queries
  const { data: orders = [] } = useQuery({
    queryKey: ["pos-orders-corporate", restaurantId, filterStatus],
    queryFn: async () => {
      let q = supabase
        .from("pos_orders")
        .select(`*, hotel_companies(name), contracts(name, code), contract_groups(name)`)
        .eq("restaurant_id", restaurantId!)
        .eq("order_type", "company")
        .order("created_at", { ascending: false })
        .limit(100);
      if (filterStatus === "active") {
        q = q.in("status", ["open", "sent_to_kitchen", "served"]);
      } else if (filterStatus !== "all") {
        q = q.eq("status", filterStatus);
      }
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
    enabled: !!restaurantId,
  });

  const { data: menuItems = [] } = useQuery({
    queryKey: ["menu-items-active", restaurantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("menu_items").select("*")
        .eq("restaurant_id", restaurantId!).eq("active", true)
        .order("category").order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!restaurantId,
  });

  const { data: companies = [] } = useQuery({
    queryKey: ["hotel-companies", restaurantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hotel_companies").select("id, name")
        .eq("restaurant_id", restaurantId!).eq("active", true).order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!restaurantId,
  });

  const { data: contracts = [] } = useQuery({
    queryKey: ["contracts-active", restaurantId, companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contracts").select("id, name, code, company_id")
        .eq("restaurant_id", restaurantId!).eq("active", true).eq("company_id", companyId).order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!restaurantId && !!companyId,
  });

  const { data: contractGroups = [] } = useQuery({
    queryKey: ["contract-groups-active", restaurantId, contractId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contract_groups").select("id, name, group_type")
        .eq("restaurant_id", restaurantId!).eq("contract_id", contractId).eq("active", true).order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!restaurantId && !!contractId,
  });

  const categories = useMemo(() => {
    const cats = new Set(menuItems.map((i: any) => i.category || "General"));
    return Array.from(cats).sort();
  }, [menuItems]);

  const visibleItems = useMemo(() => {
    if (menuSearch.trim()) {
      return menuItems.filter((i: any) => fuzzyMatch(`${i.name} ${i.category} ${i.barcode || ""}`, menuSearch));
    }
    if (!selectedCategory) return [];
    return menuItems.filter((i: any) => (i.category || "General") === selectedCategory);
  }, [menuItems, selectedCategory, menuSearch]);

  // --- SERVICE-BASED PRICING ---
  const resolvedRate = useMemo(() => {
    if (!companyId) return { rate: 0, found: false };
    return resolveServiceRate(companyId, contractId || null, servicePeriod);
  }, [companyId, contractId, servicePeriod, resolveServiceRate]);

  const totalServings = useMemo(() => {
    return lines.reduce((sum, l) => sum + l.items.reduce((s, it) => s + it.quantity, 0), 0)
      + currentItems.reduce((s, it) => s + it.quantity, 0);
  }, [lines, currentItems]);

  // Corporate total = total servings × service rate
  const orderTotal = totalServings * resolvedRate.rate;

  const addItemToCurrentLine = useCallback((item: any) => {
    setCurrentItems(prev => {
      const existing = prev.find(c => c.menu_item_id === item.id);
      if (existing) {
        return prev.map(c => c.menu_item_id === item.id ? { ...c, quantity: c.quantity + 1 } : c);
      }
      return [...prev, { menu_item_id: item.id, name: item.name, quantity: 1, notes: "" }];
    });
  }, []);

  const addLineToOrder = () => {
    if (currentItems.length === 0) { toast.error("Agrega al menos un ítem"); return; }
    const groupName = contractGroups.find(g => g.id === currentGroupId)?.name || "General";
    setLines(prev => [...prev, {
      contractGroupId: currentGroupId,
      contractGroupName: groupName,
      items: [...currentItems],
    }]);
    setCurrentItems([]);
    setCurrentGroupId("");
    toast.success(`Línea "${groupName}" agregada`);
  };

  const removeLineFromOrder = (idx: number) => {
    setLines(prev => prev.filter((_, i) => i !== idx));
  };

  const allItems = useMemo(() => lines.flatMap(l => l.items), [lines]);

  const createOrder = useMutation({
    mutationFn: async () => {
      const finalItems = [...allItems, ...currentItems];
      if (finalItems.length === 0) throw new Error("Agrega al menos una línea");
      if (!companyId) throw new Error("Selecciona una empresa");
      if (!resolvedRate.found) throw new Error("No hay tarifa configurada para este servicio y empresa");

      const finalServings = finalItems.reduce((s, it) => s + it.quantity, 0);
      const finalTotal = finalServings * resolvedRate.rate;

      // If there are unsaved current items, add them as a line first
      const finalLines = currentItems.length > 0
        ? [...lines, { contractGroupId: currentGroupId, contractGroupName: contractGroups.find(g => g.id === currentGroupId)?.name || "General", items: [...currentItems] }]
        : lines;

      const { data: order, error } = await supabase
        .from("pos_orders")
        .insert({
          restaurant_id: restaurantId!,
          order_type: "company",
          company_id: companyId,
          contract_id: contractId || null,
          contract_group_id: finalLines.length === 1 ? (finalLines[0].contractGroupId || null) : null,
          service_period: servicePeriod,
          delivery_destination_type: destType,
          delivery_destination_detail: destDetail || null,
          billing_mode: "corporate_charge",
          created_by: user!.id,
          status: "open",
          is_test_record: isTestRecord,
          total: finalTotal,
        } as any)
        .select()
        .single();
      if (error) throw error;

      // Insert items — unit_price = service rate (for billing reference), not menu price
      const items = finalLines.flatMap(line =>
        line.items.map(c => ({
          order_id: order.id,
          menu_item_id: c.menu_item_id,
          quantity: c.quantity,
          unit_price: resolvedRate.rate,
          rate_applied: resolvedRate.rate,
          rate_source: "contract_service",
          notes: [line.contractGroupName !== "General" ? `[${line.contractGroupName}]` : "", c.notes].filter(Boolean).join(" ") || null,
        } as any))
      );

      const { error: itemsErr } = await supabase.from("pos_order_items").insert(items);
      if (itemsErr) throw itemsErr;

      // Auto-deduct inventory for direct_product items
      const directItems = finalItems.filter(c => {
        const mi = menuItems.find((m: any) => m.id === c.menu_item_id);
        return mi?.item_type === "direct_product" && mi?.linked_product_id;
      });
      if (directItems.length > 0) {
        const productIds = directItems.map(c => {
          const mi = menuItems.find((m: any) => m.id === c.menu_item_id) as any;
          return mi.linked_product_id;
        });
        const { data: productCosts } = await supabase.from("products").select("id, average_cost").in("id", productIds);
        const costMap = new Map((productCosts || []).map(p => [p.id, Number(p.average_cost) || 0]));
        const movements = directItems.map(c => {
          const mi = menuItems.find((m: any) => m.id === c.menu_item_id) as any;
          const avgCost = costMap.get(mi.linked_product_id) || 0;
          return {
            product_id: mi.linked_product_id, restaurant_id: restaurantId!, user_id: user!.id,
            type: "pos_sale", quantity: c.quantity, unit_cost: avgCost, total_cost: c.quantity * avgCost,
            notes: `Venta POS Corp #${order.order_number} — ${c.name}`,
            movement_date: new Date().toISOString(), source_module: "POS",
          };
        });
        await supabase.from("inventory_movements").insert(movements);
      }

      return order;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pos-orders-corporate"] });
      toast.success("Pedido corporativo creado");
      closeDialog();
    },
    onError: (e: any) => toast.error(e.message || "Error al crear pedido"),
  });

  const sendToKitchen = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("pos_orders").update({ status: "sent_to_kitchen" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pos-orders-corporate"] });
      qc.invalidateQueries({ queryKey: ["pos-kitchen-orders"] });
      toast.success("Enviado a cocina");
    },
  });

  const closeOrder = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("pos_orders").update({ status: "closed" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["pos-orders-corporate"] }); toast.success("Cerrado"); },
  });

  const cancelOrder = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("pos_orders").update({ status: "cancelled" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["pos-orders-corporate"] }); toast.success("Cancelado"); },
  });

  const closeDialog = () => {
    setCreating(false);
    setCompanyId("");
    setContractId("");
    setServicePeriod("lunch");
    setDestType("company_area");
    setDestDetail("");
    setIsTestRecord(false);
    setLines([]);
    setCurrentItems([]);
    setCurrentGroupId("");
    setSelectedCategory(null);
    setMenuSearch("");
    setNotesItemIdx(null);
  };

  const handlePrintComanda = async (orderId: string) => {
    const { data: order } = await supabase
      .from("pos_orders")
      .select(`*, pos_order_items(*, menu_items(name)), hotel_companies(name), contracts(name, code)`)
      .eq("id", orderId).single();
    if (!order) return;
    const destLabel = DEST_OPTIONS.find(d => d.value === order.delivery_destination_type)?.label || order.delivery_destination_type;
    printKitchenComanda({
      orderNumber: order.order_number,
      servicePeriod: order.service_period,
      destination: destLabel,
      destinationDetail: order.delivery_destination_detail || undefined,
      groupLabel: (order as any).hotel_companies?.name,
      items: ((order as any).pos_order_items || []).map((i: any) => ({
        name: i.menu_items?.name || "—",
        quantity: i.quantity,
        notes: i.notes || undefined,
      })),
      createdAt: order.created_at,
    });
  };

  const serviceLabel = SERVICE_OPTIONS.find(s => s.value === servicePeriod)?.label || servicePeriod;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Pedidos Corporativos</h2>
        <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4 mr-1" />Nuevo Pedido</Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Activos</SelectItem>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="closed">Cerrados</SelectItem>
            <SelectItem value="cancelled">Cancelados</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {orders.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">No hay pedidos corporativos</div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {orders.map(order => (
            <Card key={order.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-mono">{order.order_number}</CardTitle>
                  <Badge variant={STATUS_COLORS[order.status] || "outline"}>
                    {STATUS_LABELS[order.status] || order.status}
                  </Badge>
                </div>
                <div className="text-sm text-muted-foreground flex items-center gap-1">
                  <Building2 className="h-3.5 w-3.5" />
                  {(order as any).hotel_companies?.name || "Empresa"}
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{format(new Date(order.created_at), "HH:mm · dd/MM")}</span>
                  <span>·</span>
                  <Badge variant="secondary" className="text-[10px]">
                    {SERVICE_OPTIONS.find(s => s.value === order.service_period)?.label || order.service_period}
                  </Badge>
                  <span>·</span>
                  <span className="font-mono font-semibold">{formatCOP(order.total)}</span>
                </div>
                {((order as any).contracts?.name || (order as any).contract_groups?.name) && (
                  <div className="text-xs text-muted-foreground">
                    {(order as any).contracts?.name && <span className="font-medium">{(order as any).contracts.name}</span>}
                    {(order as any).contract_groups?.name && <span> → {(order as any).contract_groups.name}</span>}
                  </div>
                )}
                {(order as any).is_test_record && <Badge variant="destructive" className="text-[10px] px-1 py-0">PRUEBA</Badge>}
              </CardHeader>
              <CardContent className="flex gap-1 flex-wrap">
                {order.status === "open" && (
                  <>
                    <Button size="sm" variant="default" onClick={() => sendToKitchen.mutate(order.id)}>
                      <Send className="h-3.5 w-3.5 mr-1" />Cocina
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => cancelOrder.mutate(order.id)}>
                      <X className="h-3.5 w-3.5 mr-1" />Cancelar
                    </Button>
                  </>
                )}
                {order.status === "served" && (
                  <Button size="sm" variant="secondary" onClick={() => closeOrder.mutate(order.id)}>Cerrar</Button>
                )}
                <Button size="sm" variant="outline" onClick={() => handlePrintComanda(order.id)}>
                  <Printer className="h-3.5 w-3.5 mr-1" />Comanda
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ═══ NEW CORPORATE ORDER DIALOG ═══ */}
      <Dialog open={creating} onOpenChange={v => !v && closeDialog()}>
        <DialogContent className="max-w-6xl max-h-[95vh] overflow-hidden p-0">
          <div className="flex flex-col h-[90vh]">
            <div className="flex items-center justify-between px-6 py-3 border-b bg-muted/30">
              <DialogTitle className="text-lg">Nuevo Pedido Corporativo</DialogTitle>
              <div className="flex items-center gap-1.5">
                <Switch checked={isTestRecord} onCheckedChange={setIsTestRecord} id="test-corp" />
                <Label htmlFor="test-corp" className="text-xs cursor-pointer">Prueba</Label>
              </div>
            </div>

            <div className="flex flex-1 overflow-hidden">
              {/* ─── LEFT: Order config + Lines ─── */}
              <div className="w-[380px] border-r flex flex-col bg-background">
                <ScrollArea className="flex-1">
                  <div className="p-4 space-y-3">
                    {/* Base order config */}
                    <div className="space-y-3 rounded-lg border p-3 bg-muted/20">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Datos del pedido</p>
                      <div>
                        <Label className="text-xs">Empresa *</Label>
                        <Select value={companyId} onValueChange={v => { setCompanyId(v); setContractId(""); }}>
                          <SelectTrigger className="h-9"><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                          <SelectContent>
                            {companies.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      {companyId && contracts.length > 0 && (
                        <div>
                          <Label className="text-xs">Contrato / Frente</Label>
                          <Select value={contractId || "none"} onValueChange={v => setContractId(v === "none" ? "" : v)}>
                            <SelectTrigger className="h-9"><SelectValue placeholder="Sin contrato" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Sin contrato</SelectItem>
                              {contracts.map(c => <SelectItem key={c.id} value={c.id}>{c.name}{c.code ? ` (${c.code})` : ""}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-xs">Servicio</Label>
                          <Select value={servicePeriod} onValueChange={setServicePeriod}>
                            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {SERVICE_OPTIONS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-xs">Destino</Label>
                          <Select value={destType} onValueChange={setDestType}>
                            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {DEST_OPTIONS.map(d => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div>
                        <Label className="text-xs">Detalle destino</Label>
                        <Input value={destDetail} onChange={e => setDestDetail(e.target.value)} placeholder="Ej: RIT 23" className="h-9" />
                      </div>

                      {/* Service rate display */}
                      {companyId && (
                        <div className={`rounded-md border p-2 text-sm ${resolvedRate.found ? "bg-primary/5 border-primary/30" : "bg-destructive/5 border-destructive/30"}`}>
                          <div className="flex items-center gap-1.5">
                            {resolvedRate.found ? (
                              <DollarSign className="h-4 w-4 text-primary" />
                            ) : (
                              <AlertCircle className="h-4 w-4 text-destructive" />
                            )}
                            <span className="font-medium">
                              {resolvedRate.found
                                ? `${serviceLabel}: {formatCOP(resolvedRate.rate)} / servicio`
                                : `Sin tarifa para ${serviceLabel}`}
                            </span>
                          </div>
                          {!resolvedRate.found && (
                            <p className="text-xs text-destructive mt-1">
                              Configura la tarifa en Maestros Corporativos → Tarifas
                            </p>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Current line being built */}
                    <div className="space-y-2 rounded-lg border p-3">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                        <Package className="h-3.5 w-3.5" /> Línea actual (detalle menú)
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        El detalle del menú es operativo para cocina. El precio viene de la tarifa del servicio.
                      </p>
                      {contractId && contractGroups.length > 0 && (
                        <div>
                          <Label className="text-xs">Subgrupo</Label>
                          <Select value={currentGroupId || "none"} onValueChange={v => setCurrentGroupId(v === "none" ? "" : v)}>
                            <SelectTrigger className="h-8"><SelectValue placeholder="General" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">General</SelectItem>
                              {contractGroups.map(g => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                      {currentItems.length === 0 ? (
                        <p className="text-xs text-muted-foreground">Selecciona productos del menú →</p>
                      ) : (
                        <>
                          {currentItems.map((c, idx) => (
                            <div key={c.menu_item_id} className="space-y-0.5">
                              <div className="flex items-center justify-between text-sm">
                                <div className="flex items-center gap-0.5">
                                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => {
                                    setCurrentItems(prev => prev.map((it, i) => i === idx ? { ...it, quantity: Math.max(1, it.quantity - 1) } : it));
                                  }}><Minus className="h-3 w-3" /></Button>
                                  <span className="font-medium w-5 text-center text-xs">{c.quantity}</span>
                                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => {
                                    setCurrentItems(prev => prev.map((it, i) => i === idx ? { ...it, quantity: it.quantity + 1 } : it));
                                  }}><Plus className="h-3 w-3" /></Button>
                                  <span className="ml-0.5 text-xs truncate max-w-[150px]">{c.name}</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => setNotesItemIdx(notesItemIdx === idx ? null : idx)}>
                                    <MessageSquare className={`h-3 w-3 ${c.notes ? "text-primary" : "text-muted-foreground"}`} />
                                  </Button>
                                  <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => {
                                    setCurrentItems(prev => prev.filter((_, i) => i !== idx));
                                  }}><X className="h-3 w-3" /></Button>
                                </div>
                              </div>
                              {notesItemIdx === idx && (
                                <div className="ml-14 mr-2">
                                  <Textarea
                                    value={c.notes}
                                    onChange={e => setCurrentItems(prev => prev.map((it, i) => i === idx ? { ...it, notes: e.target.value } : it))}
                                    placeholder="Sin sopa, sin arroz..."
                                    className="text-xs h-16 resize-none"
                                  />
                                </div>
                              )}
                            </div>
                          ))}
                          <Button size="sm" className="w-full" variant="secondary" onClick={addLineToOrder}>
                            <Plus className="h-3.5 w-3.5 mr-1" /> Añadir línea al pedido
                          </Button>
                        </>
                      )}
                    </div>

                    {/* Lines already added */}
                    {lines.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                          <Users className="h-3.5 w-3.5" /> Líneas del pedido ({lines.length})
                        </p>
                        {lines.map((line, idx) => {
                          const lineQty = line.items.reduce((s, it) => s + it.quantity, 0);
                          return (
                            <div key={idx} className="rounded border p-2 space-y-1 bg-muted/10">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-semibold">{line.contractGroupName}</span>
                                <div className="flex items-center gap-1">
                                  <Badge variant="outline" className="text-[10px]">{lineQty} serv.</Badge>
                                  <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => removeLineFromOrder(idx)}>
                                    <X className="h-3 w-3" />
                                  </Button>
                                </div>
                              </div>
                              {line.items.map((it, i) => (
                                <div key={i} className="flex justify-between text-xs text-muted-foreground">
                                  <span>{it.name} ×{it.quantity}</span>
                                </div>
                              ))}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* BILLING SUMMARY */}
                    {(totalServings > 0 && resolvedRate.found) && (
                      <div className="rounded-lg border-2 border-primary/30 bg-primary/5 p-3 space-y-1">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Facturación</p>
                        <div className="flex justify-between text-sm">
                          <span>Servicios ({serviceLabel})</span>
                          <span>{totalServings}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span>Tarifa unitaria</span>
                          <span className="font-mono">${resolvedRate.rate.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between font-bold text-base border-t pt-1">
                          <span>Total</span>
                          <span className="font-mono">${orderTotal.toLocaleString()}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </ScrollArea>

                <div className="border-t p-3 flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={closeDialog}>Cancelar</Button>
                  <Button
                    className="flex-1"
                    onClick={() => createOrder.mutate()}
                    disabled={totalServings === 0 || !companyId || !resolvedRate.found || createOrder.isPending}
                  >
                    Confirmar Pedido
                  </Button>
                </div>
              </div>

              {/* ─── RIGHT: Category Grid + Products ─── */}
              <div className="flex-1 flex flex-col overflow-hidden bg-muted/10">
                <div className="px-4 py-3 border-b">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      value={menuSearch}
                      onChange={e => { setMenuSearch(e.target.value); if (e.target.value.trim()) setSelectedCategory(null); }}
                      placeholder="Buscar producto..."
                      className="pl-9 h-10"
                    />
                    {menuSearch && (
                      <Button variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7" onClick={() => setMenuSearch("")}>
                        <X className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>

                <ScrollArea className="flex-1">
                  {!selectedCategory && !menuSearch.trim() ? (
                    <div className="p-4">
                      <p className="text-sm font-semibold text-muted-foreground mb-3">Selecciona una categoría</p>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        {categories.map(cat => {
                          const count = menuItems.filter((i: any) => (i.category || "General") === cat).length;
                          return (
                            <button
                              key={cat}
                              onClick={() => { setSelectedCategory(cat); setMenuSearch(""); }}
                              className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-border bg-card p-6 text-center transition-all hover:border-primary hover:bg-primary/5 hover:shadow-md active:scale-[0.97]"
                            >
                              <span className="text-lg font-bold">{cat}</span>
                              <span className="text-xs text-muted-foreground">{count} productos</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="p-4">
                      {selectedCategory && !menuSearch.trim() && (
                        <div className="flex items-center gap-2 mb-3">
                          <Button variant="ghost" size="sm" onClick={() => setSelectedCategory(null)} className="gap-1">
                            <ChevronLeft className="h-4 w-4" /> Categorías
                          </Button>
                          <span className="text-sm font-bold">{selectedCategory}</span>
                          <Badge variant="outline" className="ml-auto">{visibleItems.length}</Badge>
                        </div>
                      )}
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                        {visibleItems.map((item: any) => {
                          const inCurrent = currentItems.find(c => c.menu_item_id === item.id);
                          return (
                            <button
                              key={item.id}
                              onClick={() => addItemToCurrentLine(item)}
                              className={`relative flex flex-col items-center justify-center rounded-lg border-2 p-4 text-center transition-all hover:shadow-md active:scale-[0.97] ${
                                inCurrent ? "border-primary bg-primary/10 shadow-sm" : "border-border bg-card hover:border-primary/50"
                              }`}
                            >
                              {inCurrent && (
                                <span className="absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold shadow">
                                  {inCurrent.quantity}
                                </span>
                              )}
                              <span className="font-semibold text-sm leading-tight">{item.name}</span>
                            </button>
                          );
                        })}
                      </div>
                      {visibleItems.length === 0 && (
                        <p className="text-center text-muted-foreground py-8">No se encontraron productos</p>
                      )}
                    </div>
                  )}
                </ScrollArea>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
