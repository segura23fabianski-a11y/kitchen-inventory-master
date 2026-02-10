import { Package, LayoutDashboard, Archive, ArrowRightLeft, Tag, LogOut, Users } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";

type AppRole = "admin" | "cocina" | "bodega";

interface NavItem {
  to: string;
  icon: typeof LayoutDashboard;
  label: string;
  roles?: AppRole[]; // undefined = all roles can see
}

const navItems: NavItem[] = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/products", icon: Archive, label: "Productos", roles: ["admin", "bodega"] },
  { to: "/movements", icon: ArrowRightLeft, label: "Movimientos" },
  { to: "/categories", icon: Tag, label: "Categorías", roles: ["admin"] },
];

const adminItems = [
  { to: "/users", icon: Users, label: "Usuarios" },
];

export default function AppSidebar() {
  const { signOut, hasRole, user } = useAuth();

  return (
    <aside className="fixed inset-y-0 left-0 z-30 flex w-64 flex-col bg-sidebar border-r border-sidebar-border">
      <div className="flex h-16 items-center gap-3 px-6 border-b border-sidebar-border">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sidebar-primary">
          <Package className="h-5 w-5 text-sidebar-primary-foreground" />
        </div>
        <span className="font-heading text-lg font-semibold text-sidebar-foreground">
          Inventario
        </span>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4">
        {navItems
          .filter((item) => !item.roles || item.roles.some((r) => hasRole(r)))
          .map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-sidebar-accent text-sidebar-primary"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
              )
            }
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </NavLink>
        ))}

        {hasRole("admin") && (
          <>
            <div className="my-3 border-t border-sidebar-border" />
            <p className="px-3 py-1 text-xs font-medium uppercase tracking-wider text-sidebar-foreground/40">
              Admin
            </p>
            {adminItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-sidebar-accent text-sidebar-primary"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                  )
                }
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </NavLink>
            ))}
          </>
        )}
      </nav>

      <div className="border-t border-sidebar-border p-3">
        <div className="flex items-center gap-3 rounded-lg px-3 py-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-sidebar-accent text-xs font-semibold text-sidebar-foreground">
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
    </aside>
  );
}
