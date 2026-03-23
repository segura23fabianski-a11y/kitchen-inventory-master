import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const EXIT_TYPES = [
  "salida",
  "pos_sale",
  "operational_consumption",
  "merma",
  "desperdicio",
  "vencimiento",
  "daño",
  "transformacion",
];

async function recalculateProductStock(adminClient: ReturnType<typeof createClient>, productId: string) {
  const { data: movements, error } = await adminClient
    .from("inventory_movements")
    .select("id, type, quantity, movement_date, created_at")
    .eq("product_id", productId)
    .order("movement_date", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) throw new Error(`No se pudieron leer movimientos para recalcular stock: ${error.message}`);

  let runningStock = 0;

  for (const movement of movements ?? []) {
    const qty = Math.abs(Number(movement.quantity) || 0);

    if (movement.type === "entrada") {
      runningStock += qty;
    } else if (EXIT_TYPES.includes(movement.type)) {
      runningStock -= qty;
    } else if (movement.type === "ajuste") {
      runningStock = qty;
    }
  }

  const { error: updateError } = await adminClient
    .from("products")
    .update({ current_stock: runningStock })
    .eq("id", productId);

  if (updateError) throw new Error(`No se pudo actualizar stock del producto: ${updateError.message}`);

  return runningStock;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();
    if (userError || !user) throw new Error("No autenticado");

    const adminClient = createClient(supabaseUrl, serviceKey);

    const { data: isAdmin } = await adminClient.rpc("has_role", {
      _user_id: user.id,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Solo administradores pueden revertir cambios");

    const { event_id, reason } = await req.json();
    if (!event_id) throw new Error("event_id requerido");

    const { data: event, error: evError } = await adminClient
      .from("audit_events")
      .select("*")
      .eq("id", event_id)
      .single();
    if (evError || !event) throw new Error("Evento no encontrado");

    const { data: profile } = await adminClient
      .from("profiles")
      .select("restaurant_id")
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle();

    if (!profile?.restaurant_id) throw new Error("Sin restaurante asignado");
    const restaurantId = profile.restaurant_id;

    if (event.restaurant_id !== restaurantId) throw new Error("No pertenece a tu restaurante");
    if (!event.can_rollback) throw new Error("Este evento no es reversible");
    if (event.rollback_applied) throw new Error("Este evento ya fue revertido");

    const allowedEntities = ["product", "recipe", "recipe_ingredient", "category", "inventory_movement"];
    if (!allowedEntities.includes(event.entity_type)) {
      throw new Error(`No se permite rollback para ${event.entity_type}`);
    }

    const tableMap: Record<string, string> = {
      product: "products",
      recipe: "recipes",
      recipe_ingredient: "recipe_ingredients",
      category: "categories",
      inventory_movement: "inventory_movements",
    };

    const tableName = tableMap[event.entity_type];
    const action = event.action as string;
    let rollbackBefore = event.after;
    let rollbackAfter: any = null;
    let affectedProductId: string | null = null;

    if (action === "CREATE") {
      const { data: currentState } = await adminClient
        .from(tableName)
        .select("*")
        .eq("id", event.entity_id)
        .maybeSingle();

      if (!currentState) throw new Error("El registro ya no existe, no se puede revertir");

      rollbackBefore = currentState;
      affectedProductId = currentState.product_id ?? event.after?.product_id ?? null;

      const { error: deleteError } = await adminClient.from(tableName).delete().eq("id", event.entity_id);
      if (deleteError) throw new Error(`Error al eliminar: ${deleteError.message}`);

      rollbackAfter = null;
    } else if (action === "DELETE") {
      if (!event.before) throw new Error("No hay datos previos para restaurar");

      affectedProductId = event.before?.product_id ?? null;

      const { error: insertError } = await adminClient.from(tableName).insert(event.before);
      if (insertError) throw new Error(`Error al restaurar: ${insertError.message}`);

      rollbackAfter = event.before;
    } else {
      if (!event.before) throw new Error("No hay datos previos para revertir");

      const beforeData = event.before as Record<string, any>;
      const { id, created_at, restaurant_id, ...updateFields } = beforeData;
      affectedProductId = beforeData.product_id ?? event.after?.product_id ?? null;

      const { error: updateError } = await adminClient
        .from(tableName)
        .update(updateFields)
        .eq("id", event.entity_id);
      if (updateError) throw new Error(`Error al revertir: ${updateError.message}`);

      const { data: currentState } = await adminClient
        .from(tableName)
        .select("*")
        .eq("id", event.entity_id)
        .maybeSingle();

      rollbackAfter = currentState;
    }

    if (event.entity_type === "inventory_movement" && affectedProductId) {
      const recalculatedStock = await recalculateProductStock(adminClient, affectedProductId);
      rollbackAfter = rollbackAfter
        ? { ...rollbackAfter, recalculated_product_stock: recalculatedStock }
        : { recalculated_product_stock: recalculatedStock };
    }

    await adminClient.from("audit_events").update({ rollback_applied: true }).eq("id", event_id);

    await adminClient.from("audit_events").insert({
      restaurant_id: event.restaurant_id,
      entity_type: event.entity_type,
      entity_id: event.entity_id,
      action: "ROLLBACK",
      performed_by: user.id,
      before: rollbackBefore,
      after: rollbackAfter,
      can_rollback: false,
      rollback_of_event_id: event_id,
      metadata: { reason: reason || null, original_action: action, affected_product_id: affectedProductId },
    });

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("rollback-audit-event error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
