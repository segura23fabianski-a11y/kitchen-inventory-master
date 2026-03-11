import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export interface PdfSettings {
  document_code?: string | null;
  version?: string | null;
  format_date?: string | null;
  company_name?: string | null;
  company_nit?: string | null;
  company_address?: string | null;
  company_phone?: string | null;
  company_email?: string | null;
  logo_url?: string | null;
  footer_contact_text?: string | null;
  approved_by_name?: string | null;
  signature_image_url?: string | null;
  observations_default?: string | null;
  show_taxes?: boolean;
  primary_color?: string | null;
}

export interface PdfOrderData {
  order_id: string;
  order_number?: string | null;
  order_date: string;
  expected_delivery_date?: string | null;
  supplier_name: string;
  supplier_nit?: string | null;
  supplier_address?: string | null;
  supplier_phone?: string | null;
  supplier_email?: string | null;
  notes?: string | null;
  generated_by?: string | null;
  items: {
    name: string;
    unit: string;
    quantity: number;
    unit_cost: number | null;
  }[];
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ];
}

function lighten(rgb: [number, number, number], factor: number): [number, number, number] {
  return rgb.map((c) => Math.min(255, Math.round(c + (255 - c) * factor))) as [number, number, number];
}

async function loadImageAsBase64(url: string): Promise<string | null> {
  try {
    const resp = await fetch(url, { mode: "cors" });
    if (!resp.ok) return null;
    const blob = await resp.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function detectImageFormat(base64: string): string {
  if (base64.startsWith("data:image/png")) return "PNG";
  if (base64.startsWith("data:image/jpeg") || base64.startsWith("data:image/jpg")) return "JPEG";
  if (base64.startsWith("data:image/webp")) return "WEBP";
  if (base64.startsWith("data:image/gif")) return "GIF";
  return "PNG";
}

export async function generatePurchaseOrderPdf(
  settings: PdfSettings,
  order: PdfOrderData,
  action: "download" | "preview" = "download"
) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentW = pageW - margin * 2;
  const primary = settings.primary_color ? hexToRgb(settings.primary_color) : [33, 76, 153] as [number, number, number];
  const primaryLight = lighten(primary, 0.85);

  let y = margin;

  // ===== LOAD LOGO =====
  let logoBase64: string | null = null;
  if (settings.logo_url) {
    logoBase64 = await loadImageAsBase64(settings.logo_url);
  }

  // ===== HEADER: company info left, order info right =====
  const headerH = 28;
  // Thin top accent bar
  doc.setFillColor(...primary);
  doc.rect(margin, y, contentW, 2, "F");
  y += 2;

  // Logo + company block
  let logoEndX = margin;
  if (logoBase64) {
    try {
      const fmt = detectImageFormat(logoBase64);
      doc.addImage(logoBase64, fmt, margin, y + 2, 22, 22);
      logoEndX = margin + 25;
    } catch {
      logoEndX = margin;
    }
  }

  // Company info
  const compX = logoEndX + 2;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(30, 30, 30);
  doc.text(settings.company_name || "Empresa", compX, y + 6);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(80, 80, 80);
  const companyInfoLines = [
    settings.company_nit ? `NIT: ${settings.company_nit}` : "",
    settings.company_address || "",
    [settings.company_phone ? `Tel: ${settings.company_phone}` : "", settings.company_email || ""]
      .filter(Boolean)
      .join(" | "),
  ].filter(Boolean);
  companyInfoLines.forEach((line, i) => {
    doc.text(line, compX, y + 10 + i * 3.5);
  });

  // Right: Document title + order metadata
  const rightX = pageW - margin;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(...primary);
  doc.text("ORDEN DE COMPRA", rightX, y + 7, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(60, 60, 60);
  const orderNum = order.order_id.slice(0, 8).toUpperCase();
  const metaRight = [
    `N.º ${orderNum}`,
    `Fecha: ${order.order_date}`,
    `Entrega: ${order.expected_delivery_date || "Por definir"}`,
  ];
  if (settings.document_code) metaRight.push(`Código: ${settings.document_code}`);
  if (settings.version) metaRight.push(`Versión: ${settings.version}`);
  metaRight.forEach((line, i) => {
    doc.text(line, rightX, y + 12 + i * 3.5, { align: "right" });
  });

  y += headerH + 2;

  // Separator line
  doc.setDrawColor(...primary);
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageW - margin, y);
  y += 5;

  // ===== SUPPLIER INFO =====
  doc.setFillColor(...primaryLight);
  doc.roundedRect(margin, y, contentW, 22, 2, 2, "F");
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.2);
  doc.roundedRect(margin, y, contentW, 22, 2, 2, "S");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...primary);
  doc.text("PROVEEDOR", margin + 4, y + 5);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(30, 30, 30);

  // Left column
  doc.setFont("helvetica", "bold");
  doc.text(order.supplier_name, margin + 4, y + 10);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  if (order.supplier_nit) doc.text(`NIT/CC: ${order.supplier_nit}`, margin + 4, y + 14);
  if (order.supplier_address) doc.text(order.supplier_address, margin + 4, y + 18);

  // Right column
  const supRightX = margin + contentW / 2;
  if (order.supplier_phone) doc.text(`Tel: ${order.supplier_phone}`, supRightX, y + 10);
  if (order.supplier_email) doc.text(order.supplier_email, supRightX, y + 14);

  y += 26;

  // ===== PRODUCTS TABLE =====
  const showTaxes = settings.show_taxes !== false;
  const headers = showTaxes
    ? [["Ítem", "Producto", "Unidad", "Cantidad", "Precio Unit.", "Impuesto", "Subtotal"]]
    : [["Ítem", "Producto", "Unidad", "Cantidad", "Precio Unit.", "Subtotal"]];

  let subtotal = 0;
  const rows = order.items.map((item, i) => {
    const uc = item.unit_cost || 0;
    const lineTotal = item.quantity * uc;
    subtotal += lineTotal;
    const base = [
      String(i + 1),
      item.name,
      item.unit,
      String(item.quantity),
      uc > 0 ? `$${uc.toLocaleString("es-CO", { minimumFractionDigits: 2 })}` : "—",
    ];
    if (showTaxes) base.push("$0.00");
    base.push(lineTotal > 0 ? `$${lineTotal.toLocaleString("es-CO", { minimumFractionDigits: 2 })}` : "—");
    return base;
  });

  autoTable(doc, {
    startY: y,
    head: headers,
    body: rows,
    margin: { left: margin, right: margin },
    theme: "striped",
    headStyles: {
      fillColor: primary as [number, number, number],
      textColor: [255, 255, 255],
      fontSize: 7.5,
      fontStyle: "bold",
      halign: "center",
    },
    bodyStyles: {
      fontSize: 7.5,
      textColor: [30, 30, 30],
      cellPadding: 2,
    },
    alternateRowStyles: { fillColor: [248, 249, 252] },
    columnStyles: showTaxes
      ? {
          0: { halign: "center", cellWidth: 10 },
          1: { cellWidth: "auto" },
          2: { halign: "center", cellWidth: 16 },
          3: { halign: "center", cellWidth: 18 },
          4: { halign: "right", cellWidth: 24 },
          5: { halign: "right", cellWidth: 22 },
          6: { halign: "right", cellWidth: 24 },
        }
      : {
          0: { halign: "center", cellWidth: 10 },
          1: { cellWidth: "auto" },
          2: { halign: "center", cellWidth: 16 },
          3: { halign: "center", cellWidth: 20 },
          4: { halign: "right", cellWidth: 26 },
          5: { halign: "right", cellWidth: 26 },
        },
  });

  y = (doc as any).lastAutoTable.finalY + 3;

  // ===== TOTALS (right-aligned) =====
  const totalsW = 72;
  const totalsX = pageW - margin - totalsW;
  const totalsData = [["Subtotal", `$${subtotal.toLocaleString("es-CO", { minimumFractionDigits: 2 })}`]];
  if (showTaxes) {
    totalsData.push(["IVA", "$0.00"]);
    totalsData.push(["ICO", "$0.00"]);
    totalsData.push(["Otro", "$0.00"]);
  }
  totalsData.push(["TOTAL", `$${subtotal.toLocaleString("es-CO", { minimumFractionDigits: 2 })}`]);

  autoTable(doc, {
    startY: y,
    body: totalsData,
    margin: { left: totalsX, right: margin },
    theme: "plain",
    bodyStyles: { fontSize: 8, textColor: [30, 30, 30], cellPadding: 1.5 },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 28, halign: "left" },
      1: { halign: "right", cellWidth: 44 },
    },
    didParseCell: (data: any) => {
      if (data.row.index === totalsData.length - 1) {
        data.cell.styles.fillColor = primary;
        data.cell.styles.textColor = [255, 255, 255];
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.fontSize = 9;
      }
    },
  });

  y = (doc as any).lastAutoTable.finalY + 6;

  // ===== OBSERVATIONS =====
  const obsText = order.notes || settings.observations_default || "";
  if (obsText) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...primary);
    doc.text("OBSERVACIONES", margin, y + 3);
    y += 5;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(60, 60, 60);
    const obsLines = doc.splitTextToSize(obsText, contentW - 4);
    doc.setFillColor(...primaryLight);
    doc.roundedRect(margin, y, contentW, Math.max(8, obsLines.length * 3.5 + 4), 1, 1, "F");
    doc.text(obsLines, margin + 3, y + 4);
    y += Math.max(10, obsLines.length * 3.5 + 6);
  }

  // ===== SIGNATURE BLOCK =====
  if (y > pageH - 50) {
    doc.addPage();
    y = margin;
  }

  y += 2;
  const sigW = contentW / 2 - 4;

  // Approved by box
  doc.setDrawColor(180, 180, 180);
  doc.setLineWidth(0.2);
  doc.roundedRect(margin, y, sigW, 32, 1, 1, "S");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(...primary);
  doc.text("APROBADO POR", margin + sigW / 2, y + 4, { align: "center" });

  if (settings.signature_image_url) {
    const sigImg = await loadImageAsBase64(settings.signature_image_url);
    if (sigImg) {
      try {
        const fmt = detectImageFormat(sigImg);
        doc.addImage(sigImg, fmt, margin + sigW / 2 - 15, y + 6, 30, 12);
      } catch { /* ignore */ }
    }
  }

  doc.setDrawColor(120, 120, 120);
  doc.line(margin + 8, y + 22, margin + sigW - 8, y + 22);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(60, 60, 60);
  doc.text(settings.approved_by_name || "Nombre:", margin + sigW / 2, y + 26, { align: "center" });
  doc.text(`Fecha: ${order.order_date}`, margin + sigW / 2, y + 30, { align: "center" });

  // Received by box
  const recX = margin + sigW + 8;
  doc.roundedRect(recX, y, sigW, 32, 1, 1, "S");
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...primary);
  doc.text("RECIBIDO POR", recX + sigW / 2, y + 4, { align: "center" });
  doc.setDrawColor(120, 120, 120);
  doc.line(recX + 8, y + 22, recX + sigW - 8, y + 22);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(60, 60, 60);
  doc.text("Nombre:", recX + sigW / 2, y + 26, { align: "center" });
  doc.text("Fecha:", recX + sigW / 2, y + 30, { align: "center" });

  y += 36;

  // ===== FOOTER =====
  // Generated by info
  if (order.generated_by) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(140, 140, 140);
    doc.text(`Generado por: ${order.generated_by} — ${new Date().toLocaleString("es-CO")}`, margin, y);
    y += 4;
  }

  // Footer contact text
  if (settings.footer_contact_text) {
    const footY = Math.max(y, pageH - 16);
    doc.setDrawColor(...primary);
    doc.setLineWidth(0.3);
    doc.line(margin, footY - 2, pageW - margin, footY - 2);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(6.5);
    doc.setTextColor(100, 100, 100);
    const footerLines = doc.splitTextToSize(settings.footer_contact_text, contentW);
    doc.text(footerLines, pageW / 2, footY + 1, { align: "center" });
  }

  // ===== Output =====
  const sanitize = (s: string) =>
    s.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9 ]/g, "")
      .trim()
      .replace(/\s+/g, "_")
      .toUpperCase();

  const orderNum2 = order.order_id.slice(0, 8).toUpperCase();
  const supplierClean = sanitize(order.supplier_name);
  const fileName = `ORDEN_COMPRA_${orderNum2}_${supplierClean}.pdf`;

  if (action === "preview") {
    const blob = doc.output("blob");
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
  } else {
    doc.save(fileName);
  }
}
