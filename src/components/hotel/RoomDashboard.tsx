import { useState, useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  LayoutGrid, List, LogIn, LogOut, Sparkles, Wrench, Eye,
  AlertTriangle, Users, Building2, Search, BedDouble, CalendarPlus
} from "lucide-react";

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  available:   { label: "Disponible",     color: "bg-emerald-500",  icon: BedDouble },
  occupied:    { label: "Ocupada",        color: "bg-red-500",      icon: Users },
  cleaning:    { label: "Limpieza",       color: "bg-yellow-500",   icon: Sparkles },
  maintenance: { label: "Mantenimiento",  color: "bg-gray-700",     icon: Wrench },
};

interface RoomDashboardProps {
  onCheckIn?: (roomId: string) => void;
  onCheckOut?: (stayId: string) => void;
}

export default function RoomDashboard({ onCheckIn, onCheckOut }: RoomDashboardProps) {
  const qc = useQueryClient();
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [filterCompany, setFilterCompany] = useState("all");
  const [filterFloor, setFilterFloor] = useState("all");
  const [search, setSearch] = useState("");
  const [detailRoom, setDetailRoom] = useState<any>(null);

  // Fetch all rooms with types
  const { data: rooms, isLoading } = useQuery({
    queryKey: ["dashboard-rooms"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rooms")
        .select("*, room_types(name, max_occupancy, base_rate)")
        .order("room_number");
      if (error) throw error;
      return data;
    },
  });

  // Fetch active stays with guests and companies
  const { data: activeStays } = useQuery({
    queryKey: ["dashboard-active-stays"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stays" as any)
        .select("*, hotel_companies(name), stay_guests(*, hotel_guests(first_name, last_name, document_number))")
        .eq("status", "checked_in");
      if (error) throw error;
      return data as any[];
    },
  });

  // Fetch pending housekeeping tasks
  const { data: pendingTasks } = useQuery({
    queryKey: ["dashboard-housekeeping-pending"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("housekeeping_tasks" as any)
        .select("id, room_id, task_type, status")
        .in("status", ["pending", "in_progress"]);
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: roomTypes } = useQuery({
    queryKey: ["dashboard-room-types"],
    queryFn: async () => {
      const { data, error } = await supabase.from("room_types").select("id, name").eq("active", true).order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: companies } = useQuery({
    queryKey: ["dashboard-companies"],
    queryFn: async () => {
      const { data, error } = await supabase.from("hotel_companies").select("id, name").eq("active", true).order("name");
      if (error) throw error;
      return data;
    },
  });

  // Fetch reservations for today and upcoming
  const { data: reservations } = useQuery({
    queryKey: ["dashboard-reservations"],
    queryFn: async () => {
      const today = new Date().toISOString().split("T")[0];
      const { data, error } = await supabase
        .from("reservations" as any)
        .select("*, hotel_companies(name), reservation_items(quantity, room_types(name))")
        .in("status", ["pending", "confirmed"])
        .gte("check_out_date", today)
        .order("check_in_date");
      if (error) throw error;
      return data as any[];
    },
  });

  const todayStr = new Date().toISOString().split("T")[0];
  const arrivalsToday = useMemo(() => (reservations || []).filter((r: any) => r.check_in_date === todayStr), [reservations, todayStr]);
  const upcomingReservations = useMemo(() => (reservations || []).filter((r: any) => r.check_in_date > todayStr), [reservations, todayStr]);

  // Realtime subscriptions for automatic dashboard updates
  useEffect(() => {
    const channel = supabase
      .channel("hotel-dashboard-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "rooms" }, () => {
        qc.invalidateQueries({ queryKey: ["dashboard-rooms"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "housekeeping_tasks" }, () => {
        qc.invalidateQueries({ queryKey: ["dashboard-housekeeping-pending"] });
        qc.invalidateQueries({ queryKey: ["dashboard-rooms"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "reservations" }, () => {
        qc.invalidateQueries({ queryKey: ["dashboard-reservations"] });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [qc]);

  // Build enriched room data
  const enrichedRooms = useMemo(() => {
    if (!rooms) return [];
    return rooms.map(room => {
      const stay = activeStays?.find((s: any) => s.room_id === room.id);
      const primaryGuest = stay?.stay_guests?.find((sg: any) => sg.is_primary);
      const guestCount = stay?.stay_guests?.length || 0;
      const hkTask = pendingTasks?.find((t: any) => t.room_id === room.id);

      return {
        ...room,
        stay,
        primaryGuestName: primaryGuest
          ? `${primaryGuest.hotel_guests?.first_name} ${primaryGuest.hotel_guests?.last_name}`
          : null,
        primaryGuestDoc: primaryGuest?.hotel_guests?.document_number || null,
        companyName: stay?.hotel_companies?.name || null,
        companyId: stay?.company_id || null,
        guestCount,
        checkInAt: stay?.check_in_at || null,
        expectedCheckOut: stay?.expected_check_out || null,
        checkoutType: stay?.checkout_type || null,
        hkTask,
      };
    });
  }, [rooms, activeStays, pendingTasks]);

  // Filters
  const filteredRooms = useMemo(() => {
    return enrichedRooms.filter(r => {
      if (filterStatus !== "all" && r.status !== filterStatus) return false;
      if (filterType !== "all" && r.room_type_id !== filterType) return false;
      if (filterCompany !== "all" && r.companyId !== filterCompany) return false;
      if (filterFloor !== "all" && (r.floor || "") !== filterFloor) return false;
      if (search) {
        const q = search.toLowerCase();
        const matches =
          r.room_number.toLowerCase().includes(q) ||
          (r.primaryGuestName || "").toLowerCase().includes(q) ||
          (r.companyName || "").toLowerCase().includes(q);
        if (!matches) return false;
      }
      return true;
    });
  }, [enrichedRooms, filterStatus, filterType, filterCompany, filterFloor, search]);

  const floors = useMemo(() => {
    const set = new Set(rooms?.map(r => r.floor || "").filter(Boolean));
    return Array.from(set).sort();
  }, [rooms]);

  // Status summary
  const summary = useMemo(() => {
    const counts: Record<string, number> = { available: 0, occupied: 0, cleaning: 0, maintenance: 0 };
    enrichedRooms.forEach(r => { counts[r.status] = (counts[r.status] || 0) + 1; });
    return counts;
  }, [enrichedRooms]);

  const StatusDot = ({ status }: { status: string }) => {
    const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.available;
    return <span className={`inline-block w-2.5 h-2.5 rounded-full ${cfg.color}`} />;
  };

  if (isLoading) {
    return <div className="text-center text-muted-foreground py-12">Cargando habitaciones...</div>;
  }

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="flex flex-wrap gap-3">
        {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
          <button
            key={key}
            onClick={() => setFilterStatus(filterStatus === key ? "all" : key)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors ${
              filterStatus === key ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-card-foreground hover:bg-muted"
            }`}
          >
            <span className={`w-3 h-3 rounded-full ${cfg.color}`} />
            <span className="font-medium">{summary[key] || 0}</span>
            <span className="hidden sm:inline">{cfg.label}</span>
          </button>
        ))}
        <div className="ml-auto flex items-center gap-1">
          <span className="text-sm text-muted-foreground mr-1">Total: {enrichedRooms.length}</span>
          <Button
            variant={viewMode === "grid" ? "default" : "outline"} size="icon"
            onClick={() => setViewMode("grid")} title="Vista cuadrícula"
          ><LayoutGrid className="h-4 w-4" /></Button>
          <Button
            variant={viewMode === "table" ? "default" : "outline"} size="icon"
            onClick={() => setViewMode("table")} title="Vista tabla"
          ><List className="h-4 w-4" /></Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar habitación, huésped, empresa..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Tipo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los tipos</SelectItem>
            {roomTypes?.map(rt => <SelectItem key={rt.id} value={rt.id}>{rt.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterCompany} onValueChange={setFilterCompany}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Empresa" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            {companies?.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        {floors.length > 1 && (
          <Select value={filterFloor} onValueChange={setFilterFloor}>
            <SelectTrigger className="w-[120px]"><SelectValue placeholder="Piso" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {floors.map(f => <SelectItem key={f} value={f}>Piso {f}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Grid View */}
      {viewMode === "grid" && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {filteredRooms.map(room => {
            const cfg = STATUS_CONFIG[room.status] || STATUS_CONFIG.available;
            const Icon = cfg.icon;
            return (
              <div
                key={room.id}
                className="border rounded-xl p-3 cursor-pointer transition-all hover:shadow-md hover:scale-[1.02] bg-card"
                onClick={() => setDetailRoom(room)}
              >
                {/* Header */}
                <div className="flex items-center justify-between mb-2">
                  <span className="text-lg font-bold text-foreground">#{room.room_number}</span>
                  <span className={`w-3 h-3 rounded-full ${cfg.color} shrink-0`} title={cfg.label} />
                </div>

                {/* Room type */}
                <p className="text-xs text-muted-foreground mb-2 truncate">{room.room_types?.name}</p>

                {/* Status-specific content */}
                {room.status === "occupied" && (
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-foreground truncate" title={room.primaryGuestName || ""}>
                      {room.primaryGuestName || "—"}
                    </p>
                    {room.companyName && (
                      <div className="flex items-center gap-1">
                        <Building2 className="h-3 w-3 text-muted-foreground shrink-0" />
                        <span className="text-xs text-muted-foreground truncate">{room.companyName}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="flex items-center gap-0.5">
                        <Users className="h-3 w-3" />{room.guestCount}
                      </span>
                      {room.checkInAt && (
                        <span>{format(new Date(room.checkInAt), "dd/MM", { locale: es })}</span>
                      )}
                    </div>
                  </div>
                )}

                {room.status === "cleaning" && (
                  <div className="flex items-center gap-1 text-xs text-yellow-600">
                    <Sparkles className="h-3 w-3" />
                    <span>{room.hkTask?.status === "in_progress" ? "En progreso" : "Pendiente"}</span>
                  </div>
                )}

                {room.status === "maintenance" && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Wrench className="h-3 w-3" />
                    <span>Mantenimiento</span>
                  </div>
                )}

                {room.status === "available" && (
                  <div className="text-xs text-emerald-600 font-medium">Disponible</div>
                )}
              </div>
            );
          })}
          {filteredRooms.length === 0 && (
            <div className="col-span-full text-center text-muted-foreground py-8">
              No se encontraron habitaciones con los filtros aplicados.
            </div>
          )}
        </div>
      )}

      {/* Table View */}
      {viewMode === "table" && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Hab.</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Piso</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Huésped</TableHead>
              <TableHead>Empresa</TableHead>
              <TableHead>Ocupantes</TableHead>
              <TableHead>Check-in</TableHead>
              <TableHead>Salida Est.</TableHead>
              <TableHead className="w-20">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredRooms.map(room => {
              const cfg = STATUS_CONFIG[room.status] || STATUS_CONFIG.available;
              return (
                <TableRow key={room.id}>
                  <TableCell className="font-bold">#{room.room_number}</TableCell>
                  <TableCell>{room.room_types?.name}</TableCell>
                  <TableCell>{room.floor || "—"}</TableCell>
                  <TableCell>
                    <Badge className="gap-1" variant="outline">
                      <StatusDot status={room.status} />{cfg.label}
                    </Badge>
                  </TableCell>
                  <TableCell>{room.primaryGuestName || "—"}</TableCell>
                  <TableCell>{room.companyName || "—"}</TableCell>
                  <TableCell>{room.status === "occupied" ? room.guestCount : "—"}</TableCell>
                  <TableCell>
                    {room.checkInAt ? format(new Date(room.checkInAt), "dd/MM HH:mm", { locale: es }) : "—"}
                  </TableCell>
                  <TableCell>
                    {room.expectedCheckOut ? format(new Date(room.expectedCheckOut), "dd/MM", { locale: es }) : "—"}
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => setDetailRoom(room)}>
                      <Eye className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
            {filteredRooms.length === 0 && (
              <TableRow>
                <TableCell colSpan={10} className="text-center text-muted-foreground">Sin resultados</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      )}

      {/* Room Detail Dialog */}
      <Dialog open={!!detailRoom} onOpenChange={() => setDetailRoom(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Habitación #{detailRoom?.room_number}
              {detailRoom && <StatusDot status={detailRoom.status} />}
            </DialogTitle>
          </DialogHeader>
          {detailRoom && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground">Tipo:</span>
                  <p className="font-medium">{detailRoom.room_types?.name}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Estado:</span>
                  <p className="font-medium">{STATUS_CONFIG[detailRoom.status]?.label}</p>
                </div>
                {detailRoom.floor && (
                  <div>
                    <span className="text-muted-foreground">Piso:</span>
                    <p className="font-medium">{detailRoom.floor}</p>
                  </div>
                )}
                <div>
                  <span className="text-muted-foreground">Capacidad:</span>
                  <p className="font-medium">{detailRoom.room_types?.max_occupancy} personas</p>
                </div>
              </div>

              {detailRoom.status === "occupied" && detailRoom.stay && (
                <>
                  <hr className="border-border" />
                  <div className="space-y-2 text-sm">
                    <h4 className="font-semibold text-foreground">Estancia Actual</h4>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <span className="text-muted-foreground">Huésped:</span>
                        <p className="font-medium">{detailRoom.primaryGuestName}</p>
                        {detailRoom.primaryGuestDoc && (
                          <p className="text-xs text-muted-foreground">{detailRoom.primaryGuestDoc}</p>
                        )}
                      </div>
                      <div>
                        <span className="text-muted-foreground">Ocupantes:</span>
                        <p className="font-medium">{detailRoom.guestCount}</p>
                      </div>
                      {detailRoom.companyName && (
                        <div className="col-span-2">
                          <span className="text-muted-foreground">Empresa:</span>
                          <p className="font-medium flex items-center gap-1">
                            <Building2 className="h-3 w-3" />{detailRoom.companyName}
                          </p>
                        </div>
                      )}
                      <div>
                        <span className="text-muted-foreground">Check-in:</span>
                        <p className="font-medium">
                          {format(new Date(detailRoom.checkInAt), "dd/MM/yyyy HH:mm", { locale: es })}
                        </p>
                      </div>
                      {detailRoom.expectedCheckOut && (
                        <div>
                          <span className="text-muted-foreground">Salida est.:</span>
                          <p className="font-medium">
                            {format(new Date(detailRoom.expectedCheckOut), "dd/MM/yyyy", { locale: es })}
                          </p>
                        </div>
                      )}
                      {detailRoom.stay.rate_per_night != null && (
                        <div>
                          <span className="text-muted-foreground">Tarifa/noche:</span>
                          <p className="font-medium">${Number(detailRoom.stay.rate_per_night).toLocaleString()}</p>
                        </div>
                      )}
                    </div>

                    {/* All guests list */}
                    {detailRoom.stay.stay_guests?.length > 1 && (
                      <div>
                        <span className="text-muted-foreground text-xs">Todos los huéspedes:</span>
                        <ul className="text-xs space-y-0.5 mt-1">
                          {detailRoom.stay.stay_guests.map((sg: any) => (
                            <li key={sg.id} className="flex items-center gap-1">
                              {sg.is_primary && <Badge variant="outline" className="text-[10px] px-1 py-0">titular</Badge>}
                              {sg.hotel_guests?.first_name} {sg.hotel_guests?.last_name}
                              <span className="text-muted-foreground">— {sg.hotel_guests?.document_number}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </>
              )}

              {detailRoom.status === "cleaning" && detailRoom.hkTask && (
                <>
                  <hr className="border-border" />
                  <div className="text-sm space-y-1">
                    <h4 className="font-semibold text-foreground">Limpieza</h4>
                    <p className="text-muted-foreground">
                      Estado: {detailRoom.hkTask.status === "in_progress" ? "En progreso" : "Pendiente"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Use la pestaña Housekeeping para gestionar el checklist.
                    </p>
                  </div>
                </>
              )}

              {/* Quick actions */}
              <div className="flex flex-wrap gap-2 pt-2">
                {detailRoom.status === "available" && onCheckIn && (
                  <Button size="sm" onClick={() => { setDetailRoom(null); onCheckIn(detailRoom.id); }}>
                    <LogIn className="h-4 w-4 mr-1" />Check-in
                  </Button>
                )}
                {detailRoom.status === "occupied" && detailRoom.stay && onCheckOut && (
                  <>
                    <Button size="sm" variant="secondary" onClick={() => { setDetailRoom(null); onCheckOut(detailRoom.stay.id); }}>
                      <LogOut className="h-4 w-4 mr-1" />Check-out
                    </Button>
                    <Button size="sm" variant="outline" className="text-orange-600 border-orange-300 hover:bg-orange-50" onClick={() => { setDetailRoom(null); onCheckOut(detailRoom.stay.id); }}>
                      <AlertTriangle className="h-4 w-4 mr-1" />Salida no notificada
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
