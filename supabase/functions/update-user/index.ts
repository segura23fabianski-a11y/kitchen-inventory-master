import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No autorizado");

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user: caller } } = await supabaseUser.auth.getUser();
    if (!caller) throw new Error("No autorizado");

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: isAdmin } = await adminClient.rpc("has_role", { _user_id: caller.id, _role: "admin" });
    if (!isAdmin) throw new Error("Solo administradores pueden actualizar usuarios");

    const { user_id, full_name, email, password } = await req.json();
    if (!user_id) throw new Error("user_id es requerido");

    // Update auth user (email and/or password)
    const authUpdate: any = {};
    if (email) authUpdate.email = email;
    if (password) {
      if (password.length < 6) throw new Error("La contraseña debe tener al menos 6 caracteres");
      authUpdate.password = password;
    }

    if (Object.keys(authUpdate).length > 0) {
      const { error: authError } = await adminClient.auth.admin.updateUserById(user_id, authUpdate);
      if (authError) throw authError;
    }

    // Update profile (full_name)
    if (full_name !== undefined) {
      const { error: profileError } = await adminClient
        .from("profiles")
        .update({ full_name })
        .eq("user_id", user_id);
      if (profileError) throw profileError;
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
