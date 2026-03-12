import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurantId } from "@/hooks/use-restaurant";
import { useAuth } from "@/lib/auth";
import { useServiceRates } from "@/hooks/use-service-rates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  Plus, Send, X, ShoppingCart, Building2, User, Minus,
  CreditCard, Tag, ScanBarcode, Printer, Receipt, Search,
  MessageSquare, Zap, LayoutGrid, ChevronLeft, DollarSign,
  Package,
} from "lucide-react";
import { toast } from "sonner";
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
  { value: "cash", label: "Efectivo" },
  { value: "corporate_charge", label: "Cargo empresa" },
  { value: "individual_account", label: "Cuenta individual" },
];

const RATE_SOURCE_LABELS: Record<string, string> = {
  company_mode: "Empresa + modalidad",
  company_general: "Empresa",
  mode_general: "Modalidad",
  menu_base: "Base",
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

export default function POSRestaurantTab() {
  const restaurantId = useRestaurantId();
  const { user } = useAuth();
  const qc = useQueryClient();
  const { resolveRate } = useServiceRates();

  // Mode: 'quick' or 'table'
  const [mode, setMode] = useState<"quick" | "table">("quick");
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);

  // Order context (collapsible)
  const [showContext, setShowContext] = useState(false);
  const [companyId, setCompanyId] = useState("");
  const [contractId, setContractId] = useState("");
  const [contractGroupId, setContractGroupId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [guestId, setGuestId] = useState("");
  const [guestSearch, setGuestSearch] = useState("");
  const [servicePeriod, setServicePeriod] = useState("lunch");
  const [destType, setDestType] = useState("dining_area");
  const [destDetail, setDestDetail] = useState("");
  const [billingMode, setBillingMode] = useState("cash");
  const [isTestRecord, setIsTestRecord] = useState(false);

  // Cart
  const [cart, setCart] = useState<CartItem[]>([]);
  const [notesItemId, setNotesItemId] = useState<string | null>(null);

  // Menu navigation
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [menuSearch, setMenuSearch] = useState("");

  // Barcode
  const barcodeBufferRef = useRef("");
  const barcodeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Checkout dialog
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  // Queries
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

  const { data: tables = [] } = useQuery({
    queryKey: ["pos-tables-active", restaurantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pos_tables").select("*")
        .eq("restaurant_id", restaurantId!).eq("active", true)
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
    enabled: !!restaurantId && !!companyId && companyId !== "none",
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

  const { data: guests = [] } = useQuery({
    queryKey: ["hotel-guests-pos", restaurantId, guestSearch],
    queryFn: async () => {
      let q = supabase
        .from("hotel_guests").select("id, first_name, last_name, document_number")
        .eq("restaurant_id", restaurantId!).order("last_name").limit(50);
      if (guestSearch.length >= 2) {
        q = q.or(`first_name.ilike.%${guestSearch}%,last_name.ilike.%${guestSearch}%,document_number.ilike.%${guestSearch}%`);
      }
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
    enabled: !!restaurantId && guestSearch.length >= 2,
  });

  // Derived
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

  const getConsumptionMode = () => {
    if (billingMode === "corporate_charge") return "corporate_charge";
    if (destType === "takeaway") return "takeaway";
    return "dine_in";
  };

  const addToCart = useCallback((item: any) => {
    const consumptionMode = getConsumptionMode();
    const effectiveCompanyId = companyId && companyId !== "none" ? companyId : null;
    const resolved = resolveRate(item.id, Number(item.price), consumptionMode, effectiveCompanyId);
    setCart(prev => {
      const existing = prev.find(c => c.menu_item_id === item.id);
      if (existing) {
        return prev.map(c => c.menu_item_id === item.id ? { ...c, quantity: c.quantity + 1 } : c);
      }
      return [...prev, {
        menu_item_id: item.id, name: item.name, quantity: 1,
        unit_price: resolved.price, base_price: Number(item.price),
        rate_source: resolved.source, notes: "",
      }];
    });
  }, [companyId, billingMode, destType, resolveRate]);

  const recalcCartPrices = useCallback(() => {
    const m = getConsumptionMode();
    const eid = companyId && companyId !== "none" ? companyId : null;
    setCart(prev => prev.map(c => {
      const resolved = resolveRate(c.menu_item_id, c.base_price, m, eid);
      return { ...c, unit_price: resolved.price, rate_source: resolved.source };
    }));
  }, [companyId, billingMode, destType, resolveRate]);

  const updateCartQty = (menuItemId: string, delta: number) => {
    setCart(prev => prev.map(c => {
      if (c.menu_item_id === menuItemId) {
        const newQty = c.quantity + delta;
        return newQty > 0 ? { ...c, quantity: newQty } : c;
      }
      return c;
    }).filter(c => c.quantity > 0));
  };

  const removeFromCart = (menuItemId: string) => setCart(prev => prev.filter(c => c.menu_item_id !== menuItemId));
  const updateCartNotes = (menuItemId: string, notes: string) => setCart(prev => prev.map(c => c.menu_item_id === menuItemId ? { ...c, notes } : c));
  const cartTotal = cart.reduce((sum, c) => sum + c.quantity * c.unit_price, 0);

  // Barcode listener
  useEffect(() => {
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
  }, [menuItems, addToCart]);

  // Create order
  const createOrder = useMutation({
    mutationFn: async () => {
      if (cart.length === 0) throw new Error("Agrega al menos un ítem");
      const orderType = companyId && companyId !== "none" ? "company" : selectedTableId ? "table" : "individual";

      const { data: order, error } = await supabase
        .from("pos_orders")
        .insert({
          restaurant_id: restaurantId!,
          order_type: orderType,
          company_id: companyId && companyId !== "none" ? companyId : null,
          contract_id: contractId || null,
          contract_group_id: contractGroupId || null,
          customer_name: customerName || null,
          guest_id: guestId || null,
          table_id: selectedTableId || null,
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
            notes: `Venta POS #${order.order_number} — ${c.name}`,
            movement_date: new Date().toISOString(), source_module: "POS",
          };
        });
        await supabase.from("inventory_movements").insert(movements);
      }

      // Update table status if applicable
      if (selectedTableId) {
        await supabase.from("pos_tables").update({ status: "occupied" }).eq("id", selectedTableId);
      }

      return order;
    },
    onSuccess: async (order) => {
      qc.invalidateQueries({ queryKey: ["pos-orders"] });
      qc.invalidateQueries({ queryKey: ["pos-tables-active"] });
      qc.invalidateQueries({ queryKey: ["pos-kitchen-orders"] });
      toast.success(`Pedido ${order.order_number} creado`);
      resetOrder();
    },
    onError: (e: any) => toast.error(e.message || "Error"),
  });

  const sendAndCreate = useMutation({
    mutationFn: async () => {
      if (cart.length === 0) throw new Error("Agrega al menos un ítem");
      // Create then send to kitchen
      const order = await createOrder.mutateAsync();
      await supabase.from("pos_orders").update({ status: "sent_to_kitchen" }).eq("id", order.id);
      return order;
    },
    onSuccess: (order) => {
      qc.invalidateQueries({ queryKey: ["pos-orders"] });
      qc.invalidateQueries({ queryKey: ["pos-kitchen-orders"] });
      toast.success(`Pedido ${order.order_number} enviado a cocina`);
    },
  });

  const resetOrder = () => {
    setCart([]);
    setCompanyId("");
    setContractId("");
    setContractGroupId("");
    setCustomerName("");
    setGuestId("");
    setGuestSearch("");
    setDestType("dining_area");
    setDestDetail("");
    setBillingMode("cash");
    setIsTestRecord(false);
    setNotesItemId(null);
    setShowContext(false);
    if (mode === "table") setSelectedTableId(null);
    setSelectedCategory(null);
    setMenuSearch("");
    setCheckoutOpen(false);
  };

  const selectedTable = tables.find(t => t.id === selectedTableId);

  // ─── TABLE MODE: Table Grid ───────────────────────────────
  if (mode === "table" && !selectedTableId) {
    return (
      <div className="h-[calc(100vh-140px)] flex flex-col">
        {/* Mode switcher */}
        <div className="flex items-center gap-2 mb-4">
          <Button variant="outline" size="sm" onClick={() => setMode("quick")}>
            <Zap className="h-4 w-4 mr-1" />Venta Rápida
          </Button>
          <Button variant="default" size="sm" onClick={() => setMode("table")}>
            <LayoutGrid className="h-4 w-4 mr-1" />Mesa
          </Button>
        </div>

        <h3 className="text-lg font-semibold mb-3">Selecciona una mesa</h3>
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
          {tables.map(t => {
            const isOccupied = t.status === "occupied";
            return (
              <button
                key={t.id}
                onClick={() => { setSelectedTableId(t.id); setDestType("table"); setDestDetail(t.name); }}
                className={`flex flex-col items-center justify-center rounded-xl border-2 p-6 transition-all hover:shadow-md active:scale-[0.97] ${
                  isOccupied
                    ? "border-destructive bg-destructive/10 text-destructive"
                    : "border-border bg-card hover:border-primary hover:bg-primary/5"
                }`}
              >
                <LayoutGrid className="h-6 w-6 mb-1" />
                <span className="font-bold text-lg">{t.name}</span>
                <span className="text-xs mt-0.5">{t.zone || ""}</span>
                <Badge variant={isOccupied ? "destructive" : "secondary"} className="mt-1 text-[10px]">
                  {isOccupied ? "Ocupada" : "Libre"}
                </Badge>
              </button>
            );
          })}
          {tables.length === 0 && (
            <p className="col-span-full text-center text-muted-foreground py-12">No hay mesas registradas. Configúralas en la pestaña Mesas.</p>
          )}
        </div>
      </div>
    );
  }

  // ─── MAIN POS VIEW (Quick Sale or Table selected) ─────────
  return (
    <div className="h-[calc(100vh-140px)] flex flex-col">
      {/* Top bar */}
      <div className="flex items-center gap-2 mb-2 flex-shrink-0">
        <Button variant={mode === "quick" ? "default" : "outline"} size="sm" onClick={() => { setMode("quick"); setSelectedTableId(null); resetOrder(); }}>
          <Zap className="h-4 w-4 mr-1" />Venta Rápida
        </Button>
        <Button variant={mode === "table" ? "default" : "outline"} size="sm" onClick={() => { setMode("table"); setSelectedTableId(null); resetOrder(); }}>
          <LayoutGrid className="h-4 w-4 mr-1" />Mesa
        </Button>

        {selectedTable && (
          <div className="flex items-center gap-2 ml-2">
            <Button variant="ghost" size="sm" onClick={() => { setSelectedTableId(null); resetOrder(); }}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Badge variant="outline" className="text-sm px-3 py-1">
              <LayoutGrid className="h-3.5 w-3.5 mr-1" />{selectedTable.name}
            </Badge>
          </div>
        )}

        <div className="ml-auto flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ScanBarcode className="h-3.5 w-3.5" />Lector
          </div>
          <Button variant="ghost" size="sm" onClick={() => setShowContext(!showContext)} className="text-xs">
            <User className="h-3.5 w-3.5 mr-1" />
            {showContext ? "Ocultar" : "Cliente / Empresa"}
          </Button>
          <div className="flex items-center gap-1.5">
            <Switch checked={isTestRecord} onCheckedChange={setIsTestRecord} id="test-toggle" />
            <Label htmlFor="test-toggle" className="text-xs cursor-pointer">Prueba</Label>
          </div>
        </div>
      </div>

      {/* Context panel (collapsible) */}
      {showContext && (
        <div className="border rounded-lg p-3 mb-2 bg-muted/30 flex-shrink-0 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
          <div>
            <Label className="text-xs">Empresa (opc.)</Label>
            <Select value={companyId || "none"} onValueChange={(v) => { setCompanyId(v === "none" ? "" : v); setContractId(""); setContractGroupId(""); setTimeout(recalcCartPrices, 0); }}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Sin empresa" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sin empresa</SelectItem>
                {companies.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {companyId && companyId !== "none" && contracts.length > 0 && (
            <div>
              <Label className="text-xs">Contrato</Label>
              <Select value={contractId || "none"} onValueChange={(v) => { setContractId(v === "none" ? "" : v); setContractGroupId(""); }}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Sin contrato" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {contracts.map(c => <SelectItem key={c.id} value={c.id}>{c.name}{c.code ? ` (${c.code})` : ""}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          {contractId && contractGroups.length > 0 && (
            <div>
              <Label className="text-xs">Subgrupo</Label>
              <Select value={contractGroupId || "none"} onValueChange={(v) => setContractGroupId(v === "none" ? "" : v)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {contractGroups.map(g => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label className="text-xs">Cliente</Label>
            <Input value={guestSearch || customerName} onChange={e => { setGuestSearch(e.target.value); setCustomerName(e.target.value); setGuestId(""); }} placeholder="Buscar..." className="h-8 text-xs" />
            {guestSearch.length >= 2 && !guestId && guests.length > 0 && (
              <div className="border rounded-md max-h-20 overflow-y-auto absolute z-50 bg-popover shadow-md mt-1">
                {guests.map(g => (
                  <button key={g.id} type="button" className="w-full text-left px-2 py-1 text-xs hover:bg-accent" onClick={() => { setGuestId(g.id); setCustomerName(`${g.first_name} ${g.last_name}`); setGuestSearch(""); }}>
                    {g.first_name} {g.last_name} <span className="text-muted-foreground">{g.document_number}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div>
            <Label className="text-xs">Servicio</Label>
            <Select value={servicePeriod} onValueChange={setServicePeriod}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {SERVICE_OPTIONS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Cobro</Label>
            <Select value={billingMode} onValueChange={(v) => { setBillingMode(v); setTimeout(recalcCartPrices, 0); }}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {BILLING_MODE_OPTIONS.map(b => <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {/* ─── THREE-ZONE LAYOUT ─── */}
      <div className="flex flex-1 min-h-0 gap-0 border rounded-lg overflow-hidden" style={{ maxHeight: 'calc(100vh - 200px)' }}>
        {/* LEFT: Categories */}
        <div className="w-[160px] border-r bg-muted/30 flex flex-col flex-shrink-0 min-h-0">
          <div className="p-2 border-b">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Categorías</span>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-1.5 space-y-1">
              {categories.map(cat => {
                const count = menuItems.filter((i: any) => (i.category || "General") === cat).length;
                const isActive = selectedCategory === cat;
                return (
                  <button
                    key={cat}
                    onClick={() => { setSelectedCategory(cat); setMenuSearch(""); }}
                    className={`w-full rounded-lg px-3 py-3 text-left transition-all text-sm font-medium ${
                      isActive
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "hover:bg-accent"
                    }`}
                  >
                    <div className="leading-tight">{cat}</div>
                    <div className={`text-[10px] mt-0.5 ${isActive ? "text-primary-foreground/70" : "text-muted-foreground"}`}>{count}</div>
                  </button>
                );
              })}
              {categories.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-6">Sin categorías</p>
              )}
            </div>
          </ScrollArea>
        </div>

        {/* CENTER: Products */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          {/* Search */}
          <div className="px-3 py-2 border-b flex-shrink-0">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={menuSearch}
                onChange={e => { setMenuSearch(e.target.value); if (e.target.value.trim()) setSelectedCategory(null); }}
                placeholder="Buscar producto..."
                className="pl-8 h-9"
              />
              {menuSearch && (
                <Button variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6" onClick={() => setMenuSearch("")}>
                  <X className="h-3 w-3" />
                </Button>
              )}
            </div>
          </div>

          {/* Product grid */}
          <ScrollArea className="flex-1">
            <div className="p-3">
              {!selectedCategory && !menuSearch.trim() ? (
                <div className="flex flex-col items-center justify-center h-full py-16 text-muted-foreground">
                  <Package className="h-12 w-12 mb-3 opacity-30" />
                  <p className="text-sm">Selecciona una categoría para ver los productos</p>
                </div>
              ) : (
                <>
                  {menuSearch.trim() && (
                    <p className="text-xs text-muted-foreground mb-2">
                      Resultados: {visibleItems.length}
                    </p>
                  )}
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
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
                        </button>
                      );
                    })}
                  </div>
                  {visibleItems.length === 0 && (
                    <p className="text-center text-muted-foreground py-8">No se encontraron productos</p>
                  )}
                </>
              )}
            </div>
          </ScrollArea>
        </div>

        {/* RIGHT: Cart / Order Summary */}
        <div className="w-[280px] border-l flex flex-col flex-shrink-0 bg-background">
          <div className="p-3 border-b flex items-center justify-between flex-shrink-0">
            <div className="font-semibold text-sm flex items-center gap-1.5">
              <ShoppingCart className="h-4 w-4" />
              Pedido
              {cart.length > 0 && <Badge variant="secondary" className="ml-1 text-[10px]">{cart.length}</Badge>}
            </div>
            {cart.length > 0 && (
              <Button variant="ghost" size="sm" className="h-6 text-xs text-destructive" onClick={() => setCart([])}>
                Limpiar
              </Button>
            )}
          </div>

          <ScrollArea className="flex-1">
            <div className="p-3 space-y-1">
              {cart.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <ShoppingCart className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Agrega productos</p>
                </div>
              ) : (
                cart.map(c => (
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
                        <span className="ml-1 text-xs truncate max-w-[100px]">{c.name}</span>
                      </div>
                      <div className="flex items-center gap-0.5">
                        <span className="text-xs font-medium">${(c.quantity * c.unit_price).toLocaleString()}</span>
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
                      <div className="ml-8 mr-1">
                        <Textarea value={c.notes} onChange={e => updateCartNotes(c.menu_item_id, e.target.value)} placeholder="Sin sopa, sin arroz..." className="text-xs h-14 resize-none" />
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </ScrollArea>

          {/* Cart totals & actions */}
          {cart.length > 0 && (
            <div className="border-t p-3 space-y-2 flex-shrink-0">
              <div className="flex justify-between font-bold text-base">
                <span>Total</span>
                <span>${cartTotal.toLocaleString()}</span>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <Button size="sm" variant="default" onClick={() => createOrder.mutate()} disabled={createOrder.isPending} className="text-xs">
                  <DollarSign className="h-3.5 w-3.5 mr-1" />Cobrar
                </Button>
                <Button size="sm" variant="secondary" onClick={() => sendAndCreate.mutate()} disabled={sendAndCreate.isPending} className="text-xs">
                  <Send className="h-3.5 w-3.5 mr-1" />Cocina
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <Button size="sm" variant="outline" className="text-xs" onClick={() => { setDestType("takeaway"); setTimeout(recalcCartPrices, 0); }}>
                  Para llevar
                </Button>
                <Button size="sm" variant="ghost" className="text-xs text-destructive" onClick={resetOrder}>
                  <X className="h-3.5 w-3.5 mr-1" />Cancelar
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
