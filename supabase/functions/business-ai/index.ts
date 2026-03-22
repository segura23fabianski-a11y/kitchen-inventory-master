import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

/* ------------------------------------------------------------------ */
/*  Helper: run a query safely, return [] on error                     */
/* ------------------------------------------------------------------ */
async function safeQuery(
  db: ReturnType<typeof createClient>,
  table: string,
  select: string,
  filters: Record<string, unknown>,
  opts?: { limit?: number; order?: string; ascending?: boolean }
) {
  let q = db.from(table).select(select);
  for (const [k, v] of Object.entries(filters)) q = q.eq(k, v);
  if (opts?.order) q = q.order(opts.order, { ascending: opts.ascending ?? false });
  if (opts?.limit) q = q.limit(opts.limit);
  const { data, error } = await q;
  if (error) { console.error(`Query ${table}:`, error.message); return []; }
  return data ?? [];
}

/* ------------------------------------------------------------------ */
/*  Build business data context based on user permissions              */
/* ------------------------------------------------------------------ */
async function buildBusinessContext(
  db: ReturnType<typeof createClient>,
  restaurantId: string,
  permissions: string[]
) {
  const has = (k: string) => permissions.includes(k);
  const ctx: string[] = [];
  const today = new Date().toISOString().split("T")[0];
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];

  // --- Products / Inventory ---
  if (has("products") || has("dashboard")) {
    const products = await safeQuery(db, "products", "id,name,current_stock,average_cost,min_stock,unit,last_unit_cost", { restaurant_id: restaurantId });
    const totalValue = products.reduce((s: number, p: any) => s + (p.current_stock ?? 0) * (p.average_cost ?? 0), 0);
    const lowStock = products.filter((p: any) => p.min_stock && p.current_stock < p.min_stock);
    const negStock = products.filter((p: any) => (p.current_stock ?? 0) < 0);
    ctx.push(`INVENTARIO (${products.length} productos):`);
    ctx.push(`- Valor total inventario: $${totalValue.toFixed(0)}`);
    ctx.push(`- Productos en stock bajo: ${lowStock.length}`);
    if (negStock.length) ctx.push(`- ⚠️ Productos con stock negativo: ${negStock.length}`);
    if (lowStock.length > 0 && lowStock.length <= 10) {
      ctx.push(`- Detalle stock bajo: ${lowStock.map((p: any) => `${p.name}(${p.current_stock}/${p.min_stock})`).join(", ")}`);
    }
  }

  // --- Sales (POS) ---
  if (has("pos_view") || has("pos_restaurant") || has("reports")) {
    const { data: orders } = await db.from("pos_orders").select("id,total,billing_mode,company_id,status,created_at,service_period")
      .eq("restaurant_id", restaurantId).gte("created_at", thirtyDaysAgo + "T00:00:00").eq("is_test_record", false);
    const ords = orders ?? [];
    const completed = ords.filter((o: any) => o.status === "completed");
    const totalSales = completed.reduce((s: number, o: any) => s + (o.total ?? 0), 0);
    const corpSales = completed.filter((o: any) => o.billing_mode === "corporate_charge");
    const corpTotal = corpSales.reduce((s: number, o: any) => s + (o.total ?? 0), 0);
    const indTotal = totalSales - corpTotal;
    ctx.push(`\nVENTAS (últimos 30 días):`);
    ctx.push(`- Pedidos completados: ${completed.length}`);
    ctx.push(`- Total ventas: $${totalSales.toFixed(0)}`);
    ctx.push(`- Ventas corporativas: $${corpTotal.toFixed(0)} (${corpSales.length} pedidos)`);
    ctx.push(`- Ventas individuales: $${indTotal.toFixed(0)}`);

    // Sales by service period
    const byPeriod: Record<string, number> = {};
    completed.forEach((o: any) => { byPeriod[o.service_period] = (byPeriod[o.service_period] || 0) + (o.total ?? 0); });
    if (Object.keys(byPeriod).length) {
      ctx.push(`- Ventas por período: ${Object.entries(byPeriod).map(([k, v]) => `${k}: $${v.toFixed(0)}`).join(", ")}`);
    }
  }

  // --- Movements / Consumption ---
  if (has("movements") || has("reports")) {
    const { data: movs } = await db.from("inventory_movements")
      .select("type,total_cost,quantity,product_id")
      .eq("restaurant_id", restaurantId)
      .gte("movement_date", thirtyDaysAgo);
    const mv = movs ?? [];
    const consumption = mv.filter((m: any) => ["salida", "pos_sale", "operational_consumption"].includes(m.type));
    const waste = mv.filter((m: any) => ["merma", "desperdicio", "vencimiento", "daño"].includes(m.type));
    const entries = mv.filter((m: any) => m.type === "entrada");
    const totalConsumption = consumption.reduce((s: number, m: any) => s + (m.total_cost ?? 0), 0);
    const totalWaste = waste.reduce((s: number, m: any) => s + (m.total_cost ?? 0), 0);
    const totalEntries = entries.reduce((s: number, m: any) => s + (m.total_cost ?? 0), 0);
    ctx.push(`\nMOVIMIENTOS (últimos 30 días):`);
    ctx.push(`- Entradas (compras): $${totalEntries.toFixed(0)}`);
    ctx.push(`- Consumo total: $${totalConsumption.toFixed(0)} (${consumption.length} movimientos)`);
    ctx.push(`- Desperdicios/mermas: $${totalWaste.toFixed(0)} (${waste.length} movimientos)`);
    if (totalConsumption > 0) {
      ctx.push(`- % desperdicio vs consumo: ${((totalWaste / totalConsumption) * 100).toFixed(1)}%`);
    }
  }

  // --- Recipes ---
  if (has("recipes")) {
    const recipes = await safeQuery(db, "recipes", "id,name,recipe_type,servings", { restaurant_id: restaurantId }, { limit: 200 });
    ctx.push(`\nRECETAS: ${recipes.length} registradas`);
    const byType: Record<string, number> = {};
    recipes.forEach((r: any) => { byType[r.recipe_type] = (byType[r.recipe_type] || 0) + 1; });
    ctx.push(`- Por tipo: ${Object.entries(byType).map(([k, v]) => `${k}: ${v}`).join(", ")}`);
  }

  // --- Corporate contracts ---
  if (has("corporate_masters") || has("pos_corporate")) {
    const companies = await safeQuery(db, "hotel_companies", "id,name,active", { restaurant_id: restaurantId });
    const contracts = await safeQuery(db, "contracts", "id,name,company_id,active", { restaurant_id: restaurantId });
    const serviceRates = await safeQuery(db, "contract_service_rates", "id,company_id,service_type,rate,active", { restaurant_id: restaurantId });
    ctx.push(`\nCORPORATIVO:`);
    ctx.push(`- Empresas: ${companies.length} (activas: ${companies.filter((c: any) => c.active).length})`);
    ctx.push(`- Contratos: ${contracts.length} (activos: ${contracts.filter((c: any) => c.active).length})`);
    ctx.push(`- Tarifas de servicio: ${serviceRates.length}`);

    // Company-level sales breakdown (last 30 days)
    if (has("pos_view") || has("reports")) {
      const { data: corpOrders } = await db.from("pos_orders")
        .select("company_id,total").eq("restaurant_id", restaurantId)
        .eq("billing_mode", "corporate_charge").eq("status", "completed")
        .eq("is_test_record", false).gte("created_at", thirtyDaysAgo + "T00:00:00");
      if (corpOrders?.length) {
        const byCompany: Record<string, number> = {};
        corpOrders.forEach((o: any) => { if (o.company_id) byCompany[o.company_id] = (byCompany[o.company_id] || 0) + (o.total ?? 0); });
        const companyMap = Object.fromEntries(companies.map((c: any) => [c.id, c.name]));
        const top5 = Object.entries(byCompany).sort((a, b) => b[1] - a[1]).slice(0, 5);
        ctx.push(`- Top empresas por venta: ${top5.map(([id, v]) => `${companyMap[id] || id}: $${v.toFixed(0)}`).join(", ")}`);
      }
    }
  }

  // --- Hotel ---
  if (has("hotel_view") || has("hotel_stays_view")) {
    const { data: stays } = await db.from("stays").select("id,status,check_in,check_out,total_amount,company_id")
      .eq("restaurant_id", restaurantId).gte("check_in", thirtyDaysAgo);
    const st = stays ?? [];
    const active = st.filter((s: any) => s.status === "active");
    const totalRevenue = st.reduce((s: number, r: any) => s + (r.total_amount ?? 0), 0);
    ctx.push(`\nHOTEL (últimos 30 días):`);
    ctx.push(`- Estancias registradas: ${st.length}`);
    ctx.push(`- Activas ahora: ${active.length}`);
    ctx.push(`- Ingresos estancias: $${totalRevenue.toFixed(0)}`);
  }

  // --- Cash register ---
  if (has("cash_open") || has("pos_cash_register")) {
    const { data: sessions } = await db.from("cash_register_sessions")
      .select("id,status,opening_amount,closing_amount,expected_closing,difference,opened_at,closed_at")
      .eq("restaurant_id", restaurantId).gte("opened_at", thirtyDaysAgo);
    const sess = sessions ?? [];
    const withDiff = sess.filter((s: any) => s.status === "closed" && s.difference != null);
    const totalDiff = withDiff.reduce((s: number, r: any) => s + Math.abs(r.difference ?? 0), 0);
    ctx.push(`\nCAJA (últimos 30 días):`);
    ctx.push(`- Turnos cerrados: ${withDiff.length}`);
    if (withDiff.length) {
      ctx.push(`- Diferencia acumulada (abs): $${totalDiff.toFixed(0)}`);
      const descuadres = withDiff.filter((s: any) => Math.abs(s.difference) > 1000);
      if (descuadres.length) ctx.push(`- ⚠️ Turnos con descuadre > $1000: ${descuadres.length}`);
    }
  }

  return ctx.join("\n");
}

