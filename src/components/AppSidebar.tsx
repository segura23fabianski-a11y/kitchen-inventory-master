import {
  Package, LayoutDashboard, Archive, ArrowRightLeft, Tag, LogOut, Users,
  ChefHat, UtensilsCrossed, BarChart3, Shield, Warehouse, PieChart, History,
  Trash2, FileText, Truck, ShoppingCart, SprayCan, BookOpen, ClipboardCheck,
  AlertTriangle, Layers, TrendingUp, ChevronDown, Settings, Box, Receipt, Utensils, Monitor, CalendarDays, Paintbrush,
  HelpCircle, Calculator, FlaskConical, Hotel, BedDouble, CalendarCheck, CalendarPlus,
  Sparkles, Shirt, Building2, Users as UsersIcon
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { usePermissions } from "@/hooks/use-permissions";
import { NavLink, useLocation, useSearchParams } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useState, useEffect, useCallback } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
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
      { to: "/hotel", icon: Building2, label: "Empresas", permKey: "hotel_companies_view", tabParam: "companies" },
      { to: "/hotel", icon: Sparkles, label: "Housekeeping", permKey: "housekeeping_view", tabParam: "housekeeping" },
      { to: "/hotel", icon: Shirt, label: "Lavandería", permKey: "laundry_view", tabParam: "laundry" },
      { to: "/hotel", icon: Package, label: "Lencería", permKey: "linen_inventory_view", tabParam: "linen" },
      { to: "/hotel", icon: BarChart3, label: "Reporte Corp.", permKey: "hotel_corporate_reports_view", tabParam: "reports" },
    ],
  },
  {
    id: "restaurante",
    label: "Restaurante",
    icon: Utensils,
    items: [
      { to: "/", icon: LayoutDashboard, label: "Dashboard", permKey: "dashboard" },
      { to: "/products", icon: Archive, label: "Productos", permKey: "products" },
      { to: "/categories", icon: Tag, label: "Categorías", permKey: "categories" },
      { to: "/warehouses", icon: Warehouse, label: "Almacenes", permKey: "warehouses" },
      { to: "/recipes", icon: ChefHat, label: "Recetas", permKey: "recipes" },
      { to: "/meal-planning", icon: CalendarDays, label: "Planeación Minuta", permKey: "meal_planning" },
      { to: "/kitchen", icon: UtensilsCrossed, label: "Kiosco Cocina", permKey: "kitchen_kiosk" },
      { to: "/operations", icon: SprayCan, label: "Kiosco Operativo", permKey: "operations_kiosk" },
      { to: "/movements", icon: ArrowRightLeft, label: "Movimientos", permKey: "movements" },
      { to: "/kardex", icon: BookOpen, label: "Kardex", permKey: "kardex" },
      { to: "/physical-inventory", icon: ClipboardCheck, label: "Inventario Físico", permKey: "physical_inventory" },
      { to: "/purchases", icon: FileText, label: "Facturas de Compra", permKey: "purchases" },
      { to: "/suppliers", icon: Truck, label: "Proveedores", permKey: "suppliers" },
      { to: "/purchase-orders", icon: ShoppingCart, label: "Pedidos de Compra", permKey: "purchase_orders" },
      { to: "/price-history", icon: TrendingUp, label: "Histórico Precios", permKey: "price_history" },
      { to: "/waste", icon: AlertTriangle, label: "Desperdicios", permKey: "waste_control" },
      { to: "/transformations", icon: FlaskConical, label: "Transformaciones", permKey: "transformations" },
      { to: "/executive", icon: PieChart, label: "Dashboard Ejecutivo", permKey: "executive_dashboard" },
      { to: "/reports", icon: BarChart3, label: "Reportes", permKey: "reports" },
      { to: "/operational-reports", icon: Layers, label: "Reportes Operativos", permKey: "operational_reports" },
    ],
  },
  {
    id: "admin",
    label: "Administración",
    icon: Settings,
    items: [
      { to: "/users", icon: Users, label: "Usuarios", permKey: "users" },
      { to: "/roles", icon: Shield, label: "Roles y Permisos", permKey: "roles" },
      { to: "/branding", icon: Paintbrush, label: "Branding", permKey: "branding" },
      { to: "/audit", icon: History, label: "Auditoría", permKey: "audit" },
      { to: "/recalculate-inventory", icon: Calculator, label: "Recalcular Inventario", permKey: "recalculate_inventory" },
      { to: "/reset-inventory", icon: Trash2, label: "Reset Inventario", permKey: "reset_inventory" },
      { to: "/manual", icon: HelpCircle, label: "Manual de Usuario", permKey: "user_manual" },
    ],
  },
];

const STORAGE_KEY = "sidebar-open-groups";

function getActiveGroupId(pathname: string, tabParam: string | null): string | null {
  for (const g of navGroups) {
    for (const item of g.items) {
      if (item.tabParam) {
        if (pathname === "/hotel" && tabParam === item.tabParam) return g.id;
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

function SidebarNavContent({ onNavigate }: { onNavigate?: () => void }) {
  const { signOut, user } = useAuth();
  const { hasPermission } = usePermissions();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const currentTab = searchParams.get("tab");
  const { openGroups, toggle } = useOpenGroups(location.pathname, currentTab);
  const branding = useBranding();

  const visibleGroups = navGroups
    .map((g) => ({
      ...g,
      items: g.items.filter((i) => hasPermission(i.permKey)),
    }))
    .filter((g) => g.items.length > 0);

  const isItemActive = (item: NavItem) => {
    if (item.tabParam) {
      if (location.pathname !== "/hotel") return false;
      const activeTab = currentTab || "dashboard";
      return activeTab === item.tabParam;
    }
    return location.pathname === item.to;
  };

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
      <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-1">
        {visibleGroups.map((group) => {
          const isOpen = !!openGroups[group.id];
          const hasActiveRoute = group.items.some((i) => isItemActive(i));

          return (
            <Collapsible
              key={group.id}
              open={isOpen}
              onOpenChange={() => toggle(group.id)}
            >
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
                    const href = item.tabParam ? `/hotel?tab=${item.tabParam}` : item.to;

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
