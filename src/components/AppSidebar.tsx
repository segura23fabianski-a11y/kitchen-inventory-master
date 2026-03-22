import {
  Package, LayoutDashboard, Archive, ArrowRightLeft, Tag, LogOut, Users,
  ChefHat, UtensilsCrossed, BarChart3, Shield, Warehouse, PieChart, History,
  Trash2, FileText, Truck, ShoppingCart, SprayCan, BookOpen, ClipboardCheck,
  AlertTriangle, Layers, TrendingUp, TrendingDown, ChevronDown, Settings, Receipt, Utensils, CalendarDays, Paintbrush,
  HelpCircle, Calculator, FlaskConical, Hotel, BedDouble, CalendarCheck, CalendarPlus,
  Sparkles, Shirt, Building2, Users as UsersIcon, List, LayoutGrid, Activity, DollarSign, Bot,
  ChevronRight
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { usePermissions } from "@/hooks/use-permissions";
import { NavLink, useLocation, useSearchParams } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useState, useEffect, useCallback, useRef } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useBranding } from "@/hooks/use-branding";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface NavItem {
  to: string;
  icon: typeof LayoutDashboard;
  label: string;
  permKey: string;
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
      { to: "/pos", icon: ShoppingCart, label: "Restaurante", permKey: "pos_restaurant", tabParam: "orders" },
      { to: "/pos", icon: Building2, label: "Corporativo", permKey: "pos_corporate", tabParam: "corporate" },
      { to: "/pos", icon: List, label: "Menú", permKey: "pos_menu", tabParam: "menu" },
      { to: "/pos", icon: LayoutGrid, label: "Mesas", permKey: "pos_tables", tabParam: "tables" },
      { to: "/pos", icon: UtensilsCrossed, label: "Cocina", permKey: "pos_kitchen", tabParam: "kitchen" },
      { to: "/pos", icon: DollarSign, label: "Caja", permKey: "pos_cash_register", tabParam: "cash-register" },
      { to: "/pos", icon: FileText, label: "Contratos", permKey: "pos_contracts", tabParam: "contracts" },
      { to: "/pos", icon: Activity, label: "Tarifas Serv.", permKey: "pos_service_rates", tabParam: "service-rates" },
      { to: "/pos", icon: Settings, label: "Admin POS", permKey: "pos_admin", tabParam: "admin" },
    ],
  },
  {
    id: "inventory",
    label: "Inventario",
    icon: Archive,
    items: [
      { to: "/products", icon: Package, label: "Productos", permKey: "products" },
      { to: "/categories", icon: Tag, label: "Categorías", permKey: "categories" },
      { to: "/warehouses", icon: Warehouse, label: "Bodegas", permKey: "warehouses" },
      { to: "/movements", icon: ArrowRightLeft, label: "Movimientos", permKey: "movements" },
      { to: "/kardex", icon: FileText, label: "Kardex", permKey: "kardex" },
      { to: "/physical-inventory", icon: ClipboardCheck, label: "Inv. Físico", permKey: "physical_inventory" },
      { to: "/waste", icon: Trash2, label: "Mermas", permKey: "waste_control" },
      { to: "/transformations", icon: FlaskConical, label: "Transformaciones", permKey: "transformations" },
      { to: "/operations", icon: SprayCan, label: "Consumo Manual", permKey: "operations_kiosk" },
      { to: "/price-history", icon: TrendingUp, label: "Historial Precios", permKey: "price_history" },
      { to: "/inventory-value", icon: Calculator, label: "Valor Inventario", permKey: "reports" },
    ],
  },
  {
    id: "purchases",
    label: "Compras",
    icon: Truck,
    items: [
      { to: "/suppliers", icon: Users, label: "Proveedores", permKey: "suppliers" },
      { to: "/purchase-orders", icon: FileText, label: "Órdenes Compra", permKey: "purchase_orders" },
      { to: "/purchases", icon: Receipt, label: "Facturas", permKey: "purchases" },
      { to: "/purchases-report", icon: BarChart3, label: "Reporte Compras", permKey: "purchases_report" },
    ],
  },
  {
    id: "kitchen",
    label: "Cocina",
    icon: ChefHat,
    items: [
      { to: "/recipes", icon: UtensilsCrossed, label: "Recetas", permKey: "recipes" },
      { to: "/meal-planning", icon: CalendarDays, label: "Plan Alimenticio", permKey: "meal_planning" },
      { to: "/kitchen", icon: Utensils, label: "Kiosco Operativo", permKey: "kitchen_kiosk" },
    ],
  },
  {
    id: "reports",
    label: "Reportes",
    icon: BarChart3,
    items: [
      { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard", permKey: "dashboard" },
      { to: "/executive", icon: PieChart, label: "Ejecutivo", permKey: "executive_dashboard" },
      { to: "/reports", icon: BarChart3, label: "Reportes Op.", permKey: "reports" },
      { to: "/operational-reports", icon: TrendingDown, label: "Análisis Costos", permKey: "operational_reports" },
      { to: "/corporate-masters", icon: Building2, label: "Maestros Corp.", permKey: "corporate_masters" },
      { to: "/business-ai", icon: Bot, label: "IA Negocios", permKey: "business_ai" },
    ],
  },
  {
    id: "admin",
    label: "Administración",
    icon: Settings,
    items: [
      { to: "/users", icon: Users, label: "Usuarios", permKey: "users" },
      { to: "/roles", icon: Shield, label: "Roles", permKey: "roles" },
      { to: "/audit", icon: History, label: "Auditoría", permKey: "audit" },
      { to: "/branding", icon: Paintbrush, label: "Marca", permKey: "branding" },
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

function SidebarNavContent({ onNavigate, collapsed = false }: { onNavigate?: () => void; collapsed?: boolean }) {
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
    if (nav && navScrollTop.current > 0) {
      nav.scrollTop = navScrollTop.current;
    }
  });

  const visibleGroups = navGroups
    .map((g) => ({
      ...g,
      items: g.items.filter((i) => hasPermission(i.permKey)),
    }))
    .filter((g) => g.items.length > 0);

  const isItemActive = (item: NavItem) => {
    if (item.tabParam) {
      if (location.pathname !== item.to) return false;
      const defaultTab = item.to === "/hotel" ? "dashboard" : "orders";
      const activeTab = currentTab || defaultTab;
      return activeTab === item.tabParam;
    }
    return location.pathname === item.to;
  };

  if (collapsed) {
    return (
      <TooltipProvider delayDuration={0}>
        {/* Header icon */}
        <div className="flex h-12 items-center justify-center border-b border-sidebar-border shrink-0">
          {branding.logo_small_url ? (
            <img src={branding.logo_small_url} alt="Logo" className="h-7 w-7 rounded-lg object-contain" />
          ) : (
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-sidebar-primary">
              <Package className="h-3.5 w-3.5 text-sidebar-primary-foreground" />
            </div>
          )}
        </div>

        {/* Icon-only nav */}
        <nav ref={navRef} className="flex-1 overflow-y-auto py-2 space-y-1 flex flex-col items-center">
          {visibleGroups.map((group) => {
            const hasActiveRoute = group.items.some((i) => isItemActive(i));
            return (
              <Tooltip key={group.id}>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => {
                      // Navigate to first item of the group
                      const first = group.items[0];
                      const href = first.tabParam ? `${first.to}?tab=${first.tabParam}` : first.to;
                      window.location.href = href;
                      onNavigate?.();
                    }}
                    className={cn(
                      "flex h-9 w-9 items-center justify-center rounded-lg transition-colors",
                      hasActiveRoute
                        ? "bg-sidebar-accent text-sidebar-primary"
                        : "text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                    )}
                  >
                    <group.icon className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" className="text-xs">
                  {group.label}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </nav>

        {/* Footer icon */}
        <div className="border-t border-sidebar-border p-2 shrink-0 flex flex-col items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={signOut}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="text-xs">Cerrar sesión</TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>
    );
  }

  return (
    <>
      {/* Header */}
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
      </div>

      {/* Grouped navigation */}
      <nav ref={navRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-1">
        {visibleGroups.map((group) => {
          const isOpen = !!openGroups[group.id];
          const hasActiveRoute = group.items.some((i) => isItemActive(i));

          return (
            <Collapsible key={group.id} open={isOpen} onOpenChange={() => toggle(group.id)}>
              <CollapsibleTrigger className="w-full">
                <div
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold transition-colors w-full",
                    hasActiveRoute
                      ? "text-sidebar-primary bg-sidebar-accent/50"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                  )}
                >
                  <group.icon className="h-4 w-4 shrink-0" />
                  <span className="flex-1 text-left">{group.label}</span>
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 shrink-0 transition-transform duration-200",
                      isOpen && "rotate-180"
                    )}
                  />
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="ml-4 border-l border-sidebar-border pl-2 mt-1 space-y-0.5">
                  {group.items.map((item, idx) => {
                    const active = isItemActive(item);
                    const href = item.tabParam ? `${item.to}?tab=${item.tabParam}` : item.to;

                    return (
                      <NavLink
                        key={`${item.to}-${item.tabParam || idx}`}
                        to={href}
                        end={!item.tabParam}
                        onClick={onNavigate}
                        className={cn(
                          "flex items-center gap-3 rounded-lg px-3 py-1.5 text-sm transition-colors",
                          active
                            ? "bg-sidebar-accent text-sidebar-primary font-medium"
                            : "text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                        )}
                      >
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

      {/* Footer */}
      <div className="border-t border-sidebar-border p-3 shrink-0">
        <div className="flex items-center gap-3 rounded-lg px-3 py-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-sidebar-accent text-xs font-semibold text-sidebar-foreground shrink-0">
            {user?.email?.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="truncate text-sm font-medium text-sidebar-foreground">
              {user?.email}
            </p>
          </div>
          <button
            onClick={signOut}
            className="text-sidebar-foreground/50 hover:text-sidebar-foreground transition-colors"
            title="Cerrar sesión"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </>
  );
}

export function DesktopSidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden md:flex w-64 flex-col bg-sidebar border-r border-sidebar-border">
      <SidebarNavContent />
    </aside>
  );
}

export function MobileSidebar() {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      {/* Backdrop */}
      {expanded && (
        <div
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
          onClick={() => setExpanded(false)}
        />
      )}

      {/* Collapsed icon strip (always visible on mobile) */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex flex-col bg-sidebar border-r border-sidebar-border transition-all duration-200 md:hidden",
          expanded ? "w-64" : "w-12"
        )}
      >
        {expanded ? (
          <>
            <div className="flex h-12 items-center justify-end px-2 border-b border-sidebar-border shrink-0">
              <button
                onClick={() => setExpanded(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-sidebar-foreground/60 hover:bg-sidebar-accent"
              >
                <ChevronRight className="h-4 w-4 rotate-180" />
              </button>
            </div>
            <div className="flex-1 flex flex-col overflow-hidden">
              <SidebarNavContent onNavigate={() => setExpanded(false)} />
            </div>
          </>
        ) : (
          <>
            <button
              onClick={() => setExpanded(true)}
              className="flex h-12 items-center justify-center border-b border-sidebar-border shrink-0 text-sidebar-foreground/60 hover:text-sidebar-foreground"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <SidebarNavContent collapsed onNavigate={() => setExpanded(false)} />
          </>
        )}
      </aside>
    </>
  );
}

export default function AppSidebar() {
  return <DesktopSidebar />;
}
