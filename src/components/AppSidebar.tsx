import {
  Package, LayoutDashboard, Archive, ArrowRightLeft, Tag, LogOut, Users,
  ChefHat, UtensilsCrossed, BarChart3, Shield, Warehouse, PieChart, History,
  Trash2, FileText, Truck, ShoppingCart, SprayCan, BookOpen, ClipboardCheck,
  AlertTriangle, Layers, TrendingUp, TrendingDown, ChevronDown, Settings, Receipt, Utensils, CalendarDays, Paintbrush,
  HelpCircle, Calculator, FlaskConical, Hotel, BedDouble, CalendarCheck, CalendarPlus,
  Sparkles, Shirt, Building2, Users as UsersIcon, List, LayoutGrid, Activity, DollarSign, Bot,
  FileBarChart, BarChart2
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { usePermissions } from "@/hooks/use-permissions";
import { NavLink, useLocation, useSearchParams } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useState, useEffect, useCallback, useRef, createContext, useContext } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useBranding } from "@/hooks/use-branding";

interface NavItem {
  to: string;
  icon: typeof LayoutDashboard;
  label: string;
  permKey: string;
  /** For hotel sub-tabs that share /hotel path */
  tabParam?: string;
}

interface NavGroup {
  id: string;
  label: string;
  icon: typeof LayoutDashboard;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    id: "hotel",
    label: "Hotel",
    icon: Hotel,
    items: [
      { to: "/hotel", icon: LayoutDashboard, label: "Dashboard", permKey: "hotel_dashboard_view", tabParam: "dashboard" },
      { to: "/hotel", icon: CalendarPlus, label: "Reservas", permKey: "hotel_reservations_view", tabParam: "reservations" },
      { to: "/hotel", icon: CalendarCheck, label: "Estancias", permKey: "hotel_stays_view", tabParam: "stays" },
      { to: "/hotel", icon: BedDouble, label: "Habitaciones", permKey: "hotel_rooms_view", tabParam: "rooms" },
      { to: "/hotel", icon: Hotel, label: "Tipos", permKey: "hotel_room_types_view", tabParam: "room-types" },
      { to: "/hotel", icon: UsersIcon, label: "Huéspedes", permKey: "hotel_guests_view", tabParam: "guests" },
      { to: "/hotel", icon: Sparkles, label: "Housekeeping", permKey: "housekeeping_view", tabParam: "housekeeping" },
      
      { to: "/hotel", icon: Shirt, label: "Lavandería", permKey: "laundry_view", tabParam: "laundry" },
      { to: "/hotel", icon: Package, label: "Lencería", permKey: "linen_inventory_view", tabParam: "linen" },
    ],
  },
  {
    id: "pos",
    label: "POS / Ventas",
    icon: ShoppingCart,
    items: [
      { to: "/pos", icon: Utensils, label: "Restaurante", permKey: "pos_restaurant", tabParam: "restaurant" },
      { to: "/pos", icon: Building2, label: "Corporativo", permKey: "pos_corporate", tabParam: "corporate" },
      { to: "/pos", icon: List, label: "Menú", permKey: "pos_menu", tabParam: "menu" },
      { to: "/pos", icon: LayoutGrid, label: "Mesas", permKey: "pos_tables", tabParam: "tables" },
      { to: "/pos", icon: DollarSign, label: "Caja", permKey: "pos_cash_register", tabParam: "cash-register" },
    ],
  },
  {
    id: "inventario",
    label: "Inventario",
    icon: Archive,
    items: [
      { to: "/", icon: LayoutDashboard, label: "Dashboard", permKey: "dashboard" },
      { to: "/products", icon: Package, label: "Productos", permKey: "products" },
      { to: "/categories", icon: Tag, label: "Categorías", permKey: "categories" },
      { to: "/movements", icon: ArrowRightLeft, label: "Movimientos", permKey: "movements" },
      { to: "/kardex", icon: BookOpen, label: "Kardex", permKey: "kardex" },
      { to: "/warehouses", icon: Warehouse, label: "Almacenes", permKey: "warehouses" },
      { to: "/physical-inventory", icon: ClipboardCheck, label: "Inventario Físico", permKey: "physical_inventory" },
      { to: "/transformations", icon: FlaskConical, label: "Transformaciones", permKey: "transformations" },
      { to: "/waste", icon: AlertTriangle, label: "Desperdicios", permKey: "waste_control" },
    ],
  },
  {
    id: "compras",
    label: "Compras",
    icon: Receipt,
    items: [
      { to: "/purchase-orders", icon: ShoppingCart, label: "Pedidos", permKey: "purchase_orders" },
      { to: "/smart-invoices", icon: Sparkles, label: "Facturas IA", permKey: "purchases" },
      { to: "/purchases", icon: Receipt, label: "Facturas", permKey: "purchases" },
      { to: "/suppliers", icon: Truck, label: "Proveedores", permKey: "suppliers" },
      { to: "/price-history", icon: TrendingUp, label: "Histórico Precios", permKey: "price_history" },
    ],
  },
  {
    id: "cocina",
    label: "Cocina",
    icon: ChefHat,
    items: [
      { to: "/recipes", icon: ChefHat, label: "Recetas", permKey: "recipes" },
      { to: "/meal-planning", icon: CalendarDays, label: "Minuta", permKey: "meal_planning" },
      { to: "/kitchen", icon: UtensilsCrossed, label: "Kiosco Cocina", permKey: "kitchen_kiosk" },
      { to: "/operations", icon: SprayCan, label: "Kiosco Operativo", permKey: "operations_kiosk" },
    ],
  },
  {
    id: "reportes",
    label: "Reportes",
    icon: BarChart3,
    items: [
      { to: "/executive", icon: PieChart, label: "Dashboard Ejecutivo", permKey: "executive_dashboard" },
      { to: "/casino", icon: Activity, label: "Rentabilidad del día", permKey: "casino_dashboard" },
      { to: "/reports", icon: TrendingDown, label: "Consumo", permKey: "reports" },
      { to: "/purchases-report", icon: FileText, label: "Compras", permKey: "reports" },
      { to: "/operational-reports", icon: Layers, label: "Operativos", permKey: "operational_reports" },
      { to: "/inventory-value", icon: DollarSign, label: "Valor Inventario", permKey: "reports" },
      { to: "/hotel", icon: BarChart3, label: "Hotel Corp.", permKey: "hotel_corporate_reports_view", tabParam: "reports" },
      { to: "/report-templates", icon: FileBarChart, label: "Plantillas", permKey: "reports" },
      { to: "/custom-reports", icon: BarChart2, label: "Informes Personalizados", permKey: "reports" },
    ],
  },
  {
    id: "admin",
    label: "Administración",
    icon: Settings,
    items: [
      { to: "/users", icon: Users, label: "Usuarios", permKey: "users" },
      { to: "/restaurants", icon: Building2, label: "Restaurantes", permKey: "users" },
      { to: "/roles", icon: Shield, label: "Roles y Permisos", permKey: "roles" },
      { to: "/corporate-masters", icon: Building2, label: "Maestros Corp.", permKey: "corporate_masters" },
      { to: "/branding", icon: Paintbrush, label: "Branding", permKey: "branding" },
      { to: "/audit", icon: History, label: "Auditoría", permKey: "audit" },
      { to: "/recalculate-inventory", icon: Calculator, label: "Recalcular Inventario", permKey: "recalculate_inventory" },
      { to: "/reset-inventory", icon: Trash2, label: "Reset Inventario", permKey: "reset_inventory" },
      { to: "/pos", icon: Shield, label: "Admin POS", permKey: "pos_admin", tabParam: "admin-pos" },
      { to: "/business-ai", icon: Bot, label: "Asistente IA", permKey: "business_ai" },
      { to: "/manual", icon: HelpCircle, label: "Manual de Usuario", permKey: "user_manual" },
    ],
  },
];

