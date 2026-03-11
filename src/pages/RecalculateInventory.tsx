import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Calculator, AlertTriangle, CheckCircle2, RefreshCw } from "lucide-react";

interface StockDiff {
  product_id: string;
  product_name: string;
  old_stock: number;
  new_stock: number;
  difference: number;
}

export default function RecalculateInventory() {
  const [results, setResults] = useState<StockDiff[] | null>(null);
  const { toast } = useToast();

  const recalcMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("recalculate_all_stock" as any);
      if (error) throw error;
      return (data as any[]) ?? [];
    },
    onSuccess: (data) => {
      setResults(data);
      if (data.length === 0) {
        toast({ title: "✅ Inventario consistente", description: "No se encontraron diferencias." });
      } else {
        toast({
          title: `⚠️ ${data.length} productos corregidos`,
          description: "El stock ha sido recalculado desde los movimientos.",
          variant: "destructive",
        });
      }
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <AppLayout>
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <h1 className="font-heading text-3xl font-bold">Recalcular Inventario</h1>
          <p className="text-muted-foreground">
            Recalcula el stock de todos los productos basándose en los movimientos registrados.
          </p>
        </div>

        <Card className="border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
              <AlertTriangle className="h-5 w-5" />
              Información importante
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-2 text-amber-800 dark:text-amber-300">
            <p>Esta función recorre <strong>todos los movimientos</strong> de cada producto en orden cronológico y recalcula el stock aplicando:</p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li><strong>Entradas</strong>: suman al stock</li>
              <li><strong>Salidas / Consumos / Mermas</strong>: restan al stock</li>
              <li><strong>Ajustes</strong>: establecen el stock al valor indicado</li>
            </ul>
            <p>Si el stock calculado difiere del stock actual, se corrige automáticamente.</p>
          </CardContent>
        </Card>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size="lg" className="w-full" disabled={recalcMutation.isPending}>
              <Calculator className="mr-2 h-5 w-5" />
              {recalcMutation.isPending ? "Recalculando..." : "Ejecutar Recálculo Completo"}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Ejecutar recálculo de inventario?</AlertDialogTitle>
              <AlertDialogDescription>
                Esta operación recalculará el stock de TODOS los productos basándose en los movimientos.
                Los valores de stock que no coincidan serán corregidos automáticamente.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={() => recalcMutation.mutate()}>
                Confirmar Recálculo
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {results !== null && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {results.length === 0 ? (
                  <>
                    <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                    Inventario Consistente
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-5 w-5 text-amber-600" />
                    {results.length} Productos Corregidos
                  </>
                )}
              </CardTitle>
              <CardDescription>
                {results.length === 0
                  ? "Todos los productos tienen stock correcto según sus movimientos."
                  : "Los siguientes productos tenían diferencias y fueron corregidos:"}
              </CardDescription>
            </CardHeader>
            {results.length > 0 && (
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Producto</TableHead>
                      <TableHead className="text-right">Stock Anterior</TableHead>
                      <TableHead className="text-right">Stock Correcto</TableHead>
                      <TableHead className="text-right">Diferencia</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {results.map((r) => (
                      <TableRow key={r.product_id}>
                        <TableCell className="font-medium">{r.product_name}</TableCell>
                        <TableCell className="text-right text-red-600 line-through">
                          {Number(r.old_stock).toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right text-emerald-600 font-semibold">
                          {Number(r.new_stock).toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge variant={Number(r.difference) > 0 ? "destructive" : "secondary"}>
                            {Number(r.difference) > 0 ? "+" : ""}{Number(r.difference).toFixed(2)}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            )}
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
