import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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

    // Auth client to get user
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) throw new Error("Unauthorized");

    // Service client for admin operations
    const admin = createClient(supabaseUrl, serviceKey);

    // Check user is admin
    const { data: isAdmin } = await admin.rpc("has_role", { _user_id: user.id, _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden: admin only");

    // Get restaurant_id
    const { data: profile } = await admin
      .from("profiles")
      .select("restaurant_id")
      .eq("user_id", user.id)
      .eq("status", "active")
      .single();
    if (!profile?.restaurant_id) throw new Error("No restaurant found");
    const restaurantId = profile.restaurant_id;

    // Check inventory_reset_allowed flag
    const { data: setting } = await admin
      .from("app_settings")
      .select("value")
      .eq("restaurant_id", restaurantId)
      .eq("key", "inventory_reset_allowed")
      .single();
    if (!setting || setting.value !== true) {
      throw new Error("Reset no permitido. Active la bandera 'inventory_reset_allowed' primero.");
    }

    const body = await req.json();
    const { reason, includeCategories, includeRecipes } = body;
    if (!reason || typeof reason !== "string" || reason.trim().length < 3) {
      throw new Error("Motivo obligatorio (mínimo 3 caracteres)");
    }

    // Count before deleting
    const counts: Record<string, number> = {};

    const { count: movCount } = await admin.from("inventory_movements").select("*", { count: "exact", head: true }).eq("restaurant_id", restaurantId);
    counts.movements = movCount ?? 0;

    const { count: codeCount } = await admin.from("product_codes").select("*", { count: "exact", head: true }).eq("restaurant_id", restaurantId);
    counts.codes = codeCount ?? 0;

    const { count: prodCount } = await admin.from("products").select("*", { count: "exact", head: true }).eq("restaurant_id", restaurantId);
    counts.products = prodCount ?? 0;

    if (includeRecipes) {
      const { count: riCount } = await admin.from("recipe_ingredients").select("*", { count: "exact", head: true }).eq("restaurant_id", restaurantId);
      counts.recipe_ingredients = riCount ?? 0;
      const { count: rCount } = await admin.from("recipes").select("*", { count: "exact", head: true }).eq("restaurant_id", restaurantId);
      counts.recipes = rCount ?? 0;
    }

    if (includeCategories) {
      const { count: catCount } = await admin.from("categories").select("*", { count: "exact", head: true }).eq("restaurant_id", restaurantId);
      counts.categories = catCount ?? 0;
    }

    // Delete in safe order using service role (bypasses RLS for atomicity)
    // 1) inventory_movements
    const { error: e1 } = await admin.from("inventory_movements").delete().eq("restaurant_id", restaurantId);
    if (e1) throw new Error(`Error borrando movimientos: ${e1.message}`);

    // 2) recipe_ingredients (before recipes, and before products due to FK)
    if (includeRecipes) {
      const { error: e2a } = await admin.from("recipe_ingredients").delete().eq("restaurant_id", restaurantId);
      if (e2a) throw new Error(`Error borrando ingredientes de recetas: ${e2a.message}`);
    }

    // 3) product_codes
    const { error: e2 } = await admin.from("product_codes").delete().eq("restaurant_id", restaurantId);
    if (e2) throw new Error(`Error borrando códigos: ${e2.message}`);

    // 4) audit_events referencing products (clean up before products delete)
    // Skip - audit events don't have FK to products

    // 5) products
    const { error: e3 } = await admin.from("products").delete().eq("restaurant_id", restaurantId);
    if (e3) throw new Error(`Error borrando productos: ${e3.message}`);

    // 6) recipes
    if (includeRecipes) {
      const { error: e4 } = await admin.from("recipes").delete().eq("restaurant_id", restaurantId);
      if (e4) throw new Error(`Error borrando recetas: ${e4.message}`);
    }

    // 7) categories
    if (includeCategories) {
      const { error: e5 } = await admin.from("categories").delete().eq("restaurant_id", restaurantId);
      if (e5) throw new Error(`Error borrando categorías: ${e5.message}`);
    }

    // Log audit event
    await admin.from("audit_events").insert({
      restaurant_id: restaurantId,
      entity_type: "system",
      entity_id: restaurantId,
      action: "INVENTORY_RESET",
      performed_by: user.id,
      can_rollback: false,
      metadata: {
        reason: reason.trim(),
        counts,
        includeCategories: !!includeCategories,
        includeRecipes: !!includeRecipes,
        timestamp: new Date().toISOString(),
      },
    });

    // Disable flag after reset
    await admin
      .from("app_settings")
      .update({ value: false, updated_at: new Date().toISOString() })
      .eq("restaurant_id", restaurantId)
      .eq("key", "inventory_reset_allowed");

    return new Response(JSON.stringify({ success: true, counts }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