const STORAGE_KEY = "sidebar-open-groups";

function getActiveGroupId(pathname: string, tabParam: string | null): string | null {
  for (const g of navGroups) {
    for (const item of g.items) {
      if (item.tabParam) {
        if (pathname === item.to && tabParam === item.tabParam) return g.id;
      } else {
        if (item.to === pathname) return g.id;
      }
    }
  }
  return null;
}

function useOpenGroups(pathname: string, tabParam: string | null) {
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch {}
    const activeId = getActiveGroupId(pathname, tabParam);
    return activeId ? { [activeId]: true } : {};
  });

  useEffect(() => {
    const activeId = getActiveGroupId(pathname, tabParam);
    if (activeId && !openGroups[activeId]) {
      setOpenGroups((prev) => {
        const next = { ...prev, [activeId]: true };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        return next;
      });
    }
  }, [pathname, tabParam]);

  const toggle = useCallback((id: string) => {
    setOpenGroups((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  return { openGroups, toggle };
}

// Collapse context
const SidebarCollapseCtx = createContext<{ collapsed: boolean; setCollapsed: (v: boolean) => void }>({ collapsed: false, setCollapsed: () => {} });
export const useSidebarCollapse = () => useContext(SidebarCollapseCtx);

const COLLAPSED_KEY = "sidebar-collapsed";

export function SidebarCollapseProvider({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(COLLAPSED_KEY) === "true"; } catch { return false; }
  });
  const set = useCallback((v: boolean) => {
    setCollapsed(v);
    localStorage.setItem(COLLAPSED_KEY, String(v));
  }, []);
  return <SidebarCollapseCtx.Provider value={{ collapsed, setCollapsed: set }}>{children}</SidebarCollapseCtx.Provider>;
}

function useSidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const { signOut, user } = useAuth();
  const { hasPermission } = usePermissions();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const currentTab = searchParams.get("tab");
  const { openGroups, toggle } = useOpenGroups(location.pathname, currentTab);
  const branding = useBranding();
  const navRef = useRef<HTMLElement>(null);

  const navScrollTop = useRef(0);
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const handleScroll = () => { navScrollTop.current = nav.scrollTop; };
    nav.addEventListener("scroll", handleScroll, { passive: true });
    return () => nav.removeEventListener("scroll", handleScroll);
  }, []);
  useEffect(() => {
    const nav = navRef.current;
    if (nav && navScrollTop.current > 0) nav.scrollTop = navScrollTop.current;
  });

  const visibleGroups = navGroups
    .map((g) => ({ ...g, items: g.items.filter((i) => hasPermission(i.permKey)) }))
    .filter((g) => g.items.length > 0);

  const isItemActive = (item: NavItem) => {
    if (item.tabParam) {
      if (location.pathname !== item.to) return false;
      const defaultTab = item.to === "/hotel" ? "dashboard" : "orders";
      return (currentTab || defaultTab) === item.tabParam;
    }
    return location.pathname === item.to;
  };

  return { visibleGroups, isItemActive, openGroups, toggle, branding, user, signOut, navRef, onNavigate };
}

