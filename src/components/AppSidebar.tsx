import {
  Package, LayoutDashboard, Archive, ArrowRightLeft, Tag, LogOut, Users,
  ChefHat, UtensilsCrossed, BarChart3, Shield, Warehouse, PieChart, History,
  Trash2, FileText, Truck, ShoppingCart, SprayCan, BookOpen, ClipboardCheck,
  AlertTriangle, Layers, TrendingUp, ChevronDown, Settings, Box, Receipt, Utensils, Monitor, CalendarDays, Paintbrush,
  HelpCircle, Calculator, FlaskConical
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { usePermissions } from "@/hooks/use-permissions";
import { NavLink, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useState, useEffect, useCallback } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useBranding } from "@/hooks/use-branding";

interface NavItem {
  to: string;
  icon: typeof LayoutDashboard;
  label: string;
  permKey: string;
}

interface NavGroup {
  id: string;
  label: string;
  icon: typeof LayoutDashboard;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    id: "inventario",
    label: "Inventario",
    icon: Box,
    items: [
      { to: "/products", icon: Archive, label: "Productos", permKey: "products" },
      { to: "/categories", icon: Tag, label: "Categorías", permKey: "categories" },
      { to: "/warehouses", icon: Warehouse, label: "Almacenes", permKey: "warehouses" },
      { to: "/movements", icon: ArrowRightLeft, label: "Movimientos", permKey: "movements" },
      { to: "/kardex", icon: BookOpen, label: "Kardex", permKey: "movements" },
      { to: "/physical-inventory", icon: ClipboardCheck, label: "Inventario Físico", permKey: "physical_inventory" },
      { to: "/waste", icon: AlertTriangle, label: "Desperdicios", permKey: "waste_control" },
    ],
  },
  {
    id: "compras",
    label: "Compras",
    icon: Receipt,
    items: [
      { to: "/purchases", icon: FileText, label: "Facturas de Compra", permKey: "purchases" },
      { to: "/suppliers", icon: Truck, label: "Proveedores", permKey: "suppliers" },
      { to: "/purchase-orders", icon: ShoppingCart, label: "Pedidos de Compra", permKey: "purchase_orders" },
      { to: "/price-history", icon: TrendingUp, label: "Histórico Precios", permKey: "purchases" },
    ],
  },
  {
    id: "recetas",
    label: "Recetas y Costos",
    icon: Utensils,
    items: [
      { to: "/recipes", icon: ChefHat, label: "Recetas", permKey: "recipes" },
      { to: "/meal-planning", icon: CalendarDays, label: "Planeación Minuta", permKey: "recipes" },
    ],
  },
  {
    id: "operacion",
    label: "Operación",
    icon: Monitor,
    items: [
      { to: "/kitchen", icon: UtensilsCrossed, label: "Kiosco Cocina", permKey: "kitchen_kiosk" },
      { to: "/operations", icon: SprayCan, label: "Kiosco Operativo", permKey: "kitchen_kiosk" },
    ],
  },
  {
    id: "reportes",
    label: "Reportes",
    icon: BarChart3,
    items: [
      { to: "/executive", icon: PieChart, label: "Dashboard Ejecutivo", permKey: "reports" },
      { to: "/reports", icon: BarChart3, label: "Reportes", permKey: "reports" },
      { to: "/operational-reports", icon: Layers, label: "Reportes Operativos", permKey: "reports" },
    ],
  },
  {
    id: "config",
    label: "Configuración",
    icon: Settings,
    items: [
      { to: "/users", icon: Users, label: "Usuarios", permKey: "users" },
      { to: "/roles", icon: Shield, label: "Roles y Permisos", permKey: "roles" },
      { to: "/branding", icon: Paintbrush, label: "Configuración Visual", permKey: "users" },
      { to: "/audit", icon: History, label: "Auditoría", permKey: "audit" },
      { to: "/recalculate-inventory", icon: Calculator, label: "Recalcular Inventario", permKey: "audit" },
      { to: "/reset-inventory", icon: Trash2, label: "Reset Inventario", permKey: "audit" },
      { to: "/manual", icon: HelpCircle, label: "Manual de Usuario", permKey: "dashboard" },
    ],
  },
];

const STORAGE_KEY = "sidebar-open-groups";

function useOpenGroups(pathname: string, hasPermission: (k: string) => boolean) {
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch {}
    // Default: open the group containing the active route
    const result: Record<string, boolean> = {};
    for (const g of navGroups) {
      if (g.items.some((i) => i.to === pathname)) {
        result[g.id] = true;
      }
    }
    return result;
  });

  // Ensure active group is open on route change
  useEffect(() => {
    for (const g of navGroups) {
      if (g.items.some((i) => i.to === pathname) && !openGroups[g.id]) {
        setOpenGroups((prev) => {
          const next = { ...prev, [g.id]: true };
          localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
          return next;
        });
        break;
      }
    }
  }, [pathname]);

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
  const { openGroups, toggle } = useOpenGroups(location.pathname, hasPermission);
  const branding = useBranding();

  // Filter groups to only show items user has permission for
  const visibleGroups = navGroups
    .map((g) => ({
      ...g,
      items: g.items.filter((i) => hasPermission(i.permKey)),
    }))
    .filter((g) => g.items.length > 0);

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

      {/* Dashboard link (always visible at top) */}
      {hasPermission("dashboard") && (
        <div className="px-3 pt-3 pb-1">
          <NavLink
            to="/"
            end
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-sidebar-accent text-sidebar-primary"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
              )
            }
          >
            <LayoutDashboard className="h-4 w-4" />
            Dashboard
          </NavLink>
        </div>
      )}

      {/* Grouped navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
        {visibleGroups.map((group) => {
          const isOpen = !!openGroups[group.id];
          const hasActiveRoute = group.items.some((i) => location.pathname === i.to);

          return (
            <Collapsible
              key={group.id}
              open={isOpen}
              onOpenChange={() => toggle(group.id)}
            >
              <CollapsibleTrigger className="w-full">
                <div
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors w-full",
                    hasActiveRoute
                      ? "text-sidebar-primary"
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
                  {group.items.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      onClick={onNavigate}
                      className={({ isActive }) =>
                        cn(
                          "flex items-center gap-3 rounded-lg px-3 py-1.5 text-sm transition-colors",
                          isActive
                            ? "bg-sidebar-accent text-sidebar-primary font-medium"
                            : "text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                        )
                      }
                    >
                      <item.icon className="h-3.5 w-3.5" />
                      {item.label}
                    </NavLink>
                  ))}
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
