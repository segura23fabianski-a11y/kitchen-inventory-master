import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurantId } from "@/hooks/use-restaurant";
import { useAuth } from "@/lib/auth";
import { usePermissions } from "@/hooks/use-permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  DollarSign, Lock, Unlock, Clock, AlertTriangle, CheckCircle2, Eye, EyeOff,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { formatCOP } from "@/lib/utils";

const DENOMINATIONS = [
  { value: 100000, label: "$100.000" },
  { value: 50000, label: "$50.000" },
  { value: 20000, label: "$20.000" },
  { value: 10000, label: "$10.000" },
  { value: 5000, label: "$5.000" },
  { value: 2000, label: "$2.000" },
  { value: 1000, label: "$1.000" },
  { value: 500, label: "$500" },
  { value: 200, label: "$200" },
  { value: 100, label: "$100" },
];

type DenomCount = { denomination: number; quantity: number };

function DenominationGrid({
  counts,
  onChange,
}: {
  counts: DenomCount[];
  onChange: (counts: DenomCount[]) => void;
}) {
  const total = counts.reduce((s, c) => s + c.denomination * c.quantity, 0);

  const updateQty = (denom: number, qty: string) => {
    const n = parseInt(qty) || 0;
    onChange(counts.map(c => c.denomination === denom ? { ...c, quantity: Math.max(0, n) } : c));
  };

  return (
    <div className="space-y-2">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Denominación</TableHead>
            <TableHead className="w-[100px]">Cantidad</TableHead>
            <TableHead className="text-right">Subtotal</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {counts.map(c => (
            <TableRow key={c.denomination}>
              <TableCell className="font-medium">
                {DENOMINATIONS.find(d => d.value === c.denomination)?.label}
              </TableCell>
              <TableCell>
                <Input
                  type="number"
                  min={0}
                  value={c.quantity || ""}
                  onChange={e => updateQty(c.denomination, e.target.value)}
                  className="h-9 w-20 text-center"
                  placeholder="0"
                />
              </TableCell>
              <TableCell className="text-right font-mono">
                ${(c.denomination * c.quantity).toLocaleString()}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <div className="flex justify-between items-center rounded-lg border-2 border-primary/30 bg-primary/5 px-4 py-3">
        <span className="font-semibold text-lg">Total contado</span>
        <span className="font-bold text-xl font-mono">${total.toLocaleString()}</span>
      </div>
    </div>
  );
}

function emptyDenomCounts(): DenomCount[] {
  return DENOMINATIONS.map(d => ({ denomination: d.value, quantity: 0 }));
}

function denomTotal(counts: DenomCount[]): number {
  return counts.reduce((s, c) => s + c.denomination * c.quantity, 0);
}

export default function POSCashRegisterTab() {
  const restaurantId = useRestaurantId();
  const { user } = useAuth();
  const { hasPermission } = usePermissions();
  const qc = useQueryClient();

  const canOpen = hasPermission("cash_open");
  const canClose = hasPermission("cash_close");
  const canViewHistory = hasPermission("cash_register_view");
  const canViewReconciliation = hasPermission("cash_reconciliation_view") || hasPermission("cash_reconciliation_admin");

  // Dialog state
  const [openDialog, setOpenDialog] = useState<"open" | "close" | null>(null);
  const [denomCounts, setDenomCounts] = useState<DenomCount[]>(emptyDenomCounts());
  const [nextBase, setNextBase] = useState("");
  const [closeNotes, setCloseNotes] = useState("");
  const [detailSession, setDetailSession] = useState<any>(null);

  // Current open session
  const { data: activeSession } = useQuery({
    queryKey: ["cash-session-active", restaurantId, user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cash_sessions" as any)
        .select("*")
        .eq("restaurant_id", restaurantId!)
        .eq("opened_by", user!.id)
        .eq("status", "open")
        .order("opened_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
    enabled: !!restaurantId && !!user,
  });

  // Session history
  const { data: sessions = [] } = useQuery({
    queryKey: ["cash-sessions-history", restaurantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cash_sessions" as any)
        .select("*")
        .eq("restaurant_id", restaurantId!)
        .order("opened_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as any[];
    },
    enabled: !!restaurantId && canViewHistory,
  });

  // Cash sales for active session (for expected calculation)
  const { data: cashSalesTotal = 0 } = useQuery({
    queryKey: ["cash-sales-total", activeSession?.id],
    queryFn: async () => {
      if (!activeSession) return 0;
      const { data, error } = await supabase
        .from("pos_orders")
        .select("total")
        .eq("restaurant_id", restaurantId!)
        .eq("billing_mode", "cash")
        .eq("status", "closed")
        .gte("created_at", activeSession.opened_at);
      if (error) throw error;
      return (data || []).reduce((s: number, o: any) => s + Number(o.total), 0);
    },
    enabled: !!activeSession,
  });

  const openCash = useMutation({
    mutationFn: async () => {
      const total = denomTotal(denomCounts);
      const { error } = await supabase.from("cash_sessions" as any).insert({
        restaurant_id: restaurantId!,
        opened_by: user!.id,
        opening_count: denomCounts,
        opening_total: total,
        status: "open",
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cash-session-active"] });
      qc.invalidateQueries({ queryKey: ["cash-sessions-history"] });
      toast.success("Caja abierta correctamente");
      resetDialog();
    },
    onError: () => toast.error("Error al abrir caja"),
  });

  const closeCash = useMutation({
    mutationFn: async () => {
      if (!activeSession) throw new Error("No hay caja abierta");
      const closingTotal = denomTotal(denomCounts);
      const nextBaseNum = parseFloat(nextBase) || 0;
      const withdrawalNum = closingTotal - nextBaseNum;
      const openingTotal = Number(activeSession.opening_total) || 0;
      const expectedCash = openingTotal + cashSalesTotal;
      const diff = closingTotal - expectedCash;

      const { error } = await supabase.from("cash_sessions" as any).update({
        closed_by: user!.id,
        closed_at: new Date().toISOString(),
        closing_count: denomCounts,
        closing_total: closingTotal,
        next_base: nextBaseNum,
        withdrawal: withdrawalNum > 0 ? withdrawalNum : 0,
        expected_cash: expectedCash,
        difference: diff,
        notes: closeNotes.trim() || null,
        status: "closed",
      } as any).eq("id", activeSession.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cash-session-active"] });
      qc.invalidateQueries({ queryKey: ["cash-sessions-history"] });
      toast.success("Caja cerrada correctamente");
      resetDialog();
    },
    onError: () => toast.error("Error al cerrar caja"),
  });

  const resetDialog = () => {
    setOpenDialog(null);
    setDenomCounts(emptyDenomCounts());
    setNextBase("");
    setCloseNotes("");
  };

  const closingTotal = denomTotal(denomCounts);

  return (
    <div className="space-y-6">
      {/* ── Status Card ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <DollarSign className="h-5 w-5" />
            Estado de Caja
          </CardTitle>
        </CardHeader>
        <CardContent>
          {activeSession ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Badge variant="default" className="gap-1"><Unlock className="h-3 w-3" /> Abierta</Badge>
                <span className="text-sm text-muted-foreground">
                  desde {format(new Date(activeSession.opened_at), "HH:mm · dd/MM/yyyy")}
                </span>
              </div>
              <div className="text-sm">
                <span className="text-muted-foreground">Base inicial: </span>
                <span className="font-mono font-semibold">{formatCOP(activeSession.opening_total)}</span>
              </div>
              <div className="flex gap-2">
                {canClose && (
                  <Button variant="destructive" onClick={() => { setDenomCounts(emptyDenomCounts()); setOpenDialog("close"); }}>
                    <Lock className="h-4 w-4 mr-1" /> Cerrar Caja
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="gap-1"><Lock className="h-3 w-3" /> Sin caja abierta</Badge>
              </div>
              {canOpen && (
                <Button onClick={() => { setDenomCounts(emptyDenomCounts()); setOpenDialog("open"); }}>
                  <Unlock className="h-4 w-4 mr-1" /> Abrir Caja
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── History ── */}
      {canViewHistory && sessions.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Clock className="h-5 w-5" />
              Historial de Caja
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Apertura</TableHead>
                  <TableHead>Cierre</TableHead>
                  <TableHead className="text-right">Base inicial</TableHead>
                  <TableHead className="text-right">Contado</TableHead>
                  {canViewReconciliation && (
                    <>
                      <TableHead className="text-right">Esperado</TableHead>
                      <TableHead className="text-right">Diferencia</TableHead>
                    </>
                  )}
                  <TableHead>Estado</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions.map((s: any) => {
                  const diff = s.difference != null ? Number(s.difference) : null;
                  return (
                    <TableRow key={s.id}>
                      <TableCell className="text-sm">{format(new Date(s.opened_at), "dd/MM/yyyy")}</TableCell>
                      <TableCell className="text-sm font-mono">{format(new Date(s.opened_at), "HH:mm")}</TableCell>
                      <TableCell className="text-sm font-mono">{s.closed_at ? format(new Date(s.closed_at), "HH:mm") : "—"}</TableCell>
                      <TableCell className="text-right font-mono">{formatCOP(s.opening_total)}</TableCell>
                      <TableCell className="text-right font-mono">{s.closing_total != null ? `{formatCOP(Number(s.closing_total))}` : "—"}</TableCell>
                      {canViewReconciliation && (
                        <>
                          <TableCell className="text-right font-mono">{s.expected_cash != null ? `{formatCOP(Number(s.expected_cash))}` : "—"}</TableCell>
                          <TableCell className="text-right">
                            {diff != null ? (
                              <span className={`font-mono font-semibold ${diff < 0 ? "text-destructive" : diff > 0 ? "text-green-600" : "text-muted-foreground"}`}>
                                {diff > 0 ? "+" : ""}{diff.toLocaleString()}
                              </span>
                            ) : "—"}
                          </TableCell>
                        </>
                      )}
                      <TableCell>
                        <Badge variant={s.status === "open" ? "default" : "secondary"}>
                          {s.status === "open" ? "Abierta" : "Cerrada"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDetailSession(s)}>
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* ═══ OPEN CASH DIALOG ═══ */}
      <Dialog open={openDialog === "open"} onOpenChange={v => !v && resetDialog()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Unlock className="h-5 w-5" /> Apertura de Caja
            </DialogTitle>
            <p className="text-sm text-muted-foreground">
              Cuenta los billetes y monedas para registrar la base inicial.
            </p>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            <DenominationGrid counts={denomCounts} onChange={setDenomCounts} />
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={resetDialog}>Cancelar</Button>
            <Button onClick={() => openCash.mutate()} disabled={openCash.isPending}>
              {openCash.isPending ? "Abriendo..." : "Abrir Caja"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ CLOSE CASH DIALOG ═══ */}
      <Dialog open={openDialog === "close"} onOpenChange={v => !v && resetDialog()}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5" /> Cierre de Caja
            </DialogTitle>
            <p className="text-sm text-muted-foreground">
              Cuenta todo el dinero en caja. El sistema registrará el resultado.
            </p>
          </DialogHeader>
          <ScrollArea className="max-h-[55vh]">
            <div className="space-y-4">
              <DenominationGrid counts={denomCounts} onChange={setDenomCounts} />

              <Separator />

              <div className="space-y-2">
                <Label>Base para el siguiente turno</Label>
                <Input
                  type="number"
                  min={0}
                  value={nextBase}
                  onChange={e => setNextBase(e.target.value)}
                  placeholder="Ej: 100000"
                />
                {closingTotal > 0 && parseFloat(nextBase) >= 0 && (
                  <div className="text-sm text-muted-foreground">
                    Retiro de caja: <span className="font-mono font-semibold text-foreground">
                      ${Math.max(0, closingTotal - (parseFloat(nextBase) || 0)).toLocaleString()}
                    </span>
                  </div>
                )}
              </div>

              <div>
                <Label>Observaciones</Label>
                <Textarea
                  value={closeNotes}
                  onChange={e => setCloseNotes(e.target.value)}
                  placeholder="Notas del cierre..."
                  className="h-16 resize-none"
                />
              </div>
            </div>
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={resetDialog}>Cancelar</Button>
            <Button
              variant="destructive"
              onClick={() => closeCash.mutate()}
              disabled={closeCash.isPending || closingTotal === 0}
            >
              {closeCash.isPending ? "Cerrando..." : "Cerrar Caja"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ DETAIL DIALOG ═══ */}
      <Dialog open={!!detailSession} onOpenChange={v => !v && setDetailSession(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Detalle de Caja</DialogTitle>
          </DialogHeader>
          {detailSession && (
            <ScrollArea className="max-h-[65vh]">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Apertura:</span>
                    <p className="font-mono">{format(new Date(detailSession.opened_at), "HH:mm · dd/MM/yyyy")}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Cierre:</span>
                    <p className="font-mono">{detailSession.closed_at ? format(new Date(detailSession.closed_at), "HH:mm · dd/MM/yyyy") : "—"}</p>
                  </div>
                </div>

                <Separator />

                <div>
                  <p className="text-sm font-semibold mb-1">Conteo de apertura</p>
                  {renderDenomSummary(detailSession.opening_count)}
                  <p className="text-right font-mono font-bold mt-1">Total: {formatCOP(detailSession.opening_total)}</p>
                </div>

                {detailSession.closing_count && (
                  <>
                    <Separator />
                    <div>
                      <p className="text-sm font-semibold mb-1">Conteo de cierre</p>
                      {renderDenomSummary(detailSession.closing_count)}
                      <p className="text-right font-mono font-bold mt-1">Total: {formatCOP(detailSession.closing_total)}</p>
                    </div>
                  </>
                )}

                {detailSession.next_base != null && (
                  <>
                    <Separator />
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <span className="text-muted-foreground">Base siguiente:</span>
                        <p className="font-mono font-semibold">{formatCOP(detailSession.next_base)}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Retiro:</span>
                        <p className="font-mono font-semibold">{formatCOP(detailSession.withdrawal || 0)}</p>
                      </div>
                    </div>
                  </>
                )}

                {canViewReconciliation && detailSession.expected_cash != null && (
                  <>
                    <Separator />
                    <div className="rounded-lg border p-3 space-y-1 bg-muted/30">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                        <EyeOff className="h-3 w-3" /> Conciliación (solo admin)
                      </p>
                      <div className="flex justify-between text-sm">
                        <span>Esperado en efectivo</span>
                        <span className="font-mono">{formatCOP(detailSession.expected_cash)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span>Contado</span>
                        <span className="font-mono">{formatCOP(detailSession.closing_total)}</span>
                      </div>
                      <div className="flex justify-between text-sm font-bold border-t pt-1">
                        <span>Diferencia</span>
                        {(() => {
                          const d = Number(detailSession.difference);
                          return (
                            <span className={`font-mono ${d < 0 ? "text-destructive" : d > 0 ? "text-green-600" : ""}`}>
                              {d > 0 ? "+" : ""}{d.toLocaleString()}
                              {d < 0 && " (faltante)"}
                              {d > 0 && " (sobrante)"}
                            </span>
                          );
                        })()}
                      </div>
                    </div>
                  </>
                )}

                {detailSession.notes && (
                  <>
                    <Separator />
                    <div>
                      <p className="text-sm font-semibold mb-1">Observaciones</p>
                      <p className="text-sm text-muted-foreground">{detailSession.notes}</p>
                    </div>
                  </>
                )}
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function renderDenomSummary(counts: any) {
  if (!Array.isArray(counts)) return <p className="text-xs text-muted-foreground">Sin datos</p>;
  const nonZero = counts.filter((c: any) => c.quantity > 0);
  if (nonZero.length === 0) return <p className="text-xs text-muted-foreground">Sin billetes registrados</p>;
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
      {nonZero.map((c: any) => (
        <div key={c.denomination} className="flex justify-between">
          <span>{DENOMINATIONS.find(d => d.value === c.denomination)?.label || `$${c.denomination}`}</span>
          <span className="font-mono">{c.quantity} = ${(c.denomination * c.quantity).toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}
