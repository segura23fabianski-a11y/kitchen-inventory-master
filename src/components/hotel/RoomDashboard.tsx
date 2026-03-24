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
import { ScrollArea } from "@/components/ui/scroll-area";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  LayoutGrid, List, LogIn, LogOut, Sparkles, Wrench, Eye,
  AlertTriangle, Users, Building2, Search, BedDouble, CalendarPlus,
  History, ClipboardList, Shirt, CalendarCheck
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
  const [historyRoom, setHistoryRoom] = useState<any>(null);

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

  // ── Room History queries ──
  const { data: roomStays } = useQuery({
    queryKey: ["room-history-stays", historyRoom?.id],
    queryFn: async () => {
      if (!historyRoom) return [];
      const { data, error } = await supabase.from("stays" as any)
        .select("id, status, check_in_at, check_out_at, rate_per_night, checkout_type, hotel_companies(name), stay_guests(is_primary, hotel_guests(first_name, last_name))")
        .eq("room_id", historyRoom.id)
        .order("check_in_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data as any[];
    },
    enabled: !!historyRoom,
  });

  const { data: roomHkTasks } = useQuery({
    queryKey: ["room-history-hk", historyRoom?.id],
    queryFn: async () => {
      if (!historyRoom) return [];
      const { data, error } = await supabase.from("housekeeping_tasks" as any)
        .select("id, task_type, status, created_at, completed_at, assigned_to, priority")
        .eq("room_id", historyRoom.id)
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return data as any[];
    },
    enabled: !!historyRoom,
  });

  const { data: roomLaundry } = useQuery({
    queryKey: ["room-history-laundry", historyRoom?.id],
    queryFn: async () => {
      if (!historyRoom) return [];
      const { data, error } = await supabase.from("laundry_orders" as any)
        .select("id, laundry_type, status, total_pieces, created_at, completed_at")
        .eq("room_id", historyRoom.id)
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return data as any[];
    },
    enabled: !!historyRoom,
  });

  const { data: roomStaff } = useQuery({
    queryKey: ["room-history-staff"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("user_id, full_name").eq("status", "active");
      if (error) throw error;
      return data;
    },
    enabled: !!historyRoom,
  });

  const getStaffNameHist = (userId: string | null) => {
    if (!userId) return "Sin asignar";
    return roomStaff?.find(s => s.user_id === userId)?.full_name || userId.slice(0, 8);
  };

  const todayStr = new Date().toISOString().split("T")[0];
  const arrivalsToday = useMemo(() => (reservations || []).filter((r: any) => r.check_in_date === todayStr), [reservations, todayStr]);
  const upcomingReservations = useMemo(() => (reservations || []).filter((r: any) => r.check_in_date > todayStr), [reservations, todayStr]);

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

  const enrichedRooms = useMemo(() => {
    if (!rooms) return [];
    return rooms.map(room => {
      const stay = activeStays?.find((s: any) => s.room_id === room.id);
      const primaryGuest = stay?.stay_guests?.find((sg: any) => sg.is_primary);
      const guestCount = stay?.stay_guests?.length || 0;
      const hkTask = pendingTasks?.find((t: any) => t.room_id === room.id);

      // Show cleaning status even if room is occupied
      const hasPendingCleaning = !!hkTask;
      const effectiveStatus = room.status === "maintenance"
        ? "maintenance"
        : stay
          ? "occupied"
          : hkTask
            ? "cleaning"
            : "available";

      return {
        ...room,
        status: effectiveStatus,
        hasPendingCleaning,
        hkTaskStatus: hkTask?.status || null,
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

  const summary = useMemo(() => {
    const counts: Record<string, number> = { available: 0, occupied: 0, cleaning: 0, maintenance: 0 };
    enrichedRooms.forEach(r => { counts[r.status] = (counts[r.status] || 0) + 1; });
    return counts;
  }, [enrichedRooms]);

  const StatusDot = ({ status }: { status: string }) => {
    const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.available;
    return <span className={`inline-block w-2.5 h-2.5 rounded-full ${cfg.color}`} />;
  };

  const TASK_TYPE_LABELS: Record<string, string> = {
    checkout_clean: "Check-out", daily_clean: "Diaria", daily: "Diaria", maintenance: "Mant.",
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
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-card text-card-foreground text-sm">
          <CalendarPlus className="h-4 w-4 text-primary" />
          <span className="font-medium">{arrivalsToday.length}</span>
          <span className="hidden sm:inline">Llegadas hoy</span>
        </div>
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-card text-card-foreground text-sm">
          <CalendarPlus className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">{upcomingReservations.length}</span>
          <span className="hidden sm:inline">Reservas futuras</span>
        </div>
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
                <div className="flex items-center justify-between mb-2">
                  <span className="text-lg font-bold text-foreground">#{room.room_number}</span>
                  <div className="flex items-center gap-1">
                    {/* Show cleaning indicator on occupied rooms */}
                    {room.status === "occupied" && room.hasPendingCleaning && (
                      <span className={`w-2.5 h-2.5 rounded-full bg-yellow-500`} title="Limpieza pendiente" />
                    )}
                    <span className={`w-3 h-3 rounded-full ${cfg.color} shrink-0`} title={cfg.label} />
                  </div>
                </div>

                <p className="text-xs text-muted-foreground mb-2 truncate">{room.room_types?.name}</p>

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
                      {room.hasPendingCleaning && (
                        <span className="flex items-center gap-0.5 text-yellow-600">
                          <Sparkles className="h-3 w-3" />
                          {room.hkTaskStatus === "in_progress" ? "Limpiando" : "Limpieza pend."}
                        </span>
                      )}
                      {!room.hasPendingCleaning && room.checkInAt && (
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
              <TableHead>Limpieza</TableHead>
              <TableHead>Huésped</TableHead>
              <TableHead>Empresa</TableHead>
              <TableHead>Ocupantes</TableHead>
              <TableHead>Check-in</TableHead>
              <TableHead className="w-24">Acciones</TableHead>
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
                  <TableCell>
                    {room.hasPendingCleaning ? (
                      <Badge variant="outline" className="gap-1 text-yellow-600 border-yellow-300">
                        <Sparkles className="h-3 w-3" />
                        {room.hkTaskStatus === "in_progress" ? "En progreso" : "Pendiente"}
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>{room.primaryGuestName || "—"}</TableCell>
                  <TableCell>{room.companyName || "—"}</TableCell>
                  <TableCell>{room.status === "occupied" ? room.guestCount : "—"}</TableCell>
                  <TableCell>
                    {room.checkInAt ? format(new Date(room.checkInAt), "dd/MM HH:mm", { locale: es }) : "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => setDetailRoom(room)} title="Detalle">
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => setHistoryRoom(room)} title="Historial">
                        <History className="h-4 w-4" />
                      </Button>
                    </div>
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

              {/* Cleaning status on occupied rooms */}
              {detailRoom.status === "occupied" && detailRoom.hasPendingCleaning && (
                <div className="rounded-md border border-yellow-300 bg-yellow-50 dark:bg-yellow-950/20 p-2 flex items-center gap-2 text-sm">
                  <Sparkles className="h-4 w-4 text-yellow-600 shrink-0" />
                  <span className="text-yellow-700 dark:text-yellow-400">
                    Limpieza {detailRoom.hkTaskStatus === "in_progress" ? "en progreso" : "pendiente"}
                  </span>
                </div>
              )}

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
                  </div>
                </>
              )}

              {/* Quick actions */}
              <div className="flex flex-wrap gap-2 pt-2">
                <Button size="sm" variant="outline" onClick={() => { setDetailRoom(null); setHistoryRoom(detailRoom); }}>
                  <History className="h-4 w-4 mr-1" />Historial
                </Button>
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

      {/* ── Room History Dialog ── */}
      <Dialog open={!!historyRoom} onOpenChange={() => setHistoryRoom(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Historial — Hab #{historyRoom?.room_number}
              <span className="text-sm font-normal text-muted-foreground">({historyRoom?.room_types?.name})</span>
            </DialogTitle>
          </DialogHeader>
          <Tabs defaultValue="stays" className="mt-2">
            <TabsList className="w-full justify-start">
              <TabsTrigger value="stays" className="gap-1"><CalendarCheck className="h-3.5 w-3.5" />Estancias</TabsTrigger>
              <TabsTrigger value="housekeeping" className="gap-1"><ClipboardList className="h-3.5 w-3.5" />Aseo</TabsTrigger>
              <TabsTrigger value="laundry" className="gap-1"><Shirt className="h-3.5 w-3.5" />Lavandería</TabsTrigger>
            </TabsList>

            <TabsContent value="stays">
              <ScrollArea className="h-[400px]">
                {!roomStays || roomStays.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">Sin estancias registradas</p>
                ) : (
                  <div className="space-y-2">
                    {roomStays.map((s: any) => {
                      const primaryGuest = s.stay_guests?.find((sg: any) => sg.is_primary);
                      const guestName = primaryGuest ? `${primaryGuest.hotel_guests?.first_name} ${primaryGuest.hotel_guests?.last_name}` : "—";
                      return (
                        <div key={s.id} className="rounded-lg border p-3 space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-sm">{guestName}</span>
                            <Badge variant={s.status === "checked_in" ? "default" : "outline"}>
                              {s.status === "checked_in" ? "Activa" : s.status === "checked_out" ? "Finalizada" : s.status}
                            </Badge>
                          </div>
                          <div className="grid grid-cols-2 gap-x-4 text-xs text-muted-foreground">
                            <span>Check-in: {format(new Date(s.check_in_at), "dd/MM/yy HH:mm")}</span>
                            <span>Check-out: {s.check_out_at ? format(new Date(s.check_out_at), "dd/MM/yy HH:mm") : "—"}</span>
                            {s.hotel_companies?.name && <span>Empresa: {s.hotel_companies.name}</span>}
                            {s.rate_per_night != null && <span>Tarifa: ${Number(s.rate_per_night).toLocaleString()}/noche</span>}
                            {s.checkout_type && <span>Tipo salida: {s.checkout_type}</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>

            <TabsContent value="housekeeping">
              <ScrollArea className="h-[400px]">
                {!roomHkTasks || roomHkTasks.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">Sin tareas de aseo registradas</p>
                ) : (
                  <div className="space-y-2">
                    {roomHkTasks.map((t: any) => (
                      <div key={t.id} className="rounded-lg border p-3 flex items-center justify-between">
                        <div className="space-y-0.5">
                          <span className="text-sm font-medium">
                            {TASK_TYPE_LABELS[t.task_type] || t.task_type}
                          </span>
                          <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3">
                            <span>Creada: {format(new Date(t.created_at), "dd/MM/yy HH:mm")}</span>
                            {t.completed_at && <span>Completada: {format(new Date(t.completed_at), "dd/MM/yy HH:mm")}</span>}
                            <span>Resp: {getStaffNameHist(t.assigned_to)}</span>
                          </div>
                        </div>
                        <Badge variant={t.status === "done" ? "default" : t.status === "in_progress" ? "secondary" : "outline"}>
                          {t.status === "done" ? "Completada" : t.status === "in_progress" ? "En progreso" : "Pendiente"}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>

            <TabsContent value="laundry">
              <ScrollArea className="h-[400px]">
                {!roomLaundry || roomLaundry.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">Sin órdenes de lavandería</p>
                ) : (
                  <div className="space-y-2">
                    {roomLaundry.map((lo: any) => (
                      <div key={lo.id} className="rounded-lg border p-3 flex items-center justify-between">
                        <div className="space-y-0.5">
                          <span className="text-sm font-medium">
                            {lo.laundry_type === "hotel_linen" ? "Lencería Hotel" : "Ropa Personal"} — {lo.total_pieces} pzas
                          </span>
                          <div className="text-xs text-muted-foreground">
                            <span>{format(new Date(lo.created_at), "dd/MM/yy HH:mm")}</span>
                            {lo.completed_at && <span className="ml-3">Entregada: {format(new Date(lo.completed_at), "dd/MM/yy HH:mm")}</span>}
                          </div>
                        </div>
                        <Badge variant={lo.status === "delivered" || lo.status === "completed" ? "default" : "outline"}>
                          {lo.status === "pending" ? "Pendiente" : lo.status === "in_progress" ? "En proceso" : lo.status === "delivered" ? "Entregada" : lo.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </div>
  );
}
