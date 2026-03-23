import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import JSZip from "https://esm.sh/jszip@3.10.1";

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
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (providedSecret !== webhookSecret) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let body: any;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid request body" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const {
      restaurant_id,
      from_email,
      subject,
      // Existing: single PDF
      pdf_base64,
      pdf_filename,
      // New: support multiple attachments or ZIP
      attachments, // Array of { base64, filename, content_type }
      created_by_user_id,
    } = body;

    if (!restaurant_id) {
      return new Response(JSON.stringify({ error: "restaurant_id is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Normalize attachments into a unified list
    type Attachment = { base64: string; filename: string; content_type: string };
    let allAttachments: Attachment[] = [];

    if (attachments && Array.isArray(attachments)) {
      allAttachments = attachments;
    } else if (pdf_base64) {
      // Legacy single-PDF format
      allAttachments = [{
        base64: pdf_base64,
        filename: pdf_filename || `email-${Date.now()}.pdf`,
        content_type: "application/pdf",
      }];
    }

    if (allAttachments.length === 0) {
      return new Response(JSON.stringify({ error: "No attachments provided" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Process attachments: extract ZIP contents, separate XML and PDF
    let xmlFile: { bytes: Uint8Array; filename: string } | null = null;
    let pdfFile: { bytes: Uint8Array; filename: string } | null = null;

    for (const att of allAttachments) {
      const bytes = Uint8Array.from(atob(att.base64), (c) => c.charCodeAt(0));
      const lowerName = (att.filename || "").toLowerCase();
      const lowerType = (att.content_type || "").toLowerCase();

      if (lowerName.endsWith(".zip") || lowerType === "application/zip" || lowerType === "application/x-zip-compressed") {
        // Extract ZIP
        console.log(`Extracting ZIP: ${att.filename}`);
        try {
          const zip = new JSZip();
          await zip.loadAsync(bytes);

          for (const [name, file] of Object.entries(zip.files)) {
            if ((file as any).dir) continue;
            const lower = name.toLowerCase();
            if (lower.endsWith(".xml") && !xmlFile) {
              const content = await (file as any).async("uint8array");
              xmlFile = { bytes: content, filename: name };
              console.log(`Found XML in ZIP: ${name}`);
            } else if (lower.endsWith(".pdf") && !pdfFile) {
              const content = await (file as any).async("uint8array");
              pdfFile = { bytes: content, filename: name };
              console.log(`Found PDF in ZIP: ${name}`);
            }
          }
        } catch (zipErr) {
          console.error("ZIP extraction error:", zipErr);
        }
      } else if (lowerName.endsWith(".xml") || lowerType === "application/xml" || lowerType === "text/xml") {
        if (!xmlFile) {
          xmlFile = { bytes, filename: att.filename };
          console.log(`Direct XML attachment: ${att.filename}`);
        }
      } else if (lowerName.endsWith(".pdf") || lowerType === "application/pdf") {
        if (!pdfFile) {
          pdfFile = { bytes, filename: att.filename };
          console.log(`Direct PDF attachment: ${att.filename}`);
        }
      }
    }

    if (!xmlFile && !pdfFile) {
      return new Response(JSON.stringify({ error: "No XML or PDF files found in attachments" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Size checks
    if (pdfFile && pdfFile.bytes.length / (1024 * 1024) > 20) {
      return new Response(JSON.stringify({ error: `PDF too large: ${(pdfFile.bytes.length / (1024 * 1024)).toFixed(1)} MB (max 20 MB)` }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Upload files to storage
    const timestamp = Date.now();
    let pdfStoragePath: string | null = null;
    let xmlStoragePath: string | null = null;

    if (pdfFile) {
      pdfStoragePath = `${restaurant_id}/email-${timestamp}-${pdfFile.filename}`;
      const { error: pdfUpErr } = await db.storage.from("invoice-pdfs").upload(pdfStoragePath, pdfFile.bytes, { contentType: "application/pdf" });
      if (pdfUpErr) {
        console.error("PDF upload error:", pdfUpErr);
        pdfStoragePath = null;
      }
    }

    if (xmlFile) {
      xmlStoragePath = `${restaurant_id}/email-${timestamp}-${xmlFile.filename}`;
      const { error: xmlUpErr } = await db.storage.from("invoice-pdfs").upload(xmlStoragePath, xmlFile.bytes, { contentType: "application/xml" });
      if (xmlUpErr) {
        console.error("XML upload error:", xmlUpErr);
        xmlStoragePath = null;
      }
    }

    if (!pdfStoragePath && !xmlStoragePath) {
      return new Response(JSON.stringify({ error: "Failed to store files" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Determine file_type
    let fileType = "pdf";
    if (xmlStoragePath && pdfStoragePath) fileType = "zip"; // both present (likely from ZIP)
    else if (xmlStoragePath) fileType = "xml";

    // Find default user
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
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create smart invoice record
    const { data: smartInv, error: invErr } = await db
      .from("smart_invoices")
      .insert({
        restaurant_id,
        pdf_url: pdfStoragePath,
        xml_url: xmlStoragePath,
        file_type: fileType,
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
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Created smart invoice ${smartInv.id} (${fileType}) from email: ${from_email}`);

    // Trigger AI parsing automatically
    try {
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
      } else {
        console.log("Auto-parse triggered successfully");
      }
    } catch (parseErr) {
      console.warn("Auto-parse error (invoice saved):", parseErr);
    }

    return new Response(JSON.stringify({
      success: true,
      smart_invoice_id: smartInv.id,
      file_type: fileType,
      has_xml: !!xmlStoragePath,
      has_pdf: !!pdfStoragePath,
      message: "Invoice received and queued for processing",
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
