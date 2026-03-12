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

    // User client
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) throw new Error("Not authenticated");

    // Admin client
    const adminClient = createClient(supabaseUrl, serviceKey);

    // Check admin role
    const { data: isAdmin } = await adminClient.rpc("has_role", {
      _user_id: user.id,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Solo administradores pueden ejecutar esta acción");

    const { restaurant_id, date_from, date_to, only_test } = await req.json();
    if (!restaurant_id) throw new Error("restaurant_id requerido");

    // Build filter for orders to delete
    let query = adminClient
      .from("pos_orders")
      .select("id")
      .eq("restaurant_id", restaurant_id);

    if (only_test !== false) {
      query = query.eq("is_test_record", true);
    }
    if (date_from) {
      query = query.gte("created_at", date_from);
    }
    if (date_to) {
      query = query.lte("created_at", date_to + "T23:59:59");
    }

    const { data: orders, error: fetchErr } = await query;
    if (fetchErr) throw new Error(`Error buscando pedidos: ${fetchErr.message}`);

    if (!orders || orders.length === 0) {
      return new Response(
        JSON.stringify({ deleted_orders: 0, deleted_items: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const orderIds = orders.map((o: any) => o.id);

    // Delete order items first (FK constraint)
    const { count: deletedItems, error: itemErr } = await adminClient
      .from("pos_order_items")
      .delete({ count: "exact" })
      .in("order_id", orderIds);
    if (itemErr) throw new Error(`Error eliminando ítems: ${itemErr.message}`);

    // Delete orders
    const { count: deletedOrders, error: orderErr } = await adminClient
      .from("pos_orders")
      .delete({ count: "exact" })
      .in("id", orderIds);
    if (orderErr) throw new Error(`Error eliminando pedidos: ${orderErr.message}`);

    // Log audit event
    await adminClient.from("audit_events").insert({
      restaurant_id,
      entity_type: "pos_purge",
      entity_id: restaurant_id,
      action: "DELETE",
      performed_by: user.id,
      before: null,
      after: null,
      can_rollback: false,
      metadata: {
        deleted_orders: deletedOrders,
        deleted_items: deletedItems,
        only_test,
        date_from,
        date_to,
      },
    });

    return new Response(
      JSON.stringify({ deleted_orders: deletedOrders, deleted_items: deletedItems }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
