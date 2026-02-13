import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock, LogOut } from "lucide-react";

export default function PendingApproval() {
  const { signOut, user, profileStatus } = useAuth();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader className="space-y-4">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-warning/10">
            {profileStatus === "blocked" ? (
              <span className="text-3xl">🚫</span>
            ) : (
              <Clock className="h-8 w-8 text-warning" />
            )}
          </div>
          <CardTitle className="font-heading text-2xl">
            {profileStatus === "blocked" ? "Cuenta Bloqueada" : "Cuenta Pendiente de Aprobación"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground">
            {profileStatus === "blocked"
              ? "Tu cuenta ha sido bloqueada por un administrador. Contacta al equipo para más información."
              : "Tu cuenta ha sido creada exitosamente. Un administrador debe aprobar tu acceso y asignarte un restaurante y rol antes de que puedas usar el sistema."}
          </p>
          <p className="text-sm text-muted-foreground">
            Sesión: {user?.email}
          </p>
          <Button variant="outline" onClick={signOut} className="w-full">
            <LogOut className="mr-2 h-4 w-4" />
            Cerrar Sesión
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
