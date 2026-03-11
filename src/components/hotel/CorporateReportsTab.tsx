import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Building2, TrendingUp } from "lucide-react";
import { format, startOfMonth, endOfMonth } from "date-fns";

export default function CorporateReportsTab() {
  const [companyFilter, setCompanyFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [dateTo, setDateTo] = useState(format(endOfMonth(new Date()), "yyyy-MM-dd"));

  const { data: companies } = useQuery({
    queryKey: ["hotel-companies-report"],
    queryFn: async () => { const { data, error } = await supabase.from("hotel_companies" as any).select("id, name").order("name"); if (error) throw error; return data as any[]; },
  });

  const { data: stays, isLoading } = useQuery({
    queryKey: ["corporate-stays-report", companyFilter, dateFrom, dateTo],
    queryFn: async () => {
      let query = supabase.from("stays" as any)
        .select("*, rooms(room_number, room_types(name)), hotel_companies(name), stay_guests(id)")
        .not("company_id", "is", null)
        .gte("check_in_at", `${dateFrom}T00:00:00`)
        .lte("check_in_at", `${dateTo}T23:59:59`)
        .order("check_in_at", { ascending: false });

      if (companyFilter !== "all") {
        query = query.eq("company_id", companyFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as any[];
    },
  });

  // Summary by company
  const summaryMap = new Map<string, { name: string; nights: number; revenue: number; stays: number; corporateStays: number }>();
  stays?.forEach((s: any) => {
    const compId = s.company_id;
    const compName = s.hotel_companies?.name || "—";
    const checkIn = new Date(s.check_in_at);
    const checkOut = s.check_out_at ? new Date(s.check_out_at) : new Date();
    const nights = Math.max(1, Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24)));

    const existing = summaryMap.get(compId) || { name: compName, nights: 0, revenue: 0, stays: 0, corporateStays: 0 };
    existing.nights += nights;
    existing.revenue += s.total_amount || (nights * (s.rate_per_night || 0));
    existing.stays += 1;
    if (s.source_rate === "corporate") existing.corporateStays += 1;
    summaryMap.set(compId, existing);
  });

  const summaries = Array.from(summaryMap.entries()).map(([id, data]) => ({ id, ...data })).sort((a, b) => b.revenue - a.revenue);
  const totalRevenue = summaries.reduce((sum, s) => sum + s.revenue, 0);
  const totalNights = summaries.reduce((sum, s) => sum + s.nights, 0);

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-wrap gap-4 items-end">
        <div>
          <Label>Empresa</Label>
          <Select value={companyFilter} onValueChange={setCompanyFilter}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las empresas</SelectItem>
              {companies?.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div><Label>Desde</Label><Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-40" /></div>
        <div><Label>Hasta</Label><Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-40" /></div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm text-muted-foreground">Empresas</p>
          <p className="text-2xl font-bold text-foreground">{summaries.length}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm text-muted-foreground">Total Noches</p>
          <p className="text-2xl font-bold text-foreground">{totalNights.toLocaleString()}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm text-muted-foreground">Facturación Total</p>
          <p className="text-2xl font-bold text-foreground">${totalRevenue.toLocaleString()}</p>
        </div>
      </div>

      {/* Summary by company */}
      <div>
        <h4 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-1.5"><TrendingUp className="h-4 w-4" />Resumen por Empresa</h4>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Empresa</TableHead>
              <TableHead>Estancias</TableHead>
              <TableHead>Noches</TableHead>
              <TableHead>Tarifa Corp.</TableHead>
              <TableHead>Facturación</TableHead>
              <TableHead>% del Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Cargando...</TableCell></TableRow> :
             summaries.length === 0 ? <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Sin datos en el periodo</TableCell></TableRow> :
             summaries.map(s => (
              <TableRow key={s.id}>
                <TableCell className="font-medium">{s.name}</TableCell>
                <TableCell>{s.stays}</TableCell>
                <TableCell>{s.nights}</TableCell>
                <TableCell>
                  <Badge variant={s.corporateStays === s.stays ? "default" : "outline"}>
                    {s.corporateStays}/{s.stays}
                  </Badge>
                </TableCell>
                <TableCell className="font-medium">${s.revenue.toLocaleString()}</TableCell>
                <TableCell>{totalRevenue > 0 ? ((s.revenue / totalRevenue) * 100).toFixed(1) : 0}%</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Detail table */}
      <div>
        <h4 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-1.5"><Building2 className="h-4 w-4" />Detalle de Estancias</h4>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Empresa</TableHead>
              <TableHead>Habitación</TableHead>
              <TableHead>Check-in</TableHead>
              <TableHead>Check-out</TableHead>
              <TableHead>Tarifa</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {stays?.length === 0 ? <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">Sin estancias corporativas</TableCell></TableRow> :
             stays?.map((s: any) => {
              const checkIn = new Date(s.check_in_at);
              const checkOut = s.check_out_at ? new Date(s.check_out_at) : null;
              const nights = checkOut ? Math.max(1, Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24))) : "—";
              return (
                <TableRow key={s.id}>
                  <TableCell>{s.hotel_companies?.name}</TableCell>
                  <TableCell>#{s.rooms?.room_number} ({s.rooms?.room_types?.name})</TableCell>
                  <TableCell>{format(checkIn, "dd/MM/yy")}</TableCell>
                  <TableCell>{checkOut ? format(checkOut, "dd/MM/yy") : "—"}</TableCell>
                  <TableCell>${s.rate_per_night?.toLocaleString()}/n</TableCell>
                  <TableCell>
                    <Badge variant={s.source_rate === "corporate" ? "default" : "outline"}>
                      {s.source_rate === "corporate" ? "Corp" : "Std"}
                    </Badge>
                  </TableCell>
                  <TableCell>${(s.total_amount || 0).toLocaleString()}</TableCell>
                  <TableCell><Badge variant={s.status === "checked_in" ? "default" : "secondary"}>{s.status === "checked_in" ? "Activa" : "Cerrada"}</Badge></TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