/* ------------------------------------------------------------------ */
/*  SYSTEM PROMPT                                                      */
/* ------------------------------------------------------------------ */
const SYSTEM_PROMPT = `Eres un asistente de inteligencia de negocio especializado en operaciones de hotel, restaurante, inventario y servicios corporativos.

TU ROL:
- Analista de negocio experto que entiende la operación completa
- Detectas problemas, ineficiencias y oportunidades
- Generas recomendaciones accionables basadas en datos reales
- Respondes en español, de forma clara y directa

CONOCIMIENTO DEL SISTEMA:
- POS con dos modelos: venta normal (por producto) y corporativo (por servicio/tarifa contratada)
- El costo real viene de cocina (producción de recetas), no del POS
- El POS no descuenta ingredientes de recetas al vender
- La rentabilidad = ventas POS vs costos reales de producción
- Inventario valorado por Costo Promedio Ponderado (CPP)
- Contratos corporativos: Empresa → Contrato → Subgrupo → Tarifas por servicio
- Hotel: estancias, tarifas corporativas, housekeeping, lavandería
- Los desperdicios (merma, vencimiento, daño) son pérdidas directas

REGLAS:
- Solo analiza datos que se te proporcionan en el contexto
- Si no tienes datos suficientes para un análisis, dilo claramente
- Nunca inventes datos ni cifras
- Usa formato con bullets, negritas y estructura clara
- Cuando detectes problemas, clasifícalos por severidad (🔴 crítico, 🟡 moderado, 🟢 informativo)
- Sugiere acciones concretas, no genéricas
- Si te preguntan algo que no corresponde a los datos disponibles, indica qué permisos o datos serían necesarios`;

