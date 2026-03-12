import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurantId } from "@/hooks/use-restaurant";
import { useAuth } from "@/lib/auth";
import { useServiceRates } from "@/hooks/use-service-rates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Plus, Send, X, ShoppingCart, Building2, User, LayoutGrid, Minus, CreditCard, Tag } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

const SERVICE_OPTIONS = [
  { value: "breakfast", label: "Desayuno" },
  { value: "lunch", label: "Almuerzo" },
  { value: "dinner", label: "Cena" },
  { value: "snack", label: "Lonche" },
];

const DEST_OPTIONS = [
  { value: "dining_area", label: "Comedor" },
  { value: "table", label: "Mesa" },
  { value: "takeaway", label: "Para llevar" },
  { value: "room", label: "Habitación" },
  { value: "reception", label: "Recepción" },
  { value: "company_area", label: "Área empresa" },
  { value: "other", label: "Otro" },
];

const BILLING_MODE_OPTIONS = [
  { value: "corporate_charge", label: "Cargo corporativo" },
  { value: "individual_account", label: "Cuenta individual" },
  { value: "cash", label: "Efectivo" },
];

const BILLING_MODE_LABELS: Record<string, string> = {
  corporate_charge: "Cargo corporativo",
  individual_account: "Cuenta individual",
  cash: "Efectivo",
};

const STATUS_LABELS: Record<string, string> = {
  open: "Abierto", sent_to_kitchen: "En cocina", served: "Servido", closed: "Cerrado", cancelled: "Cancelado",
};

const STATUS_COLORS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  open: "outline", sent_to_kitchen: "default", served: "secondary", closed: "secondary", cancelled: "destructive",
};

interface CartItem {
  menu_item_id: string;
  name: string;
  quantity: number;
  unit_price: number;
  base_price: number;
  rate_source: string;
  notes: string;
}

const RATE_SOURCE_LABELS: Record<string, string> = {
  company_mode: "Empresa + modalidad",
  company_general: "Empresa",
  mode_general: "Modalidad",
  menu_base: "Base",
};

