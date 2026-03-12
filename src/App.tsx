import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/lib/auth";
import { usePermissions } from "@/hooks/use-permissions";
import { BrandingProvider } from "@/hooks/use-branding";
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
import PendingApproval from "./pages/PendingApproval";
import NoAccess from "./pages/NoAccess";
import Dashboard from "./pages/Dashboard";
import Products from "./pages/Products";
import Movements from "./pages/Movements";
import Categories from "./pages/Categories";
import Users from "./pages/Users";
import Recipes from "./pages/Recipes";
import KitchenKiosk from "./pages/KitchenKiosk";
import Reports from "./pages/Reports";
import ExecutiveDashboard from "./pages/ExecutiveDashboard";
import Roles from "./pages/Roles";
import Warehouses from "./pages/Warehouses";
import AuditLog from "./pages/AuditLog";
import ResetInventory from "./pages/ResetInventory";
import PurchaseInvoices from "./pages/PurchaseInvoices";
import Suppliers from "./pages/Suppliers";
import PurchaseOrders from "./pages/PurchaseOrders";
import OperationsKiosk from "./pages/OperationsKiosk";
import Kardex from "./pages/Kardex";
import PhysicalInventory from "./pages/PhysicalInventory";
import WasteControl from "./pages/WasteControl";
import OperationalReports from "./pages/OperationalReports";
import PriceHistory from "./pages/PriceHistory";
import MealPlanning from "./pages/MealPlanning";
import Branding from "./pages/Branding";
import UserManual from "./pages/UserManual";
import RecalculateInventory from "./pages/RecalculateInventory";
import Transformations from "./pages/Transformations";
import Hotel from "./pages/Hotel";
import POS from "./pages/POS";
import CasinoDashboard from "./pages/CasinoDashboard";
import PurchasesReport from "./pages/PurchasesReport";
import CorporateMasters from "./pages/CorporateMasters";

import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

// Ordered list of routes with their permKeys for smart redirect
const ROUTE_PERM_MAP = [
  { path: "/", permKey: "dashboard" },
  { path: "/hotel", permKey: "hotel_view" },
  { path: "/pos", permKey: "pos_view" },
  { path: "/products", permKey: "products" },
  { path: "/movements", permKey: "movements" },
  { path: "/recipes", permKey: "recipes" },
  { path: "/kitchen", permKey: "kitchen_kiosk" },
  { path: "/operations", permKey: "operations_kiosk" },
  { path: "/reports", permKey: "reports" },
  { path: "/manual", permKey: "user_manual" },
];

function ProtectedRoute({ children, roles, permKey }: { children: React.ReactNode; roles?: string[]; permKey?: string }) {
  const { session, loading, hasRole, profileStatus } = useAuth();
  const { hasPermission, isLoading: permLoading, permissions } = usePermissions();
  if (loading || permLoading) return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Cargando...</div>;
  if (!session) return <Navigate to="/auth" replace />;
  if (profileStatus !== "active") return <Navigate to="/pending" replace />;
  
  if (permKey && !hasPermission(permKey)) {
    // Find the first route the user has access to
    const firstAccessible = ROUTE_PERM_MAP.find(r => r.permKey !== permKey && hasPermission(r.permKey));
    if (firstAccessible) {
      return <Navigate to={firstAccessible.path} replace />;
    }
    return <Navigate to="/no-access" replace />;
  }
  if (!permKey && roles && !roles.some((r) => hasRole(r))) {
    return <Navigate to="/no-access" replace />;
  }
  return <>{children}</>;
}

