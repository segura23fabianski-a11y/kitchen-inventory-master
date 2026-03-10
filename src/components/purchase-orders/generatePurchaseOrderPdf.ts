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
  order_date: string;
  expected_delivery_date?: string | null;
  supplier_name: string;
  supplier_nit?: string | null;
  supplier_address?: string | null;
  supplier_phone?: string | null;
  supplier_email?: string | null;
  notes?: string | null;
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

async function loadImageAsBase64(url: string): Promise<string | null> {
  try {
    const resp = await fetch(url);
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

export async function generatePurchaseOrderPdf(
  settings: PdfSettings,
  order: PdfOrderData,
  action: "download" | "preview" = "download"
) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 12;
  const contentW = pageW - margin * 2;
  const primaryColor = settings.primary_color
    ? hexToRgb(settings.primary_color)
    : [33, 76, 153] as [number, number, number];

  let y = margin;

  // ===== HEADER BAR =====
  doc.setFillColor(...primaryColor);
  doc.rect(margin, y, contentW, 18, "F");

  // Logo
  let logoBase64: string | null = null;
  if (settings.logo_url) {
    logoBase64 = await loadImageAsBase64(settings.logo_url);
  }
  if (logoBase64) {
    try {
      doc.addImage(logoBase64, "PNG", margin + 2, y + 1, 16, 16);
    } catch { /* ignore */ }
  }

  // Title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(255, 255, 255);
  doc.text("ORDEN DE COMPRA", pageW / 2, y + 11, { align: "center" });

  // Right block: code, version, date, page
  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  const rightX = pageW - margin - 2;
  const metaLines = [
    settings.document_code ? `Código: ${settings.document_code}` : "",
    settings.version ? `Versión: ${settings.version}` : "",
    settings.format_date ? `Fecha formato: ${settings.format_date}` : "",
    "Página: 1 de 1",
  ].filter(Boolean);
  metaLines.forEach((line, i) => {
    doc.text(line, rightX, y + 5 + i * 3.5, { align: "right" });
  });

  y += 22;

  // ===== COMPANY & SUPPLIER INFO =====
  const boxH = 30;
  const halfW = contentW / 2 - 2;

  // Company box
  doc.setDrawColor(180, 180, 180);
  doc.setLineWidth(0.3);
  doc.rect(margin, y, halfW, boxH);
  doc.setFillColor(...primaryColor);
  doc.rect(margin, y, halfW, 6, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(255, 255, 255);
  doc.text("DATOS DE LA EMPRESA", margin + halfW / 2, y + 4.2, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(30, 30, 30);
  const companyLines = [
    settings.company_name || "Empresa",
    settings.company_nit ? `NIT: ${settings.company_nit}` : "",
    settings.company_address || "",
    settings.company_phone ? `Tel: ${settings.company_phone}` : "",
    settings.company_email || "",
  ].filter(Boolean);
  companyLines.forEach((line, i) => {
    doc.text(line, margin + 3, y + 10 + i * 3.8);
  });

  // Supplier box
  const supX = margin + halfW + 4;
  doc.rect(supX, y, halfW, boxH);
  doc.setFillColor(...primaryColor);
  doc.rect(supX, y, halfW, 6, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(255, 255, 255);
  doc.text("DATOS DEL PROVEEDOR", supX + halfW / 2, y + 4.2, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(30, 30, 30);
  const supplierLines = [
    order.supplier_name,
    order.supplier_nit ? `NIT/CC: ${order.supplier_nit}` : "",
    order.supplier_address || "",
    order.supplier_phone ? `Tel: ${order.supplier_phone}` : "",
    order.supplier_email || "",
  ].filter(Boolean);
  supplierLines.forEach((line, i) => {
    doc.text(line, supX + 3, y + 10 + i * 3.8);
  });

  y += boxH + 4;

  // ===== CONTROL BLOCKS (date, order #, delivery) =====
  const ctrlW = contentW / 3;
  const ctrlH = 10;
  doc.setDrawColor(180, 180, 180);

  const controls = [
    { label: "Fecha", value: order.order_date },
    { label: "N.º Orden", value: order.order_id.slice(0, 8).toUpperCase() },
    { label: "Fecha entrega", value: order.expected_delivery_date || "Por definir" },
  ];

  controls.forEach((ctrl, i) => {
    const cx = margin + i * ctrlW;
    doc.rect(cx, y, ctrlW, ctrlH);
    doc.setFillColor(...primaryColor);
    doc.rect(cx, y, ctrlW, 5, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(255, 255, 255);
    doc.text(ctrl.label, cx + ctrlW / 2, y + 3.5, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(30, 30, 30);
    doc.text(ctrl.value, cx + ctrlW / 2, y + 8.5, { align: "center" });
  });

  y += ctrlH + 4;

  // ===== PRODUCTS TABLE =====
  const showTaxes = settings.show_taxes !== false;
  const headers = showTaxes
    ? [["N.º", "Descripción", "Cantidad", "Precio Unit.", "Impuesto", "Total"]]
    : [["N.º", "Descripción", "Cantidad", "Precio Unit.", "Total"]];

  let subtotal = 0;
  const rows = order.items.map((item, i) => {
    const uc = item.unit_cost || 0;
    const lineTotal = item.quantity * uc;
    subtotal += lineTotal;
    const base = [
      String(i + 1),
      `${item.name} (${item.unit})`,
      String(item.quantity),
      uc > 0 ? `$${uc.toFixed(2)}` : "—",
    ];
    if (showTaxes) {
      base.push("$0.00"); // tax placeholder
    }
    base.push(lineTotal > 0 ? `$${lineTotal.toFixed(2)}` : "—");
    return base;
  });

  autoTable(doc, {
    startY: y,
    head: headers,
    body: rows,
    margin: { left: margin, right: margin },
    theme: "grid",
    headStyles: {
      fillColor: primaryColor as [number, number, number],
      textColor: [255, 255, 255],
      fontSize: 8,
      fontStyle: "bold",
      halign: "center",
    },
    bodyStyles: {
      fontSize: 7.5,
      textColor: [30, 30, 30],
    },
    columnStyles: showTaxes
      ? {
          0: { halign: "center", cellWidth: 12 },
          2: { halign: "center", cellWidth: 22 },
          3: { halign: "right", cellWidth: 26 },
          4: { halign: "right", cellWidth: 24 },
          5: { halign: "right", cellWidth: 26 },
        }
      : {
          0: { halign: "center", cellWidth: 12 },
          2: { halign: "center", cellWidth: 22 },
          3: { halign: "right", cellWidth: 28 },
          4: { halign: "right", cellWidth: 28 },
        },
    alternateRowStyles: { fillColor: [245, 247, 250] },
  });

  y = (doc as any).lastAutoTable.finalY + 4;

  // ===== TOTALS BLOCK =====
  const totalsW = 70;
  const totalsX = pageW - margin - totalsW;
  const totalsData = [
    ["Subtotal", `$${subtotal.toFixed(2)}`],
  ];
  if (showTaxes) {
    totalsData.push(["IVA", "$0.00"]);
    totalsData.push(["ICO", "$0.00"]);
    totalsData.push(["Otro", "$0.00"]);
  }
  totalsData.push(["TOTAL", `$${subtotal.toFixed(2)}`]);

  autoTable(doc, {
    startY: y,
    body: totalsData,
    margin: { left: totalsX, right: margin },
    theme: "grid",
    bodyStyles: { fontSize: 8, textColor: [30, 30, 30] },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 30 },
      1: { halign: "right", cellWidth: 40 },
    },
    didParseCell: (data: any) => {
      if (data.row.index === totalsData.length - 1) {
        data.cell.styles.fillColor = primaryColor;
        data.cell.styles.textColor = [255, 255, 255];
        data.cell.styles.fontStyle = "bold";
      }
    },
  });

  y = (doc as any).lastAutoTable.finalY + 6;

  // ===== OBSERVATIONS =====
  doc.setDrawColor(180, 180, 180);
  doc.rect(margin, y, contentW, 20);
  doc.setFillColor(...primaryColor);
  doc.rect(margin, y, contentW, 5, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(255, 255, 255);
  doc.text("OBSERVACIONES", margin + 3, y + 3.5);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(80, 80, 80);
  const obsText = order.notes || settings.observations_default || "";
  if (obsText) {
    const obsLines = doc.splitTextToSize(obsText, contentW - 6);
    doc.text(obsLines, margin + 3, y + 9);
  }
  y += 24;

  // ===== SIGNATURE BLOCK =====
  if (y > pageH - 45) {
    doc.addPage();
    y = margin;
  }

  const sigW = contentW / 2;
  doc.setDrawColor(180, 180, 180);
  doc.rect(margin, y, sigW, 30);
  doc.setFillColor(...primaryColor);
  doc.rect(margin, y, sigW, 5, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(255, 255, 255);
  doc.text("APROBADO POR", margin + sigW / 2, y + 3.5, { align: "center" });

  doc.setTextColor(30, 30, 30);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);

  // Signature image
  if (settings.signature_image_url) {
    const sigImg = await loadImageAsBase64(settings.signature_image_url);
    if (sigImg) {
      try {
        doc.addImage(sigImg, "PNG", margin + sigW / 2 - 15, y + 6, 30, 12);
      } catch { /* ignore */ }
    }
  }

  // Line
  doc.setDrawColor(100, 100, 100);
  doc.line(margin + 10, y + 22, margin + sigW - 10, y + 22);
  doc.setFontSize(7);
  doc.text(settings.approved_by_name || "Nombre:", margin + sigW / 2, y + 26, { align: "center" });
  doc.text(`Fecha: ${order.order_date}`, margin + sigW / 2, y + 29, { align: "center" });

  y += 34;

  // ===== FOOTER CONTACT TEXT =====
  if (settings.footer_contact_text) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(7);
    doc.setTextColor(100, 100, 100);
    const footerLines = doc.splitTextToSize(settings.footer_contact_text, contentW);
    doc.text(footerLines, pageW / 2, y, { align: "center" });
  }

  // Output
  if (action === "preview") {
    const blob = doc.output("blob");
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
  } else {
    doc.save(`OC-${order.order_id.slice(0, 8).toUpperCase()}.pdf`);
  }
}
