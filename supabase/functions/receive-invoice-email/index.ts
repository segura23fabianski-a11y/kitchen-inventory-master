import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-webhook-secret",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Verify webhook secret
    const webhookSecret = Deno.env.get("INVOICE_WEBHOOK_SECRET");
    const providedSecret = req.headers.get("x-webhook-secret");

    if (!webhookSecret) {
      console.error("INVOICE_WEBHOOK_SECRET not configured");
      return new Response(JSON.stringify({ error: "Webhook not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (providedSecret !== webhookSecret) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let body: any;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid request body" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const {
      restaurant_id,
      from_email,
      subject,
      pdf_base64,
      pdf_filename,
      created_by_user_id,
    } = body;

    if (!restaurant_id || !pdf_base64) {
      return new Response(JSON.stringify({ error: "restaurant_id and pdf_base64 are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Decode PDF from base64
    const binaryString = atob(pdf_base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    const pdfSizeMB = bytes.length / (1024 * 1024);
    if (pdfSizeMB > 20) {
      return new Response(JSON.stringify({ error: `PDF too large: ${pdfSizeMB.toFixed(1)} MB (max 20 MB)` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Upload PDF to storage
    const filename = pdf_filename || `email-${Date.now()}.pdf`;
    const storagePath = `${restaurant_id}/email-${Date.now()}-${filename}`;

    const { error: uploadErr } = await db.storage
      .from("invoice-pdfs")
      .upload(storagePath, bytes, { contentType: "application/pdf" });

    if (uploadErr) {
      console.error("Storage upload error:", uploadErr);
      return new Response(JSON.stringify({ error: "Failed to store PDF" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Find a default user for this restaurant if not provided
    let userId = created_by_user_id;
    if (!userId) {
      const { data: profile } = await db
        .from("profiles")
        .select("user_id")
        .eq("restaurant_id", restaurant_id)
        .eq("status", "active")
        .limit(1)
        .single();
      userId = profile?.user_id || null;
    }

    if (!userId) {
      return new Response(JSON.stringify({ error: "No active user found for restaurant" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create smart invoice record
    const { data: smartInv, error: invErr } = await db
      .from("smart_invoices")
      .insert({
        restaurant_id,
        pdf_url: storagePath,
        status: "pending",
        created_by: userId,
        source: "email",
        source_email_from: from_email || null,
        source_email_subject: subject || null,
      })
      .select("id")
      .single();

    if (invErr) {
      console.error("Smart invoice creation error:", invErr);
      return new Response(JSON.stringify({ error: "Failed to create invoice record" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Created smart invoice ${smartInv.id} from email: ${from_email}`);

    // Trigger AI parsing automatically
    try {
      // Build the auth header using service role for internal call
      const parseResponse = await fetch(`${SUPABASE_URL}/functions/v1/parse-invoice`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ smart_invoice_id: smartInv.id, internal_call: true }),
      });

      if (!parseResponse.ok) {
        const errText = await parseResponse.text();
        console.warn("Auto-parse failed (invoice saved, can retry manually):", errText);
        // Don't fail the whole request - the invoice is saved and can be parsed manually
      } else {
        console.log("Auto-parse triggered successfully");
      }
    } catch (parseErr) {
      console.warn("Auto-parse error (invoice saved):", parseErr);
    }

    return new Response(JSON.stringify({
      success: true,
      smart_invoice_id: smartInv.id,
      message: "Invoice received and queued for AI processing",
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("receive-invoice-email error:", e);
    return new Response(JSON.stringify({ error: `Internal error: ${e instanceof Error ? e.message : "Unknown"}` }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