function ExpandedSidebar({ ctx }: { ctx: ReturnType<typeof useSidebarNav> }) {
  const { visibleGroups, isItemActive, openGroups, toggle, branding, user, signOut, navRef, onNavigate } = ctx;
  const { setCollapsed } = useSidebarCollapse();

  return (
    <>
      <div className="flex h-14 items-center gap-3 px-5 border-b border-sidebar-border shrink-0">
        {branding.logo_small_url ? (
          <img src={branding.logo_small_url} alt="Logo" className="h-8 w-8 rounded-lg object-contain" />
        ) : (
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sidebar-primary">
            <Package className="h-4 w-4 text-sidebar-primary-foreground" />
          </div>
        )}
        <span className="font-heading text-base font-semibold text-sidebar-foreground">
          {branding.app_name || "Inventario"}
        </span>
        <button
          onClick={() => setCollapsed(true)}
          className="ml-auto text-sidebar-foreground/50 hover:text-sidebar-foreground transition-colors"
          title="Minimizar menú"
        >
          <PanelLeftClose className="h-4 w-4" />
        </button>
      </div>

      <nav ref={navRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-1">
        {visibleGroups.map((group) => {
          const isOpen = !!openGroups[group.id];
          const hasActiveRoute = group.items.some((i) => isItemActive(i));
          return (
            <Collapsible key={group.id} open={isOpen} onOpenChange={() => toggle(group.id)}>
              <CollapsibleTrigger className="w-full">
                <div className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold transition-colors w-full",
                  hasActiveRoute ? "text-sidebar-primary bg-sidebar-accent/50" : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                )}>
                  <group.icon className="h-4 w-4 shrink-0" />
                  <span className="flex-1 text-left">{group.label}</span>
                  <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform duration-200", isOpen && "rotate-180")} />
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="ml-4 border-l border-sidebar-border pl-2 mt-1 space-y-0.5">
                  {group.items.map((item, idx) => {
                    const active = isItemActive(item);
                    const href = item.tabParam ? `${item.to}?tab=${item.tabParam}` : item.to;
                    return (
                      <NavLink key={`${item.to}-${item.tabParam || idx}`} to={href} end={!item.tabParam} onClick={onNavigate}
                        className={cn("flex items-center gap-3 rounded-lg px-3 py-1.5 text-sm transition-colors",
                          active ? "bg-sidebar-accent text-sidebar-primary font-medium" : "text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                        )}>
                        <item.icon className="h-3.5 w-3.5" />
                        {item.label}
                      </NavLink>
                    );
                  })}
                </div>
              </CollapsibleContent>
            </Collapsible>
          );
        })}
      </nav>

      <div className="border-t border-sidebar-border p-3 shrink-0">
        <div className="flex items-center gap-3 rounded-lg px-3 py-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-sidebar-accent text-xs font-semibold text-sidebar-foreground shrink-0">
            {user?.email?.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="truncate text-sm font-medium text-sidebar-foreground">{user?.email}</p>
          </div>
          <button onClick={signOut} className="text-sidebar-foreground/50 hover:text-sidebar-foreground transition-colors" title="Cerrar sesión">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </>
  );
}

function CollapsedSidebar({ ctx, onRequestExpand }: { ctx: ReturnType<typeof useSidebarNav>; onRequestExpand: () => void }) {
  const { visibleGroups, isItemActive, branding, user, signOut } = ctx;

  return (
    <>
      <div className="flex h-14 items-center justify-center border-b border-sidebar-border shrink-0">
        {branding.logo_small_url ? (
          <img src={branding.logo_small_url} alt="Logo" className="h-7 w-7 rounded-lg object-contain" />
        ) : (
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-sidebar-primary">
            <Package className="h-3.5 w-3.5 text-sidebar-primary-foreground" />
          </div>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto px-1.5 py-1 space-y-1">
        {visibleGroups.map((group) => (
          <div key={group.id} className="space-y-0.5">
            <div className="flex justify-center py-1">
              <group.icon className="h-3.5 w-3.5 text-sidebar-foreground/40" />
            </div>
            {group.items.map((item, idx) => {
              const active = isItemActive(item);
              return (
                <button key={`${item.to}-${item.tabParam || idx}`} title={item.label} onClick={onRequestExpand}
                  className={cn("flex w-full items-center justify-center rounded-lg p-2 transition-colors",
                    active ? "bg-sidebar-accent text-sidebar-primary" : "text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                  )}>
                  <item.icon className="h-4 w-4" />
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="border-t border-sidebar-border p-2 shrink-0 flex flex-col items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-sidebar-accent text-xs font-semibold text-sidebar-foreground" title={user?.email || ""}>
          {user?.email?.charAt(0).toUpperCase()}
        </div>
        <button onClick={signOut} className="text-sidebar-foreground/50 hover:text-sidebar-foreground transition-colors" title="Cerrar sesión">
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </>
  );
}

function SidebarNavContent({ onNavigate }: { onNavigate?: () => void }) {
  const ctx = useSidebarNav({ onNavigate });
  return <ExpandedSidebar ctx={ctx} />;
}

export function DesktopSidebar() {
  const { collapsed } = useSidebarCollapse();
  const [peek, setPeek] = useState(false);
  const ctx = useSidebarNav({ onNavigate: collapsed ? () => setPeek(false) : undefined });

  return (
    <>
      {/* Collapsed icon strip */}
      {collapsed && (
        <aside className="fixed inset-y-0 left-0 z-30 hidden md:flex w-14 flex-col bg-sidebar border-r border-sidebar-border">
          <CollapsedSidebar ctx={ctx} onRequestExpand={() => setPeek(true)} />
        </aside>
      )}

      {/* Full sidebar: always visible when not collapsed, or as overlay when peeking */}
      {(!collapsed || peek) && (
        <>
          {peek && <div className="fixed inset-0 z-30 hidden md:block" onClick={() => setPeek(false)} />}
          <aside className={cn(
            "fixed inset-y-0 left-0 z-40 hidden md:flex w-64 flex-col bg-sidebar border-r border-sidebar-border transition-all duration-200",
            peek && "shadow-xl"
          )}>
            <ExpandedSidebar ctx={ctx} />
          </aside>
        </>
      )}
    </>
  );
}

export function MobileSidebarContent({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex h-full flex-col bg-sidebar">
      <SidebarNavContent onNavigate={onClose} />
    </div>
  );
}

export default function AppSidebar() {
  return <DesktopSidebar />;
}
