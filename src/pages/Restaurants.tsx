import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useRestaurantId } from "@/hooks/use-restaurant";
import { useAuth } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { Building2, Check, Plus } from "lucide-react";

export default function Restaurants() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { hasRole, refetchProfile } = useAuth();
  const activeRestaurantId = useRestaurantId();
  const [newName, setNewName] = useState("");

  const { data: restaurants, isLoading } = useQuery({
    queryKey: ["restaurants-linked"],
    queryFn: async () => {
      const { data, error } = await supabase.from("restaurants").select("id, name, created_at").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const createRestaurant = useMutation({
    mutationFn: async (name: string) => {
      const { data, error } = await supabase.rpc("create_restaurant_for_account", { p_name: name });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["restaurants-linked"] });
      setNewName("");
      toast({ title: "Restaurante creado" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const switchRestaurant = useMutation({
    mutationFn: async (restaurantId: string) => {
      const { error } = await supabase.rpc("switch_active_restaurant", { p_restaurant_id: restaurantId });
      if (error) throw error;
    },
    onSuccess: async () => {
      await refetchProfile();
      await qc.invalidateQueries();
      toast({ title: "Restaurante activo actualizado" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const isAdmin = hasRole("admin");

  return (
    <AppLayout>
      <div className="max-w-2xl space-y-6 animate-fade-in">
        <div>
          <h1 className="font-heading text-2xl font-bold text-foreground flex items-center gap-2">
            <Building2 className="h-7 w-7 text-primary" />
            Restaurantes
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Crea locales adicionales y cambia el restaurante activo. Los datos (inventario, compras, etc.) están separados por restaurante.
          </p>
        </div>

        {isAdmin && (
          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="text-lg">Nuevo restaurante</CardTitle>
              <CardDescription>Solo administradores. El local quedará vinculado a tu cuenta y a los demás admins del mismo restaurante actual.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1 space-y-2">
                <Label htmlFor="rest-name">Nombre</Label>
                <Input
                  id="rest-name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Ej. Sucursal Centro"
                />
              </div>
              <div className="flex items-end">
                <Button
                  type="button"
                  disabled={createRestaurant.isPending || newName.trim().length < 2}
                  onClick={() => createRestaurant.mutate(newName.trim())}
                  className="gap-2"
                >
                  <Plus className="h-4 w-4" />
                  Crear
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="text-lg">Tus restaurantes</CardTitle>
            <CardDescription>El marcado como activo define qué datos ves en toda la aplicación.</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Cargando…</p>
            ) : !restaurants?.length ? (
              <p className="text-sm text-muted-foreground">No hay restaurantes visibles. Si acabas de desplegar cambios, ejecuta las migraciones en Supabase.</p>
            ) : (
              <ul className="space-y-2">
                {restaurants.map((r) => {
                  const isActive = r.id === activeRestaurantId;
                  return (
                    <li
                      key={r.id}
                      className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-lg border border-border/50 p-3"
                    >
                      <div>
                        <p className="font-medium text-foreground">{r.name}</p>
                        <p className="text-xs text-muted-foreground font-mono">{r.id}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {isActive ? (
                          <Badge className="bg-primary text-primary-foreground gap-1">
                            <Check className="h-3 w-3" />
                            Activo
                          </Badge>
                        ) : (
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            disabled={switchRestaurant.isPending}
                            onClick={() => switchRestaurant.mutate(r.id)}
                          >
                            Usar este
                          </Button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
