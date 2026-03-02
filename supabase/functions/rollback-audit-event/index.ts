import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

    // User client to check identity
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) throw new Error("Not authenticated");

    // Admin client for privileged operations
    const adminClient = createClient(supabaseUrl, serviceKey);

    // Check user is admin
    const { data: isAdmin } = await adminClient.rpc("has_role", {
      _user_id: user.id,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Solo administradores pueden revertir cambios");

    const { event_id, reason } = await req.json();
    if (!event_id) throw new Error("event_id requerido");

    // Get the audit event
    const { data: event, error: evError } = await adminClient
      .from("audit_events")
      .select("*")
      .eq("id", event_id)
      .single();
    if (evError || !event) throw new Error("Evento no encontrado");

    // Get user's restaurant
    const { data: restaurantId } = await adminClient.rpc("get_my_restaurant_id");

    // Validations
    if (event.restaurant_id !== restaurantId) throw new Error("No pertenece a tu restaurante");
    if (!event.can_rollback) throw new Error("Este evento no es reversible");
    if (event.rollback_applied) throw new Error("Este evento ya fue revertido");
    if (!event.before) throw new Error("No hay datos previos para revertir");

    const allowedEntities = ["product", "recipe", "recipe_ingredient", "category", "inventory_movement"];
    if (!allowedEntities.includes(event.entity_type)) {
      throw new Error(`No se permite rollback para ${event.entity_type}`);
    }

    // Map entity_type to table name
    const tableMap: Record<string, string> = {
      product: "products",
      recipe: "recipes",
      recipe_ingredient: "recipe_ingredients",
      category: "categories",
      inventory_movement: "inventory_movements",
    };

    const tableName = tableMap[event.entity_type];
    const beforeData = event.before as Record<string, any>;

    // Remove fields that shouldn't be updated
    const { id, created_at, restaurant_id, ...updateFields } = beforeData;

    // Apply the rollback
    const { error: updateError } = await adminClient
      .from(tableName)
      .update(updateFields)
      .eq("id", event.entity_id);
    if (updateError) throw new Error(`Error al revertir: ${updateError.message}`);

    // Mark original event as rolled back
    await adminClient
      .from("audit_events")
      .update({ rollback_applied: true })
      .eq("id", event_id);

    // Get the current state after rollback for the new audit event
    const { data: currentState } = await adminClient
      .from(tableName)
      .select("*")
      .eq("id", event.entity_id)
      .single();

    // Create rollback audit event
    await adminClient.from("audit_events").insert({
      restaurant_id: event.restaurant_id,
      entity_type: event.entity_type,
      entity_id: event.entity_id,
      action: "ROLLBACK",
      performed_by: user.id,
      before: event.after,
      after: currentState,
      can_rollback: false,
      rollback_of_event_id: event_id,
      metadata: { reason: reason || null },
    });

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