export default function POSOrdersTab() {
  const restaurantId = useRestaurantId();
  const { user } = useAuth();
  const qc = useQueryClient();
  const { resolveRate } = useServiceRates();

  const [creating, setCreating] = useState(false);
  const [orderType, setOrderType] = useState<"company" | "individual" | "table">("individual");
  const [companyId, setCompanyId] = useState("");
  const [contractId, setContractId] = useState("");
  const [contractGroupId, setContractGroupId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [guestId, setGuestId] = useState("");
  const [tableId, setTableId] = useState("");
  const [servicePeriod, setServicePeriod] = useState("lunch");
  const [destType, setDestType] = useState("dining_area");
  const [destDetail, setDestDetail] = useState("");
  const [billingMode, setBillingMode] = useState("corporate_charge");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [filterStatus, setFilterStatus] = useState("active");
  const [filterType, setFilterType] = useState("all");
  const [guestSearch, setGuestSearch] = useState("");

  // Queries
  const { data: orders = [] } = useQuery({
    queryKey: ["pos-orders", restaurantId, filterStatus, filterType],
    queryFn: async () => {
      let q = supabase
        .from("pos_orders")
        .select(`*, hotel_companies(name), pos_tables(name), hotel_guests(first_name, last_name), contracts(name, code), contract_groups(name)`)
        .eq("restaurant_id", restaurantId!)
        .order("created_at", { ascending: false })
        .limit(100);

      if (filterStatus === "active") {
        q = q.in("status", ["open", "sent_to_kitchen", "served"]);
      } else if (filterStatus !== "all") {
        q = q.eq("status", filterStatus);
      }
      if (filterType !== "all") {
        q = q.eq("order_type", filterType);
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
        .from("menu_items")
        .select("*")
        .eq("restaurant_id", restaurantId!)
        .eq("active", true)
        .order("category")
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!restaurantId,
  });

  const { data: companies = [] } = useQuery({
    queryKey: ["hotel-companies", restaurantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hotel_companies")
        .select("id, name")
        .eq("restaurant_id", restaurantId!)
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!restaurantId,
  });

  const { data: contracts = [] } = useQuery({
    queryKey: ["contracts-active", restaurantId, companyId],
    queryFn: async () => {
      let q = supabase
        .from("contracts")
        .select("id, name, code, company_id")
        .eq("restaurant_id", restaurantId!)
        .eq("active", true)
        .order("name");
      if (companyId && companyId !== "none") {
        q = q.eq("company_id", companyId);
      }
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
    enabled: !!restaurantId && !!companyId && companyId !== "none",
  });

  const { data: contractGroups = [] } = useQuery({
    queryKey: ["contract-groups-active", restaurantId, contractId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contract_groups")
        .select("id, name, group_type")
        .eq("restaurant_id", restaurantId!)
        .eq("contract_id", contractId)
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!restaurantId && !!contractId,
  });

  const { data: guests = [] } = useQuery({
    queryKey: ["hotel-guests-pos", restaurantId, guestSearch],
    queryFn: async () => {
      let q = supabase
        .from("hotel_guests")
        .select("id, first_name, last_name, document_number")
        .eq("restaurant_id", restaurantId!)
        .order("last_name")
        .limit(50);
      if (guestSearch.length >= 2) {
        q = q.or(`first_name.ilike.%${guestSearch}%,last_name.ilike.%${guestSearch}%,document_number.ilike.%${guestSearch}%`);
      }
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
    enabled: !!restaurantId && (orderType === "individual" || orderType === "company"),
  });

  const { data: tables = [] } = useQuery({
    queryKey: ["pos-tables-active", restaurantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pos_tables")
        .select("id, name")
        .eq("restaurant_id", restaurantId!)
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!restaurantId && orderType === "table",
  });

  const createOrder = useMutation({
    mutationFn: async () => {
      if (cart.length === 0) throw new Error("Agrega al menos un ítem");

      const { data: order, error } = await supabase
        .from("pos_orders")
        .insert({
          restaurant_id: restaurantId!,
          order_type: orderType,
          company_id: companyId && companyId !== "none" ? companyId : null,
          contract_id: contractId || null,
          contract_group_id: contractGroupId || null,
          customer_name: orderType === "individual" ? customerName || null : null,
          guest_id: guestId || null,
          table_id: orderType === "table" ? tableId || null : null,
          service_period: servicePeriod,
          delivery_destination_type: destType,
          delivery_destination_detail: destDetail || null,
          billing_mode: billingMode,
          created_by: user!.id,
          status: "open",
        } as any)
        .select()
        .single();
      if (error) throw error;

      const items = cart.map(c => ({
        order_id: order.id,
        menu_item_id: c.menu_item_id,
        quantity: c.quantity,
        unit_price: c.unit_price,
        rate_applied: c.unit_price,
        rate_source: c.rate_source,
        notes: c.notes || null,
      } as any));

      const { error: itemsErr } = await supabase.from("pos_order_items").insert(items);
      if (itemsErr) throw itemsErr;

      return order;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pos-orders"] });
      toast.success("Pedido creado");
      closeCreateDialog();
    },
    onError: (e: any) => toast.error(e.message || "Error al crear pedido"),
  });

  const sendToKitchen = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("pos_orders").update({ status: "sent_to_kitchen" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pos-orders"] });
      qc.invalidateQueries({ queryKey: ["pos-kitchen-orders"] });
      toast.success("Pedido enviado a cocina");
    },
  });

  const closeOrder = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("pos_orders").update({ status: "closed" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pos-orders"] });
      toast.success("Pedido cerrado");
    },
  });

  const cancelOrder = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("pos_orders").update({ status: "cancelled" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pos-orders"] });
      toast.success("Pedido cancelado");
    },
  });

  const closeCreateDialog = () => {
    setCreating(false);
    setOrderType("individual");
    setCompanyId("");
    setContractId("");
    setContractGroupId("");
    setCustomerName("");
    setGuestId("");
    setTableId("");
    setServicePeriod("lunch");
    setDestType("dining_area");
    setDestDetail("");
    setBillingMode("corporate_charge");
    setCart([]);
    setGuestSearch("");
  };

  // Determine consumption mode for rate resolution
  const getConsumptionMode = () => {
    if (billingMode === "corporate_charge" || orderType === "company") return "corporate_charge";
    if (destType === "takeaway") return "takeaway";
    return "dine_in";
  };

  const addToCart = (item: any) => {
    const mode = getConsumptionMode();
    const effectiveCompanyId = companyId && companyId !== "none" ? companyId : null;
    const resolved = resolveRate(item.id, Number(item.price), mode, effectiveCompanyId);
    
    setCart(prev => {
      const existing = prev.find(c => c.menu_item_id === item.id);
      if (existing) {
        return prev.map(c => c.menu_item_id === item.id ? { ...c, quantity: c.quantity + 1 } : c);
      }
      return [...prev, {
        menu_item_id: item.id,
        name: item.name,
        quantity: 1,
        unit_price: resolved.price,
        base_price: Number(item.price),
        rate_source: resolved.source,
        notes: "",
      }];
    });
  };

  // Recalculate cart prices when billing mode, dest type, or company changes
  const recalcCartPrices = () => {
    const mode = getConsumptionMode();
    const effectiveCompanyId = companyId && companyId !== "none" ? companyId : null;
    setCart(prev => prev.map(c => {
      const resolved = resolveRate(c.menu_item_id, c.base_price, mode, effectiveCompanyId);
      return { ...c, unit_price: resolved.price, rate_source: resolved.source };
    }));
  };

  const updateCartQty = (menuItemId: string, delta: number) => {
    setCart(prev => prev.map(c => {
      if (c.menu_item_id === menuItemId) {
        const newQty = c.quantity + delta;
        return newQty > 0 ? { ...c, quantity: newQty } : c;
      }
      return c;
    }).filter(c => c.quantity > 0));
  };

  const removeFromCart = (menuItemId: string) => {
    setCart(prev => prev.filter(c => c.menu_item_id !== menuItemId));
  };

  const cartTotal = cart.reduce((sum, c) => sum + c.quantity * c.unit_price, 0);

  const getClientLabel = (o: any) => {
    if (o.order_type === "company") return o.hotel_companies?.name || "Empresa";
    if (o.order_type === "table") return o.pos_tables?.name || "Mesa";
    // For individual: show guest name if available
    if (o.hotel_guests) return `${o.hotel_guests.first_name} ${o.hotel_guests.last_name}`;
    return o.customer_name || "Individual";
  };

  // Group menu items by category
  const grouped = menuItems.reduce((acc: Record<string, any[]>, item) => {
    const cat = item.category || "General";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {});

  const selectedGuest = guests.find(g => g.id === guestId);

  return (
    <div className="space-y-4">
      {/* Top bar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Pedidos POS</h2>
        <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4 mr-1" />Nuevo Pedido</Button>
      </div>

      {/* Filters */}
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
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los tipos</SelectItem>
            <SelectItem value="company">Empresa</SelectItem>
            <SelectItem value="individual">Individual</SelectItem>
            <SelectItem value="table">Mesa</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Orders grid */}
      {orders.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">No hay pedidos</div>
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
                  {order.order_type === "company" && <Building2 className="h-3.5 w-3.5" />}
                  {order.order_type === "individual" && <User className="h-3.5 w-3.5" />}
                  {order.order_type === "table" && <LayoutGrid className="h-3.5 w-3.5" />}
                  {getClientLabel(order)}
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{format(new Date(order.created_at), "HH:mm · dd/MM")}</span>
                  <span>·</span>
                  <span>${Number(order.total).toLocaleString()}</span>
                  {(order as any).billing_mode && (
                    <>
                      <span>·</span>
                      <Badge variant="outline" className="text-[10px] px-1 py-0">
                        <CreditCard className="h-2.5 w-2.5 mr-0.5" />
                        {BILLING_MODE_LABELS[(order as any).billing_mode] || (order as any).billing_mode}
                      </Badge>
                    </>
                  )}
                </div>
                {/* Show company association for individual orders */}
                {order.order_type === "individual" && (order as any).hotel_companies?.name && (
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    <Building2 className="h-3 w-3" /> {(order as any).hotel_companies.name}
                  </div>
                )}
              </CardHeader>
              <CardContent className="flex gap-1 flex-wrap">
                {order.status === "open" && (
                  <>
                    <Button size="sm" variant="default" onClick={() => sendToKitchen.mutate(order.id)}>
                      <Send className="h-3.5 w-3.5 mr-1" />Enviar a cocina
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => cancelOrder.mutate(order.id)}>
                      <X className="h-3.5 w-3.5 mr-1" />Cancelar
                    </Button>
                  </>
                )}
                {order.status === "served" && (
                  <Button size="sm" variant="secondary" onClick={() => closeOrder.mutate(order.id)}>
                    Cerrar pedido
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* New order dialog */}
      <Dialog open={creating} onOpenChange={v => !v && closeCreateDialog()}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Nuevo Pedido</DialogTitle></DialogHeader>

          <div className="grid gap-4 md:grid-cols-2">
            {/* Left: Order details */}
            <div className="space-y-3">
              <div>
                <Label>Tipo de pedido</Label>
                <Select value={orderType} onValueChange={(v: any) => { setOrderType(v); setCompanyId(""); setContractId(""); setContractGroupId(""); setGuestId(""); setCustomerName(""); setTimeout(recalcCartPrices, 0); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="company">Empresa</SelectItem>
                    <SelectItem value="individual">Individual</SelectItem>
                    <SelectItem value="table">Mesa</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Company selector - shown for company AND individual (optional association) */}
              {(orderType === "company" || orderType === "individual") && (
                <div>
                  <Label>{orderType === "company" ? "Empresa" : "Empresa asociada (opcional)"}</Label>
                  <Select value={companyId} onValueChange={(v) => { setCompanyId(v); setTimeout(recalcCartPrices, 0); }}>
                    <SelectTrigger><SelectValue placeholder="Seleccionar empresa..." /></SelectTrigger>
                    <SelectContent>
                      {orderType === "individual" && <SelectItem value="none">Sin empresa</SelectItem>}
                      {companies.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Guest/client selector for individual orders */}
              {orderType === "individual" && (
                <div className="space-y-1">
                  <Label>Cliente / Trabajador</Label>
                  <Input
                    value={guestSearch}
                    onChange={e => { setGuestSearch(e.target.value); setGuestId(""); }}
                    placeholder="Buscar por nombre o documento..."
                    className="mb-1"
                  />
                  {guestSearch.length >= 2 && !guestId && guests.length > 0 && (
                    <div className="border rounded-md max-h-32 overflow-y-auto">
                      {guests.map(g => (
                        <button
                          key={g.id}
                          type="button"
                          className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent transition-colors"
                          onClick={() => {
                            setGuestId(g.id);
                            setCustomerName(`${g.first_name} ${g.last_name}`);
                            setGuestSearch(`${g.first_name} ${g.last_name}`);
                          }}
                        >
                          <span className="font-medium">{g.first_name} {g.last_name}</span>
                          <span className="text-muted-foreground ml-2 text-xs">{g.document_number}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {selectedGuest && (
                    <div className="text-xs text-muted-foreground flex items-center gap-1">
                      <User className="h-3 w-3" />
                      Seleccionado: {selectedGuest.first_name} {selectedGuest.last_name}
                    </div>
                  )}
                  {!guestId && (
                    <Input
                      value={customerName}
                      onChange={e => setCustomerName(e.target.value)}
                      placeholder="O escribir nombre manualmente"
                      className="mt-1"
                    />
                  )}
                </div>
              )}

              {orderType === "table" && (
                <div>
                  <Label>Mesa</Label>
                  <Select value={tableId} onValueChange={setTableId}>
                    <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                    <SelectContent>
                      {tables.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div>
                <Label>Servicio</Label>
                <Select value={servicePeriod} onValueChange={setServicePeriod}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SERVICE_OPTIONS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Modo de cobro</Label>
                <Select value={billingMode} onValueChange={(v) => { setBillingMode(v); setTimeout(recalcCartPrices, 0); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {BILLING_MODE_OPTIONS.map(b => <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Destino de entrega</Label>
                <Select value={destType} onValueChange={(v) => { setDestType(v); setTimeout(recalcCartPrices, 0); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DEST_OPTIONS.map(d => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Detalle destino</Label>
                <Input value={destDetail} onChange={e => setDestDetail(e.target.value)} placeholder="Ej: Mesa 4, Portería, Hab. 203" />
              </div>

              {/* Cart */}
              <div className="border rounded-lg p-3 space-y-2">
                <div className="font-semibold flex items-center gap-1">
                  <ShoppingCart className="h-4 w-4" /> Pedido ({cart.length} ítems)
                </div>
                {cart.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Selecciona ítems del menú →</p>
                ) : (
                  <>
                    {cart.map(c => (
                      <div key={c.menu_item_id} className="space-y-0.5">
                        <div className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => updateCartQty(c.menu_item_id, -1)}>
                              <Minus className="h-3 w-3" />
                            </Button>
                            <span className="font-medium w-6 text-center">{c.quantity}</span>
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => updateCartQty(c.menu_item_id, 1)}>
                              <Plus className="h-3 w-3" />
                            </Button>
                            <span className="ml-1">{c.name}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span>${(c.quantity * c.unit_price).toLocaleString()}</span>
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeFromCart(c.menu_item_id)}>
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                        {c.rate_source !== "menu_base" && (
                          <div className="flex items-center gap-1 ml-16 text-[10px] text-muted-foreground">
                            <Tag className="h-2.5 w-2.5" />
                            Tarifa: {RATE_SOURCE_LABELS[c.rate_source] || c.rate_source}
                            {c.base_price !== c.unit_price && (
                              <span>(base: ${c.base_price.toLocaleString()})</span>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                    <div className="border-t pt-2 flex justify-between font-semibold">
                      <span>Total</span>
                      <span>${cartTotal.toLocaleString()}</span>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Right: Menu */}
            <div className="space-y-3 max-h-[60vh] overflow-y-auto border rounded-lg p-3">
              <div className="font-semibold sticky top-0 bg-background pb-2">Menú</div>
              {Object.entries(grouped).map(([cat, items]) => (
                <div key={cat}>
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">{cat}</div>
                  <div className="space-y-1">
                    {(items as any[]).map(item => (
                      <Button
                        key={item.id}
                        variant="outline"
                        className="w-full justify-between h-auto py-2"
                        onClick={() => addToCart(item)}
                      >
                        <span className="text-left">{item.name}</span>
                        <span className="text-muted-foreground">${Number(item.price).toLocaleString()}</span>
                      </Button>
                    ))}
                  </div>
                </div>
              ))}
              {menuItems.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">No hay ítems en el menú. Configúralos en la pestaña Menú.</p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeCreateDialog}>Cancelar</Button>
            <Button onClick={() => createOrder.mutate()} disabled={cart.length === 0 || createOrder.isPending}>
              Crear Pedido
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