function AuthRoute({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  if (loading) return null;
  if (session) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function PendingRoute() {
  const { session, loading, profileStatus } = useAuth();
  if (loading) return null;
  if (!session) return <Navigate to="/auth" replace />;
  if (profileStatus === "active") return <Navigate to="/" replace />;
  return <PendingApproval />;
}

function NoAccessRoute() {
  const { session, loading, profileStatus } = useAuth();
  if (loading) return null;
  if (!session) return <Navigate to="/auth" replace />;
  if (profileStatus !== "active") return <Navigate to="/pending" replace />;
  return <NoAccess />;
}

const AppRoutes = () => (
  <Routes>
    <Route path="/auth" element={<AuthRoute><Auth /></AuthRoute>} />
    <Route path="/reset-password" element={<ResetPassword />} />
    <Route path="/pending" element={<PendingRoute />} />
    <Route path="/no-access" element={<NoAccessRoute />} />
    <Route path="/" element={<ProtectedRoute permKey="dashboard"><Dashboard /></ProtectedRoute>} />
    <Route path="/products" element={<ProtectedRoute permKey="products"><Products /></ProtectedRoute>} />
    <Route path="/movements" element={<ProtectedRoute permKey="movements"><Movements /></ProtectedRoute>} />
    <Route path="/categories" element={<ProtectedRoute permKey="categories"><Categories /></ProtectedRoute>} />
    <Route path="/users" element={<ProtectedRoute permKey="users"><Users /></ProtectedRoute>} />
    <Route path="/recipes" element={<ProtectedRoute permKey="recipes"><Recipes /></ProtectedRoute>} />
    <Route path="/kitchen" element={<ProtectedRoute permKey="kitchen_kiosk"><KitchenKiosk /></ProtectedRoute>} />
    <Route path="/operations" element={<ProtectedRoute permKey="operations_kiosk"><OperationsKiosk /></ProtectedRoute>} />
    
    <Route path="/reports" element={<ProtectedRoute permKey="reports"><Reports /></ProtectedRoute>} />
    <Route path="/executive" element={<ProtectedRoute permKey="executive_dashboard"><ExecutiveDashboard /></ProtectedRoute>} />
    <Route path="/operational-reports" element={<ProtectedRoute permKey="operational_reports"><OperationalReports /></ProtectedRoute>} />
    <Route path="/roles" element={<ProtectedRoute permKey="roles"><Roles /></ProtectedRoute>} />
    <Route path="/warehouses" element={<ProtectedRoute permKey="warehouses"><Warehouses /></ProtectedRoute>} />
    <Route path="/purchases" element={<ProtectedRoute permKey="purchases"><PurchaseInvoices /></ProtectedRoute>} />
    <Route path="/suppliers" element={<ProtectedRoute permKey="suppliers"><Suppliers /></ProtectedRoute>} />
    <Route path="/price-history" element={<ProtectedRoute permKey="price_history"><PriceHistory /></ProtectedRoute>} />
    <Route path="/purchase-orders" element={<ProtectedRoute permKey="purchase_orders"><PurchaseOrders /></ProtectedRoute>} />
    <Route path="/kardex" element={<ProtectedRoute permKey="kardex"><Kardex /></ProtectedRoute>} />
    <Route path="/kardex/:productId" element={<ProtectedRoute permKey="kardex"><Kardex /></ProtectedRoute>} />
    <Route path="/physical-inventory" element={<ProtectedRoute permKey="physical_inventory"><PhysicalInventory /></ProtectedRoute>} />
    <Route path="/waste" element={<ProtectedRoute permKey="waste_control"><WasteControl /></ProtectedRoute>} />
    <Route path="/transformations" element={<ProtectedRoute permKey="transformations"><Transformations /></ProtectedRoute>} />
    <Route path="/meal-planning" element={<ProtectedRoute permKey="meal_planning"><MealPlanning /></ProtectedRoute>} />
    <Route path="/audit" element={<ProtectedRoute permKey="audit"><AuditLog /></ProtectedRoute>} />
    <Route path="/reset-inventory" element={<ProtectedRoute permKey="reset_inventory"><ResetInventory /></ProtectedRoute>} />
    <Route path="/recalculate-inventory" element={<ProtectedRoute permKey="recalculate_inventory"><RecalculateInventory /></ProtectedRoute>} />
    <Route path="/branding" element={<ProtectedRoute permKey="branding"><Branding /></ProtectedRoute>} />
    <Route path="/manual" element={<ProtectedRoute permKey="user_manual"><UserManual /></ProtectedRoute>} />
    <Route path="/hotel" element={<ProtectedRoute permKey="hotel_view"><Hotel /></ProtectedRoute>} />
    <Route path="/pos" element={<ProtectedRoute permKey="pos_view"><POS /></ProtectedRoute>} />
    <Route path="/casino" element={<ProtectedRoute permKey="dashboard"><CasinoDashboard /></ProtectedRoute>} />
        <Route path="/purchases-report" element={<ProtectedRoute permKey="reports"><PurchasesReport /></ProtectedRoute>} />
        <Route path="/corporate-masters" element={<ProtectedRoute permKey="corporate_masters"><CorporateMasters /></ProtectedRoute>} />
    <Route path="*" element={<NotFound />} />
  </Routes>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <BrandingProvider>
            <AppRoutes />
          </BrandingProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
