import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { NumericKeypadInput } from "@/components/ui/numeric-keypad-input";
import { useToast } from "@/hooks/use-toast";
import { useAudit } from "@/hooks/use-audit";
import { DollarSign, ArrowRight, AlertTriangle } from "lucide-react";
import { formatCOP } from "@/lib/utils";

interface Product {
  id: string;
  name: string;
  unit: string;
  current_stock: number;
  average_cost: number;
  last_unit_cost: number | null;
}

interface Props {
  product: Product | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function CostRevaluationDialog({ product, open, onOpenChange }: Props) {
  const [newCost, setNewCost] = useState("");
  const [reason, setReason] = useState("");
  const [confirmStep, setConfirmStep] = useState(false);
  const { toast } = useToast();
  const { logAudit } = useAudit();
  const qc = useQueryClient();

  const reset = () => {
    setNewCost("");
    setReason("");
    setConfirmStep(false);
  };

  const handleClose = (v: boolean) => {
    if (!v) reset();
    onOpenChange(v);
  };

  const oldCost = product ? (Number(product.average_cost) || Number(product.last_unit_cost) || 0) : 0;
  const stock = product ? Number(product.current_stock) : 0;
  const newCostNum = Number(newCost) || 0;
  const oldValue = stock * oldCost;
  const newValue = stock * newCostNum;
  const diff = newValue - oldValue;
  const isValid = newCostNum > 0 && reason.trim().length >= 3 && newCostNum !== oldCost;

  const revalueMutation = useMutation({
    mutationFn: async () => {
      if (!product) return;

      const { error } = await supabase
        .from("products")
        .update({
          average_cost: newCostNum,
          last_unit_cost: newCostNum,
        })
        .eq("id", product.id);

      if (error) throw error;

      await logAudit({
        entityType: "product",
        entityId: product.id,
        action: "COST_CHANGE" as any,
        before: {
          average_cost: oldCost,
          last_unit_cost: product.last_unit_cost,
        },
        after: {
          average_cost: newCostNum,
          last_unit_cost: newCostNum,
        },
        canRollback: true,
        metadata: {
          revaluation: true,
          product_name: product.name,
          current_stock: stock,
          old_cost: oldCost,
          new_cost: newCostNum,
          old_inventory_value: oldValue,
          new_inventory_value: newValue,
          value_difference: diff,
          reason: reason.trim(),
        },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products"] });
      handleClose(false);
      toast({ title: "Costo actualizado", description: `${product?.name}: ${formatCOP(oldCost, 2)} → ${formatCOP(newCostNum, 2)}` });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  if (!product) return null;

  const fmt = (n: number) => n.toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-primary" />
            Revalorización de Costo
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Product Info */}
          <div className="rounded-lg border bg-muted/30 p-3 space-y-1">
            <p className="font-medium text-sm">{product.name}</p>
            <div className="grid grid-cols-2 gap-2 text-sm text-muted-foreground">
              <span>Stock actual: <strong className="text-foreground">{stock} {product.unit}</strong></span>
              <span>Costo prom.: <strong className="text-foreground">${fmt(Number(product.average_cost))}</strong></span>
              <span>Último costo: <strong className="text-foreground">${fmt(Number(product.last_unit_cost ?? 0))}</strong></span>
              <span>Valor total: <strong className="text-foreground">${fmt(oldValue)}</strong></span>
            </div>
          </div>

          {!confirmStep ? (
            <>
              {/* New cost input */}
              <div className="space-y-2">
                <Label>Nuevo costo unitario</Label>
                <NumericKeypadInput
                  value={newCost}
                  onChange={setNewCost}
                  placeholder="0.00"
                />
              </div>

              {/* Reason */}
              <div className="space-y-2">
                <Label>Motivo de la corrección *</Label>
                <Textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Ej: Precio subido incorrectamente al sistema..."
                  maxLength={500}
                  rows={3}
                />
              </div>

              {/* Preview */}
              {newCostNum > 0 && (
                <div className="rounded-lg border p-3 space-y-2">
                  <p className="text-sm font-medium">Vista previa del cambio</p>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">Costo:</span>
                    <span className="font-mono">${fmt(oldCost)}</span>
                    <ArrowRight className="h-3 w-3 text-muted-foreground" />
                    <span className="font-mono font-semibold text-primary">${fmt(newCostNum)}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">Valor inv.:</span>
                    <span className="font-mono">${fmt(oldValue)}</span>
                    <ArrowRight className="h-3 w-3 text-muted-foreground" />
                    <span className="font-mono font-semibold">${fmt(newValue)}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">Diferencia:</span>
                    <Badge variant={diff > 0 ? "default" : "destructive"} className="font-mono">
                      {diff >= 0 ? "+" : ""}${fmt(diff)}
                    </Badge>
                  </div>
                </div>
              )}

              <Button className="w-full" disabled={!isValid} onClick={() => setConfirmStep(true)}>
                Revisar y confirmar
              </Button>
            </>
          ) : (
            <>
              {/* Confirmation step */}
              <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 p-4 space-y-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="font-medium text-sm">¿Confirmar revalorización?</p>
                    <p className="text-sm text-muted-foreground">
                      Se actualizará el costo de <strong>{product.name}</strong> de <strong>${fmt(oldCost)}</strong> a <strong>${fmt(newCostNum)}</strong>.
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Diferencia en valor de inventario: <strong>{diff >= 0 ? "+" : ""}${fmt(diff)}</strong>
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">Motivo: {reason}</p>
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setConfirmStep(false)}>
                  Volver
                </Button>
                <Button
                  className="flex-1"
                  variant="destructive"
                  disabled={revalueMutation.isPending}
                  onClick={() => revalueMutation.mutate()}
                >
                  {revalueMutation.isPending ? "Aplicando..." : "Confirmar Revalorización"}
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
