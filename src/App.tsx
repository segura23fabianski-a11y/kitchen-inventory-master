import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/lib/auth";
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
    <Route path="/reports" element={<ProtectedRoute roles={["admin"]}><Reports /></ProtectedRoute>} />
    <Route path="/executive" element={<ProtectedRoute roles={["admin"]}><ExecutiveDashboard /></ProtectedRoute>} />
    <Route path="/roles" element={<ProtectedRoute roles={["admin"]}><Roles /></ProtectedRoute>} />
    <Route path="/warehouses" element={<ProtectedRoute roles={["admin", "bodega"]}><Warehouses /></ProtectedRoute>} />
    <Route path="/audit" element={<ProtectedRoute roles={["admin"]}><AuditLog /></ProtectedRoute>} />
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
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