/* ------------------------------------------------------------------ */
/*  MAIN HANDLER                                                       */
/* ------------------------------------------------------------------ */
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const authHeader = req.headers.get("authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");

    // Create user-scoped client to get identity
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "No autorizado" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { messages, restaurantId } = await req.json();
    if (!restaurantId || !messages?.length) {
      return new Response(JSON.stringify({ error: "Faltan parámetros" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Service role client for data queries
    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Check permission
    const { data: perms } = await db.from("role_permissions")
      .select("function_key, role!inner(role)")
      .eq("role.user_id", user.id);
    
    // Get permissions via RPC-like approach
    const { data: userRoles } = await db.from("user_roles").select("role").eq("user_id", user.id);
    const roles = (userRoles ?? []).map((r: any) => r.role);
    
    const { data: rolePerms } = await db.from("role_permissions").select("function_key, role").in("role", roles);
    const permissions = [...new Set((rolePerms ?? []).map((r: any) => r.function_key))];

    if (!permissions.includes("business_ai")) {
      return new Response(JSON.stringify({ error: "No tienes permiso para usar el asistente IA" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build business context
    const businessContext = await buildBusinessContext(db, restaurantId, permissions);

    // Get the last user message for audit
    const lastUserMsg = [...messages].reverse().find((m: any) => m.role === "user");

    // Log the query
    await db.from("ai_chat_logs").insert({
      restaurant_id: restaurantId,
      user_id: user.id,
      user_question: lastUserMsg?.content || "",
      analysis_type: "chat",
    });

    // Build messages for AI
    const aiMessages = [
      { role: "system", content: `${SYSTEM_PROMPT}\n\n--- DATOS ACTUALES DEL NEGOCIO ---\n${businessContext}\n--- FIN DATOS ---` },
      ...messages,
    ];

    // Call AI gateway
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: aiMessages,
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Límite de solicitudes excedido, intenta de nuevo en unos momentos." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos de IA agotados." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "Error del servicio de IA" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("business-ai error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Error desconocido" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
