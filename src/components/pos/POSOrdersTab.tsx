import { useState, useEffect, useCallback, useRef, useMemo } from "react";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Plus, Send, X, ShoppingCart, Building2, User, LayoutGrid, Minus,
  CreditCard, Tag, ScanBarcode, Printer, Receipt, ChevronLeft, Search,
  MessageSquare,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { printKitchenComanda, printTicket } from "@/lib/pos-printing";
import { openCashDrawer } from "@/lib/pos-hardware";
import { fuzzyMatch } from "@/lib/search-utils";

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
  const [isTestRecord, setIsTestRecord] = useState(false);
  const [filterStatus, setFilterStatus] = useState("active");
  const [filterType, setFilterType] = useState("all");
  const barcodeBufferRef = useRef("");
  const barcodeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [guestSearch, setGuestSearch] = useState("");

  // Category-grid state
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [menuSearch, setMenuSearch] = useState("");
  const [notesItemId, setNotesItemId] = useState<string | null>(null);

  // Step management: 'details' → 'menu' flow
  const [step, setStep] = useState<"details" | "menu">("details");

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

  // Derived: categories from active menu items
  const categories = useMemo(() => {
    const cats = new Set(menuItems.map((i: any) => i.category || "General"));
    return Array.from(cats).sort();
  }, [menuItems]);

  // Items for selected category (or search results)
  const visibleItems = useMemo(() => {
    if (menuSearch.trim()) {
      return menuItems.filter((i: any) => fuzzyMatch(`${i.name} ${i.category} ${i.barcode || ""}`, menuSearch));
    }
    if (!selectedCategory) return [];
    return menuItems.filter((i: any) => (i.category || "General") === selectedCategory);
  }, [menuItems, selectedCategory, menuSearch]);

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
          is_test_record: isTestRecord,
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

      // Auto-deduct inventory for direct_product items
      const directItems = cart.filter(c => {
        const mi = menuItems.find((m: any) => m.id === c.menu_item_id);
        return mi?.item_type === "direct_product" && mi?.linked_product_id;
      });

      if (directItems.length > 0) {
        const movements = directItems.map(c => {
          const mi = menuItems.find((m: any) => m.id === c.menu_item_id) as any;
          return {
            product_id: mi.linked_product_id,
            restaurant_id: restaurantId!,
            user_id: user!.id,
            type: "salida",
            quantity: c.quantity,
            unit_cost: 0,
            total_cost: 0,
            notes: `Venta POS #${order.order_number} — ${c.name}`,
            movement_date: new Date().toISOString(),
          };
        });
        const { error: movErr } = await supabase.from("inventory_movements").insert(movements);
        if (movErr) console.error("Error deducting inventory:", movErr);
      }

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
    setIsTestRecord(false);
    setSelectedCategory(null);
    setMenuSearch("");
    setStep("details");
    setNotesItemId(null);
  };

  const getConsumptionMode = () => {
    if (billingMode === "corporate_charge" || orderType === "company") return "corporate_charge";
    if (destType === "takeaway") return "takeaway";
    return "dine_in";
  };

  const addToCart = useCallback((item: any) => {
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
  }, [companyId, billingMode, orderType, destType, resolveRate]);

  // Global barcode listener
  useEffect(() => {
    if (!creating) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "Enter" && barcodeBufferRef.current.length >= 3) {
        const code = barcodeBufferRef.current.trim();
        barcodeBufferRef.current = "";
        const found = menuItems.find((m: any) => m.barcode === code);
        if (found) { addToCart(found); toast.success(`Escaneado: ${found.name}`); }
        else toast.error(`Código no encontrado: ${code}`);
        return;
      }
      if (e.key.length === 1) {
        barcodeBufferRef.current += e.key;
        if (barcodeTimeoutRef.current) clearTimeout(barcodeTimeoutRef.current);
        barcodeTimeoutRef.current = setTimeout(() => { barcodeBufferRef.current = ""; }, 200);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [creating, menuItems, addToCart]);

  const handlePrintComanda = async (orderId: string) => {
    const { data: order } = await supabase
      .from("pos_orders")
      .select(`*, pos_order_items(*, menu_items(name)), hotel_companies(name), pos_tables(name), contracts(name, code)`)
      .eq("id", orderId)
      .single();
    if (!order) return;
    const destLabel = DEST_OPTIONS.find(d => d.value === order.delivery_destination_type)?.label || order.delivery_destination_type;
    printKitchenComanda({
      orderNumber: order.order_number,
      servicePeriod: order.service_period,
      destination: destLabel,
      destinationDetail: order.delivery_destination_detail || undefined,
      groupLabel: order.order_type === "company" ? (order as any).hotel_companies?.name : undefined,
      items: ((order as any).pos_order_items || []).map((i: any) => ({
        name: i.menu_items?.name || "—",
        quantity: i.quantity,
        notes: i.notes || undefined,
      })),
      createdAt: order.created_at,
    });
  };

  const handlePrintTicket = async (orderId: string) => {
    const { data: order } = await supabase
      .from("pos_orders")
      .select(`*, pos_order_items(*, menu_items(name)), hotel_companies(name), hotel_guests(first_name, last_name)`)
      .eq("id", orderId)
      .single();
    if (!order) return;
    printTicket({
      orderNumber: order.order_number,
      servicePeriod: order.service_period,
      customerName: (order as any).hotel_guests ? `${(order as any).hotel_guests.first_name} ${(order as any).hotel_guests.last_name}` : order.customer_name || undefined,
      companyName: (order as any).hotel_companies?.name || undefined,
      billingMode: (order as any).billing_mode || undefined,
      items: ((order as any).pos_order_items || []).map((i: any) => ({
        name: i.menu_items?.name || "—",
        quantity: i.quantity,
        unit_price: Number(i.unit_price),
        total: Number(i.total),
      })),
      total: Number(order.total),
      createdAt: order.created_at,
    });
    if ((order as any).billing_mode === "cash") {
      openCashDrawer();
    }
  };

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

  const updateCartNotes = (menuItemId: string, notes: string) => {
    setCart(prev => prev.map(c => c.menu_item_id === menuItemId ? { ...c, notes } : c));
  };

  const cartTotal = cart.reduce((sum, c) => sum + c.quantity * c.unit_price, 0);

  const getClientLabel = (o: any) => {
    if (o.order_type === "company") return o.hotel_companies?.name || "Empresa";
    if (o.order_type === "table") return o.pos_tables?.name || "Mesa";
    if (o.hotel_guests) return `${o.hotel_guests.first_name} ${o.hotel_guests.last_name}`;
    return o.customer_name || "Individual";
  };

  const selectedGuest = guests.find(g => g.id === guestId);

  // ─── RENDER ───────────────────────────────────────────────────
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
                {order.order_type === "individual" && (order as any).hotel_companies?.name && (
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    <Building2 className="h-3 w-3" /> {(order as any).hotel_companies.name}
                  </div>
                )}
                {((order as any).contracts?.name || (order as any).contract_groups?.name) && (
                  <div className="text-xs text-muted-foreground">
                    {(order as any).contracts?.name && <span className="font-medium">{(order as any).contracts.name}</span>}
                    {(order as any).contract_groups?.name && <span> → {(order as any).contract_groups.name}</span>}
                  </div>
                )}
                {(order as any).is_test_record && (
                  <Badge variant="destructive" className="text-[10px] px-1 py-0">PRUEBA</Badge>
                )}
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
                  <Button size="sm" variant="secondary" onClick={() => closeOrder.mutate(order.id)}>
                    Cerrar pedido
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={() => handlePrintComanda(order.id)}>
                  <Printer className="h-3.5 w-3.5 mr-1" />Comanda
                </Button>
                <Button size="sm" variant="outline" onClick={() => handlePrintTicket(order.id)}>
                  <Receipt className="h-3.5 w-3.5 mr-1" />Ticket
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ═══ NEW ORDER DIALOG ═══ */}
      <Dialog open={creating} onOpenChange={v => !v && closeCreateDialog()}>
        <DialogContent className="max-w-5xl max-h-[95vh] overflow-hidden p-0">
          <div className="flex flex-col h-[90vh]">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-3 border-b bg-muted/30">
              <DialogTitle className="text-lg">Nuevo Pedido</DialogTitle>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <ScanBarcode className="h-3.5 w-3.5" />
                  Lector activo
                </div>
                <div className="flex items-center gap-1.5">
                  <Switch checked={isTestRecord} onCheckedChange={setIsTestRecord} id="test-toggle" />
                  <Label htmlFor="test-toggle" className="text-xs cursor-pointer">Prueba</Label>
                </div>
              </div>
            </div>

            <div className="flex flex-1 overflow-hidden">
              {/* ─── LEFT: Order config + Cart ─── */}
              <div className="w-[340px] border-r flex flex-col bg-background">
                <ScrollArea className="flex-1">
                  <div className="p-4 space-y-3">
                    {/* Order type */}
                    <div>
                      <Label className="text-xs">Tipo</Label>
                      <Select value={orderType} onValueChange={(v: any) => { setOrderType(v); setCompanyId(""); setContractId(""); setContractGroupId(""); setGuestId(""); setCustomerName(""); setTimeout(recalcCartPrices, 0); }}>
                        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="company">Empresa</SelectItem>
                          <SelectItem value="individual">Individual</SelectItem>
                          <SelectItem value="table">Mesa</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Company */}
                    {(orderType === "company" || orderType === "individual") && (
                      <div>
                        <Label className="text-xs">{orderType === "company" ? "Empresa" : "Empresa (opc.)"}</Label>
                        <Select value={companyId} onValueChange={(v) => { setCompanyId(v); setContractId(""); setContractGroupId(""); setTimeout(recalcCartPrices, 0); }}>
                          <SelectTrigger className="h-9"><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                          <SelectContent>
                            {orderType === "individual" && <SelectItem value="none">Sin empresa</SelectItem>}
                            {companies.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {/* Contract */}
                    {companyId && companyId !== "none" && contracts.length > 0 && (
                      <div>
                        <Label className="text-xs">Contrato (opc.)</Label>
                        <Select value={contractId || "none"} onValueChange={(v) => { setContractId(v === "none" ? "" : v); setContractGroupId(""); }}>
                          <SelectTrigger className="h-9"><SelectValue placeholder="Sin contrato" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Sin contrato</SelectItem>
                            {contracts.map(c => <SelectItem key={c.id} value={c.id}>{c.name}{c.code ? ` (${c.code})` : ""}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {/* Contract group */}
                    {contractId && contractGroups.length > 0 && (
                      <div>
                        <Label className="text-xs">Subgrupo (opc.)</Label>
                        <Select value={contractGroupId || "none"} onValueChange={(v) => setContractGroupId(v === "none" ? "" : v)}>
                          <SelectTrigger className="h-9"><SelectValue placeholder="Sin subgrupo" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Sin subgrupo</SelectItem>
                            {contractGroups.map(g => <SelectItem key={g.id} value={g.id}>{g.name}{g.group_type ? ` (${g.group_type})` : ""}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {/* Guest/client */}
                    {orderType === "individual" && (
                      <div className="space-y-1">
                        <Label className="text-xs">Cliente</Label>
                        <Input value={guestSearch} onChange={e => { setGuestSearch(e.target.value); setGuestId(""); }} placeholder="Buscar..." className="h-9" />
                        {guestSearch.length >= 2 && !guestId && guests.length > 0 && (
                          <div className="border rounded-md max-h-24 overflow-y-auto">
                            {guests.map(g => (
                              <button key={g.id} type="button" className="w-full text-left px-2 py-1 text-sm hover:bg-accent" onClick={() => { setGuestId(g.id); setCustomerName(`${g.first_name} ${g.last_name}`); setGuestSearch(`${g.first_name} ${g.last_name}`); }}>
                                <span className="font-medium">{g.first_name} {g.last_name}</span>
                                <span className="text-muted-foreground ml-1 text-xs">{g.document_number}</span>
                              </button>
                            ))}
                          </div>
                        )}
                        {!guestId && <Input value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Nombre manual" className="h-9" />}
                      </div>
                    )}

                    {orderType === "table" && (
                      <div>
                        <Label className="text-xs">Mesa</Label>
                        <Select value={tableId} onValueChange={setTableId}>
                          <SelectTrigger className="h-9"><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                          <SelectContent>
                            {tables.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {/* Service, billing, dest */}
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
                        <Label className="text-xs">Cobro</Label>
                        <Select value={billingMode} onValueChange={(v) => { setBillingMode(v); setTimeout(recalcCartPrices, 0); }}>
                          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {BILLING_MODE_OPTIONS.map(b => <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs">Destino</Label>
                        <Select value={destType} onValueChange={(v) => { setDestType(v); setTimeout(recalcCartPrices, 0); }}>
                          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {DEST_OPTIONS.map(d => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs">Detalle</Label>
                        <Input value={destDetail} onChange={e => setDestDetail(e.target.value)} placeholder="Ej: Mesa 4" className="h-9" />
                      </div>
                    </div>
                  </div>

                  {/* ─── CART ─── */}
                  <div className="border-t p-4 space-y-2">
                    <div className="font-semibold flex items-center gap-1 text-sm">
                      <ShoppingCart className="h-4 w-4" /> Pedido ({cart.length})
                    </div>
                    {cart.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Selecciona productos del menú →</p>
                    ) : (
                      <>
                        {cart.map(c => (
                          <div key={c.menu_item_id} className="space-y-0.5">
                            <div className="flex items-center justify-between text-sm">
                              <div className="flex items-center gap-0.5">
                                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => updateCartQty(c.menu_item_id, -1)}>
                                  <Minus className="h-3 w-3" />
                                </Button>
                                <span className="font-medium w-5 text-center text-xs">{c.quantity}</span>
                                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => updateCartQty(c.menu_item_id, 1)}>
                                  <Plus className="h-3 w-3" />
                                </Button>
                                <span className="ml-0.5 text-xs truncate max-w-[120px]">{c.name}</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <span className="text-xs">${(c.quantity * c.unit_price).toLocaleString()}</span>
                                <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => setNotesItemId(notesItemId === c.menu_item_id ? null : c.menu_item_id)}>
                                  <MessageSquare className={`h-3 w-3 ${c.notes ? "text-primary" : "text-muted-foreground"}`} />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => removeFromCart(c.menu_item_id)}>
                                  <X className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                            {c.rate_source !== "menu_base" && (
                              <div className="flex items-center gap-1 ml-14 text-[10px] text-muted-foreground">
                                <Tag className="h-2.5 w-2.5" />
                                {RATE_SOURCE_LABELS[c.rate_source] || c.rate_source}
                              </div>
                            )}
                            {notesItemId === c.menu_item_id && (
                              <div className="ml-14 mr-2">
                                <Textarea
                                  value={c.notes}
                                  onChange={e => updateCartNotes(c.menu_item_id, e.target.value)}
                                  placeholder="Sin sopa, sin arroz..."
                                  className="text-xs h-16 resize-none"
                                />
                              </div>
                            )}
                          </div>
                        ))}
                        <div className="border-t pt-2 flex justify-between font-semibold text-sm">
                          <span>Total</span>
                          <span>${cartTotal.toLocaleString()}</span>
                        </div>
                      </>
                    )}
                  </div>
                </ScrollArea>

                {/* Bottom actions */}
                <div className="border-t p-3 flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={closeCreateDialog}>Cancelar</Button>
                  <Button className="flex-1" onClick={() => createOrder.mutate()} disabled={cart.length === 0 || createOrder.isPending}>
                    Crear Pedido
                  </Button>
                </div>
              </div>

              {/* ─── RIGHT: Category Grid + Products ─── */}
              <div className="flex-1 flex flex-col overflow-hidden bg-muted/10">
                {/* Search bar */}
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

                {/* Category selection OR product grid */}
                <ScrollArea className="flex-1">
                  {!selectedCategory && !menuSearch.trim() ? (
                    /* ── CATEGORY BUTTONS ── */
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
                              <span className="text-xs text-muted-foreground">{count} {count === 1 ? "producto" : "productos"}</span>
                            </button>
                          );
                        })}
                        {categories.length === 0 && (
                          <p className="col-span-full text-center text-muted-foreground py-8">No hay ítems en el menú. Configúralos en la pestaña Menú.</p>
                        )}
                      </div>
                    </div>
                  ) : (
                    /* ── PRODUCT GRID ── */
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
                      {menuSearch.trim() && (
                        <p className="text-sm text-muted-foreground mb-3">
                          Resultados para "<span className="font-medium">{menuSearch}</span>" ({visibleItems.length})
                        </p>
                      )}
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                        {visibleItems.map((item: any) => {
                          const inCart = cart.find(c => c.menu_item_id === item.id);
                          return (
                            <button
                              key={item.id}
                              onClick={() => addToCart(item)}
                              className={`relative flex flex-col items-center justify-center rounded-lg border-2 p-4 text-center transition-all hover:shadow-md active:scale-[0.97] ${
                                inCart
                                  ? "border-primary bg-primary/10 shadow-sm"
                                  : "border-border bg-card hover:border-primary/50"
                              }`}
                            >
                              {inCart && (
                                <span className="absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold shadow">
                                  {inCart.quantity}
                                </span>
                              )}
                              <span className="font-semibold text-sm leading-tight">{item.name}</span>
                              <span className="text-xs text-muted-foreground mt-1">${Number(item.price).toLocaleString()}</span>
                              {menuSearch.trim() && (
                                <span className="text-[10px] text-muted-foreground mt-0.5">{item.category}</span>
                              )}
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
