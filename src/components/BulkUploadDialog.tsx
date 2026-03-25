import { useState, useRef } from "react";
import { formatCOP } from "@/lib/utils";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useRestaurantId } from "@/hooks/use-restaurant";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { Upload, FileSpreadsheet, Check, AlertTriangle, Download, X } from "lucide-react";
import * as XLSX from "xlsx";

interface BulkRow {
  producto: string;
  cantidad: number;
  costo_unitario: number;
  matchedProductId?: string;
  matchedProductName?: string;
  error?: string;
}

interface BulkUploadDialogProps {
  products: { id: string; name: string; unit: string; average_cost: number }[] | undefined;
}

export default function BulkUploadDialog({ products }: BulkUploadDialogProps) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<BulkRow[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const { user } = useAuth();
  const restaurantId = useRestaurantId();
  const { toast } = useToast();
  const qc = useQueryClient();

  const matchProduct = (name: string): { id: string; name: string } | null => {
    if (!products || !name) return null;
    const normalized = name.trim().toLowerCase();
    const match = products.find((p) => p.name.toLowerCase() === normalized);
    return match ? { id: match.id, name: match.name } : null;
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target?.result, { type: "binary" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json<Record<string, any>>(ws);

        const parsed: BulkRow[] = json.map((row) => {
          // Flexible column matching
          const producto = String(
            row["Producto"] || row["producto"] || row["PRODUCTO"] || row["Nombre"] || row["nombre"] || ""
          ).trim();
          const cantidad = Number(row["Cantidad"] || row["cantidad"] || row["CANTIDAD"] || row["Qty"] || 0);
          const costo = Number(
            row["Costo Unitario"] || row["costo_unitario"] || row["Costo"] || row["costo"] || row["COSTO"] || row["Precio"] || row["precio"] || 0
          );

          const match = matchProduct(producto);
          const errors: string[] = [];
          if (!match) errors.push("Producto no encontrado");
          if (cantidad <= 0) errors.push("Cantidad inválida");

          return {
            producto,
            cantidad,
            costo_unitario: costo,
            matchedProductId: match?.id,
            matchedProductName: match?.name,
            error: errors.length ? errors.join(", ") : undefined,
          };
        });

        setRows(parsed);
      } catch {
        toast({ title: "Error al leer archivo", description: "Verifica que sea un archivo Excel válido.", variant: "destructive" });
      }
    };
    reader.readAsBinaryString(file);
  };

  const validRows = rows.filter((r) => !r.error);
  const errorRows = rows.filter((r) => r.error);
  const totalCost = validRows.reduce((s, r) => s + r.cantidad * r.costo_unitario, 0);

  const handleUpload = async () => {
    if (!validRows.length || !user) return;
    setUploading(true);
    setProgress(0);

    try {
      // Insert in batches of 50
      const batch = 50;
      for (let i = 0; i < validRows.length; i += batch) {
        const chunk = validRows.slice(i, i + batch);
        const inserts = chunk.map((r) => ({
          product_id: r.matchedProductId!,
          user_id: user.id,
          type: "entrada" as const,
          quantity: r.cantidad,
          unit_cost: r.costo_unitario,
          total_cost: r.cantidad * r.costo_unitario,
          notes: "Carga masiva",
          restaurant_id: restaurantId!,
        }));

        const { error } = await supabase.from("inventory_movements").insert(inserts);
        if (error) throw error;

        setProgress(Math.min(100, Math.round(((i + chunk.length) / validRows.length) * 100)));
      }

      qc.invalidateQueries({ queryKey: ["movements"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      toast({ title: `${validRows.length} movimientos registrados` });
      setRows([]);
      setOpen(false);
    } catch (e: any) {
      toast({ title: "Error en carga masiva", description: e.message, variant: "destructive" });
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  const downloadTemplate = () => {
    const templateData = [
      { Producto: "Ejemplo: Harina", Cantidad: 10, "Costo Unitario": 25.5 },
    ];
    if (products?.length) {
      products.slice(0, 3).forEach((p) => {
        templateData.push({ Producto: p.name, Cantidad: 0, "Costo Unitario": p.average_cost });
      });
    }
    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Inventario");
    XLSX.writeFile(wb, "plantilla_inventario.xlsx");
  };

  const handleClose = (v: boolean) => {
    if (!uploading) {
      setOpen(v);
      if (!v) setRows([]);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Upload className="mr-2 h-4 w-4" /> Carga Masiva
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" /> Carga Masiva de Entradas
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Instructions */}
          <div className="rounded-md bg-muted p-4 text-sm space-y-2">
            <p className="font-medium">Instrucciones:</p>
            <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
              <li>Descarga la plantilla Excel con los nombres de tus productos</li>
              <li>Completa las columnas: <strong>Producto</strong>, <strong>Cantidad</strong>, <strong>Costo Unitario</strong></li>
              <li>El nombre del producto debe coincidir exactamente con el registrado</li>
              <li>Sube el archivo y revisa la vista previa antes de confirmar</li>
            </ol>
            <Button variant="secondary" size="sm" onClick={downloadTemplate} className="mt-2">
              <Download className="mr-2 h-4 w-4" /> Descargar Plantilla
            </Button>
          </div>

          {/* File input */}
          <div>
            <Input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFile}
              className="cursor-pointer"
            />
          </div>

          {/* Preview */}
          {rows.length > 0 && (
            <>
              <div className="flex items-center gap-4 text-sm">
                <Badge variant="secondary" className="gap-1">
                  <Check className="h-3 w-3" /> {validRows.length} válidos
                </Badge>
                {errorRows.length > 0 && (
                  <Badge variant="destructive" className="gap-1">
                    <AlertTriangle className="h-3 w-3" /> {errorRows.length} con errores
                  </Badge>
                )}
                <span className="ml-auto text-muted-foreground">
                  Costo total: <strong>{formatCOP(totalCost, 2)}</strong>
                </span>
              </div>

              <div className="border rounded-md max-h-64 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Producto</TableHead>
                      <TableHead>Cantidad</TableHead>
                      <TableHead>Costo Unit.</TableHead>
                      <TableHead>Total</TableHead>
                      <TableHead>Estado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r, i) => (
                      <TableRow key={i} className={r.error ? "bg-destructive/5" : ""}>
                        <TableCell className="font-medium">
                          {r.matchedProductName || r.producto}
                        </TableCell>
                        <TableCell>{r.cantidad}</TableCell>
                        <TableCell>{formatCOP(r.costo_unitario, 2)}</TableCell>
                        <TableCell className="font-semibold">
                          {formatCOP((r.cantidad * r.costo_unitario), 2)}
                        </TableCell>
                        <TableCell>
                          {r.error ? (
                            <span className="text-destructive text-xs flex items-center gap-1">
                              <X className="h-3 w-3" /> {r.error}
                            </span>
                          ) : (
                            <Check className="h-4 w-4 text-success" />
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {uploading && <Progress value={progress} className="h-2" />}

              <Button
                onClick={handleUpload}
                disabled={uploading || !validRows.length}
                className="w-full"
              >
                {uploading
                  ? `Registrando... ${progress}%`
                  : `Registrar ${validRows.length} entradas`}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
