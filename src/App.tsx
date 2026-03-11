import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/lib/auth";
import { BrandingProvider } from "@/hooks/use-branding";
import Auth from "./pages/Auth";
import PendingApproval from "./pages/PendingApproval";
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

import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function ProtectedRoute({ children, roles }: { children: React.ReactNode; roles?: string[] }) {
  const { session, loading, hasRole, profileStatus } = useAuth();
  if (loading) return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Cargando...</div>;
  if (!session) return <Navigate to="/auth" replace />;
  if (profileStatus !== "active") return <Navigate to="/pending" replace />;
  if (roles && !roles.some((r) => hasRole(r))) return <Navigate to="/" replace />;
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

const AppRoutes = () => (
  <Routes>
    <Route path="/auth" element={<AuthRoute><Auth /></AuthRoute>} />
    <Route path="/pending" element={<PendingRoute />} />
    <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
    <Route path="/products" element={<ProtectedRoute roles={["admin", "bodega"]}><Products /></ProtectedRoute>} />
    <Route path="/movements" element={<ProtectedRoute><Movements /></ProtectedRoute>} />
    <Route path="/categories" element={<ProtectedRoute roles={["admin", "bodega"]}><Categories /></ProtectedRoute>} />
    <Route path="/users" element={<ProtectedRoute roles={["admin"]}><Users /></ProtectedRoute>} />
    <Route path="/recipes" element={<ProtectedRoute><Recipes /></ProtectedRoute>} />
    <Route path="/kitchen" element={<ProtectedRoute><KitchenKiosk /></ProtectedRoute>} />
    <Route path="/operations" element={<ProtectedRoute><OperationsKiosk /></ProtectedRoute>} />
    
    <Route path="/reports" element={<ProtectedRoute roles={["admin"]}><Reports /></ProtectedRoute>} />
    <Route path="/executive" element={<ProtectedRoute roles={["admin"]}><ExecutiveDashboard /></ProtectedRoute>} />
    <Route path="/operational-reports" element={<ProtectedRoute roles={["admin", "bodega"]}><OperationalReports /></ProtectedRoute>} />
    <Route path="/roles" element={<ProtectedRoute roles={["admin"]}><Roles /></ProtectedRoute>} />
    <Route path="/warehouses" element={<ProtectedRoute roles={["admin", "bodega"]}><Warehouses /></ProtectedRoute>} />
    <Route path="/purchases" element={<ProtectedRoute roles={["admin", "bodega"]}><PurchaseInvoices /></ProtectedRoute>} />
    <Route path="/suppliers" element={<ProtectedRoute roles={["admin", "bodega"]}><Suppliers /></ProtectedRoute>} />
    <Route path="/price-history" element={<ProtectedRoute roles={["admin", "bodega"]}><PriceHistory /></ProtectedRoute>} />
    <Route path="/purchase-orders" element={<ProtectedRoute roles={["admin", "bodega"]}><PurchaseOrders /></ProtectedRoute>} />
    <Route path="/kardex" element={<ProtectedRoute><Kardex /></ProtectedRoute>} />
    <Route path="/kardex/:productId" element={<ProtectedRoute><Kardex /></ProtectedRoute>} />
    <Route path="/physical-inventory" element={<ProtectedRoute roles={["admin", "bodega"]}><PhysicalInventory /></ProtectedRoute>} />
    <Route path="/waste" element={<ProtectedRoute roles={["admin", "bodega"]}><WasteControl /></ProtectedRoute>} />
    <Route path="/transformations" element={<ProtectedRoute roles={["admin", "bodega"]}><Transformations /></ProtectedRoute>} />
    <Route path="/meal-planning" element={<ProtectedRoute roles={["admin", "bodega"]}><MealPlanning /></ProtectedRoute>} />
    <Route path="/audit" element={<ProtectedRoute roles={["admin"]}><AuditLog /></ProtectedRoute>} />
    <Route path="/reset-inventory" element={<ProtectedRoute roles={["admin"]}><ResetInventory /></ProtectedRoute>} />
    <Route path="/recalculate-inventory" element={<ProtectedRoute roles={["admin"]}><RecalculateInventory /></ProtectedRoute>} />
    <Route path="/branding" element={<ProtectedRoute roles={["admin"]}><Branding /></ProtectedRoute>} />
    <Route path="/manual" element={<ProtectedRoute><UserManual /></ProtectedRoute>} />
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
