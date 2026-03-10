import { useState, useRef } from "react";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useBranding } from "@/hooks/use-branding";
import {
  BookOpen, Download, ChevronRight, LayoutDashboard, Archive, Tag, Warehouse,
  ArrowRightLeft, BookOpenCheck, ClipboardCheck, AlertTriangle, FileText, Truck,
  ShoppingCart, TrendingUp, ChefHat, CalendarDays, UtensilsCrossed, SprayCan,
  PieChart, BarChart3, Layers, Users, Shield, Paintbrush, History, Trash2,
  Search, Package, CheckCircle2, Settings, Monitor, Receipt
} from "lucide-react";

interface Section {
  id: string;
  title: string;
  icon: typeof BookOpen;
  badge?: string;
  content: React.ReactNode;
}

export default function UserManual() {
  const [activeSection, setActiveSection] = useState("intro");
  const contentRef = useRef<HTMLDivElement>(null);
  const branding = useBranding();
  const appName = branding.app_name || "Sistema de Inventario";

  const handlePrint = () => {
    window.print();
  };

  const sections: Section[] = [
    // ─── INTRODUCCIÓN ───
    {
      id: "intro",
      title: "Introducción",
      icon: BookOpen,
      content: (
        <div className="space-y-4">
          <h2 className="text-2xl font-bold font-heading">Bienvenido a {appName}</h2>
          <p className="text-muted-foreground">
            Este manual cubre todas las funcionalidades del sistema de gestión de inventario, compras, recetas y operaciones.
            Está diseñado para todos los roles de usuario: <strong>Administradores</strong>, <strong>Bodega</strong>, <strong>Cocina</strong> y <strong>Operadores</strong>.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Card className="border-primary/20">
              <CardContent className="p-4">
                <h4 className="font-semibold text-sm mb-1">🔐 Administrador</h4>
                <p className="text-xs text-muted-foreground">Acceso total: configuración, usuarios, roles, reportes, branding, auditoría y reset de inventario.</p>
              </CardContent>
            </Card>
            <Card className="border-primary/20">
              <CardContent className="p-4">
                <h4 className="font-semibold text-sm mb-1">📦 Bodega</h4>
                <p className="text-xs text-muted-foreground">Gestión de productos, movimientos, compras, proveedores, conteos físicos y desperdicios.</p>
              </CardContent>
            </Card>
            <Card className="border-primary/20">
              <CardContent className="p-4">
                <h4 className="font-semibold text-sm mb-1">👨‍🍳 Cocina</h4>
                <p className="text-xs text-muted-foreground">Registro de consumos mediante kiosco, recetas y consulta de movimientos.</p>
              </CardContent>
            </Card>
            <Card className="border-primary/20">
              <CardContent className="p-4">
                <h4 className="font-semibold text-sm mb-1">🧹 Operador</h4>
                <p className="text-xs text-muted-foreground">Registro de consumos operativos (lavandería, housekeeping, aseo) mediante el kiosco operativo.</p>
              </CardContent>
            </Card>
          </div>
          <div className="rounded-lg bg-muted p-4">
            <h4 className="font-semibold text-sm mb-2">📋 Guía Rápida de Inicio</h4>
            <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
              <li>Regístrese con su correo electrónico y espere la aprobación del administrador.</li>
              <li>Una vez aprobado, inicie sesión y acceda al Dashboard principal.</li>
              <li>Navegue por el menú lateral izquierdo para acceder a los módulos según su rol.</li>
              <li>Use los kioscos táctiles para registro rápido de consumos en cocina u operaciones.</li>
              <li>Consulte reportes y dashboard ejecutivo para análisis de costos y tendencias.</li>
            </ol>
          </div>
        </div>
      ),
    },
    // ─── ACCESO Y AUTENTICACIÓN ───
    {
      id: "auth",
      title: "Acceso y Autenticación",
      icon: Shield,
      badge: "Todos",
      content: (
        <div className="space-y-4">
          <h2 className="text-2xl font-bold font-heading">Acceso y Autenticación</h2>
          <h3 className="text-lg font-semibold">Registro de usuario</h3>
          <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
            <li>Acceda a la pantalla de inicio de sesión.</li>
            <li>Haga clic en <strong>"Registrarse"</strong>.</li>
            <li>Complete: nombre completo, correo electrónico y contraseña.</li>
            <li>Confirme su correo electrónico mediante el enlace enviado.</li>
            <li>Espere a que un administrador apruebe su cuenta y le asigne un rol.</li>
          </ol>
          <h3 className="text-lg font-semibold mt-4">Inicio de sesión</h3>
          <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
            <li>Ingrese su correo electrónico y contraseña.</li>
            <li>Haga clic en <strong>"Iniciar Sesión"</strong>.</li>
            <li>Si su cuenta está aprobada, accederá al Dashboard.</li>
            <li>Si está pendiente, verá la pantalla de "Pendiente de Aprobación".</li>
          </ol>
          <div className="rounded-lg bg-muted p-4">
            <p className="text-sm text-muted-foreground">
              <strong>💡 Nota:</strong> Si olvidó su contraseña, contacte al administrador del sistema. El sistema soporta personalización visual (logo, colores) que se aplica automáticamente en la pantalla de login.
            </p>
          </div>
        </div>
      ),
    },
    // ─── DASHBOARD ───
    {
      id: "dashboard",
      title: "Dashboard",
      icon: LayoutDashboard,
      badge: "Todos",
      content: (
        <div className="space-y-4">
          <h2 className="text-2xl font-bold font-heading">Dashboard Principal</h2>
          <p className="text-muted-foreground text-sm">
            El Dashboard es la pantalla principal del sistema. Muestra un resumen general del estado del inventario, alertas de stock bajo y accesos rápidos a las funcionalidades más usadas.
          </p>
          <h3 className="text-lg font-semibold">Información mostrada</h3>
          <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
            <li><strong>Resumen de inventario:</strong> Total de productos, valor total del inventario.</li>
            <li><strong>Alertas de stock bajo:</strong> Productos que están por debajo del stock mínimo configurado.</li>
            <li><strong>Movimientos recientes:</strong> Últimas entradas, salidas y ajustes registrados.</li>
            <li><strong>Accesos rápidos:</strong> Botones para ir directamente a los módulos más usados.</li>
          </ul>
        </div>
      ),
    },
    // ─── PRODUCTOS ───
    {
      id: "products",
      title: "Productos",
      icon: Archive,
      badge: "Admin · Bodega",
      content: (
        <div className="space-y-4">
          <h2 className="text-2xl font-bold font-heading">Gestión de Productos</h2>
          <p className="text-muted-foreground text-sm">
            Módulo central para gestionar el catálogo de insumos, materiales y productos del inventario.
          </p>
          <h3 className="text-lg font-semibold">Crear un producto</h3>
          <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
            <li>Vaya a <strong>Inventario → Productos</strong>.</li>
            <li>Haga clic en <strong>"Nuevo Producto"</strong>.</li>
            <li>Complete los campos obligatorios: nombre, unidad base (kg, g, l, ml, unidad).</li>
            <li>Opcionalmente configure: categoría, almacén, stock mínimo, código de barras, imagen.</li>
            <li>Haga clic en <strong>"Guardar"</strong>.</li>
          </ol>
          <h3 className="text-lg font-semibold mt-4">Campos importantes</h3>
          <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
            <li><strong>Unidad base:</strong> La unidad en que se gestiona internamente el stock (kg, g, l, ml, unidad).</li>
            <li><strong>Stock mínimo:</strong> Cuando el stock actual baje de este valor, aparecerá una alerta.</li>
            <li><strong>Modo de reorden:</strong> "Stock mínimo" (alerta cuando baja del mínimo) o "Días de stock" (calcula basado en consumo promedio diario).</li>
            <li><strong>Código de barras:</strong> Permite búsqueda rápida con lector en los kioscos.</li>
            <li><strong>Códigos adicionales:</strong> Puede asociar múltiples códigos a un producto para variaciones (sabores, presentaciones).</li>
          </ul>
          <h3 className="text-lg font-semibold mt-4">Carga masiva</h3>
          <p className="text-sm text-muted-foreground">
            Use el botón <strong>"Carga Masiva"</strong> para importar productos desde un archivo Excel (.xlsx). 
            El sistema mapea automáticamente las columnas y permite revisar antes de confirmar la importación.
          </p>
          <h3 className="text-lg font-semibold mt-4">Imagen del producto</h3>
          <p className="text-sm text-muted-foreground">
            Puede subir una imagen para cada producto. Las imágenes se muestran en los kioscos y en la vista de productos, facilitando la identificación visual.
          </p>
        </div>
      ),
    },
    // ─── CATEGORÍAS ───
    {
      id: "categories",
      title: "Categorías",
      icon: Tag,
      badge: "Admin · Bodega",
      content: (
        <div className="space-y-4">
          <h2 className="text-2xl font-bold font-heading">Categorías</h2>
          <p className="text-muted-foreground text-sm">
            Las categorías permiten organizar los productos en grupos lógicos (ej. "Carnes", "Lácteos", "Limpieza", "Desechables").
          </p>
          <h3 className="text-lg font-semibold">Crear una categoría</h3>
          <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
            <li>Vaya a <strong>Inventario → Categorías</strong>.</li>
            <li>Haga clic en <strong>"Nueva Categoría"</strong>.</li>
            <li>Ingrese el nombre y una descripción opcional.</li>
            <li>Guarde los cambios.</li>
          </ol>
          <div className="rounded-lg bg-muted p-4">
            <p className="text-sm text-muted-foreground">
              <strong>💡 Importante:</strong> Las categorías se usan para filtrar productos en kioscos operativos. 
              Al vincular categorías a un servicio operativo, los productos de esas categorías estarán disponibles para registro en ese servicio.
            </p>
          </div>
        </div>
      ),
    },
    // ─── ALMACENES ───
    {
      id: "warehouses",
      title: "Almacenes",
      icon: Warehouse,
      badge: "Admin · Bodega",
      content: (
        <div className="space-y-4">
          <h2 className="text-2xl font-bold font-heading">Almacenes</h2>
          <p className="text-muted-foreground text-sm">
            Los almacenes permiten organizar los productos por ubicación física (ej. "Bodega Principal", "Cuarto Frío", "Almacén Limpieza").
          </p>
          <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
            <li>Vaya a <strong>Inventario → Almacenes</strong>.</li>
            <li>Cree almacenes con nombre y descripción.</li>
            <li>Al crear o editar un producto, asígnelo a un almacén.</li>
          </ol>
          <p className="text-sm text-muted-foreground">
            Los almacenes se usan como filtro en el inventario físico para realizar conteos por ubicación.
          </p>
        </div>
      ),
    },
    // ─── MOVIMIENTOS ───
    {
      id: "movements",
      title: "Movimientos de Inventario",
      icon: ArrowRightLeft,
      badge: "Todos",
      content: (
        <div className="space-y-4">
          <h2 className="text-2xl font-bold font-heading">Movimientos de Inventario</h2>
          <p className="text-muted-foreground text-sm">
            Registro completo de todas las entradas, salidas, ajustes y consumos del inventario. Cada movimiento actualiza automáticamente el stock y la valoración de costos.
          </p>
          <h3 className="text-lg font-semibold">Tipos de movimiento</h3>
          <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
            <li><strong>Entrada:</strong> Ingreso de mercancía (compras, donaciones). Actualiza stock y costo promedio.</li>
            <li><strong>Salida:</strong> Consumo o despacho de productos. Descuenta stock al costo promedio vigente.</li>
            <li><strong>Ajuste:</strong> Corrección manual del stock (establece una cantidad absoluta).</li>
            <li><strong>Consumo operativo:</strong> Consumos registrados desde los kioscos operativos.</li>
            <li><strong>Merma / Desperdicio / Vencimiento / Daño:</strong> Diferentes tipos de pérdidas controladas.</li>
          </ul>
          <h3 className="text-lg font-semibold mt-4">Registrar un movimiento manual</h3>
          <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
            <li>Vaya a <strong>Inventario → Movimientos</strong>.</li>
            <li>Haga clic en <strong>"Nuevo Movimiento"</strong>.</li>
            <li>Seleccione el tipo, producto, cantidad y unidad.</li>
            <li>Opcionalmente agregue notas.</li>
            <li>Confirme el registro.</li>
          </ol>
          <div className="rounded-lg bg-muted p-4">
            <p className="text-sm text-muted-foreground">
              <strong>💡 Conversión de unidades:</strong> Si el producto está en kg y usted registra en g, el sistema convierte automáticamente.
              Por ejemplo: 500 g = 0.5 kg. La conversión se aplica antes de descontar stock.
            </p>
          </div>
        </div>
      ),
    },
    // ─── KARDEX ───
    {
      id: "kardex",
      title: "Kardex",
      icon: BookOpenCheck,
      badge: "Todos",
      content: (
        <div className="space-y-4">
          <h2 className="text-2xl font-bold font-heading">Kardex</h2>
          <p className="text-muted-foreground text-sm">
            El Kardex es el historial detallado de movimientos por producto. Permite ver la trazabilidad completa: cada entrada, salida, ajuste y consumo con fechas, cantidades, costos y saldos.
          </p>
          <h3 className="text-lg font-semibold">Cómo usar</h3>
          <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
            <li>Vaya a <strong>Inventario → Kardex</strong>.</li>
            <li>Seleccione un producto de la lista o use el buscador.</li>
            <li>Filtre por rango de fechas si lo necesita.</li>
            <li>Revise el detalle de cada movimiento con costo unitario y total.</li>
          </ol>
        </div>
      ),
    },
    // ─── INVENTARIO FÍSICO ───
    {
      id: "physical-inventory",
      title: "Inventario Físico",
      icon: ClipboardCheck,
      badge: "Admin · Bodega",
      content: (
        <div className="space-y-4">
          <h2 className="text-2xl font-bold font-heading">Inventario Físico (Conteo Real)</h2>
          <p className="text-muted-foreground text-sm">
            Permite realizar conteos físicos del inventario para conciliar el stock del sistema con el stock real.
          </p>
          <h3 className="text-lg font-semibold">Flujo de trabajo</h3>
          <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
            <li><strong>Crear conteo:</strong> Vaya a Inventario → Inventario Físico → Nuevo Conteo.</li>
            <li><strong>Filtrar:</strong> Seleccione almacén y/o categoría para limitar los productos a contar.</li>
            <li><strong>Registrar conteo real:</strong> Para cada producto, ingrese la cantidad física encontrada.</li>
            <li><strong>Revisar diferencias:</strong> El sistema calcula automáticamente la diferencia entre stock del sistema y conteo real.</li>
            <li><strong>Aprobar (solo Admin):</strong> Al aprobar, el sistema genera automáticamente movimientos de ajuste para alinear el stock.</li>
          </ol>
          <h3 className="text-lg font-semibold mt-4">Estados del conteo</h3>
          <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
            <li><strong>Borrador:</strong> En proceso de conteo. Se puede editar.</li>
            <li><strong>En revisión:</strong> Listo para revisión del administrador.</li>
            <li><strong>Aprobado:</strong> Conteo cerrado. Los ajustes de stock ya fueron aplicados.</li>
          </ul>
        </div>
      ),
    },
    // ─── DESPERDICIOS ───
    {
      id: "waste",
      title: "Control de Desperdicios",
      icon: AlertTriangle,
      badge: "Admin · Bodega",
      content: (
        <div className="space-y-4">
          <h2 className="text-2xl font-bold font-heading">Control de Desperdicios</h2>
          <p className="text-muted-foreground text-sm">
            Registro y seguimiento de pérdidas de inventario por merma, desperdicio, vencimiento o daño.
          </p>
          <h3 className="text-lg font-semibold">Registrar un desperdicio</h3>
          <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
            <li>Vaya a <strong>Inventario → Desperdicios</strong>.</li>
            <li>Haga clic en <strong>"Registrar"</strong>.</li>
            <li>Seleccione el producto, tipo de pérdida (merma, desperdicio, vencimiento, daño).</li>
            <li>Ingrese la cantidad perdida.</li>
            <li>Seleccione la razón del catálogo de motivos o escriba una personalizada.</li>
            <li>Opcionalmente suba una foto de evidencia.</li>
            <li>Confirme el registro.</li>
          </ol>
          <div className="rounded-lg bg-muted p-4">
            <p className="text-sm text-muted-foreground">
              <strong>💡 Catálogo de motivos:</strong> Un administrador puede configurar motivos predefinidos para cada tipo de pérdida, facilitando la clasificación y el análisis posterior.
            </p>
          </div>
        </div>
      ),
    },
    // ─── FACTURAS DE COMPRA ───
    {
      id: "purchases",
      title: "Facturas de Compra",
      icon: FileText,
      badge: "Admin · Bodega",
      content: (
        <div className="space-y-4">
          <h2 className="text-2xl font-bold font-heading">Facturas de Compra</h2>
          <p className="text-muted-foreground text-sm">
            Registro de facturas de proveedores con control de ítems, costos y posteo al inventario.
          </p>
          <h3 className="text-lg font-semibold">Crear una factura</h3>
          <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
            <li>Vaya a <strong>Compras → Facturas de Compra</strong>.</li>
            <li>Haga clic en <strong>"Nueva Factura"</strong>.</li>
            <li>Ingrese el número de factura y fecha.</li>
            <li>Seleccione un proveedor existente usando el buscador (por nombre, NIT, teléfono o email), o cree uno nuevo directamente desde el formulario.</li>
            <li>Agregue los productos de la factura con cantidad y costo unitario.</li>
            <li>El total se calcula automáticamente.</li>
            <li>Guarde como <strong>Borrador</strong>.</li>
          </ol>
          <h3 className="text-lg font-semibold mt-4">Postear una factura</h3>
          <p className="text-sm text-muted-foreground">
            Al <strong>"Postear"</strong> una factura, el sistema genera automáticamente movimientos de entrada para cada ítem, actualizando el stock y el costo promedio de cada producto. 
            <strong> Una factura posteada no se puede modificar.</strong>
          </p>
          <h3 className="text-lg font-semibold mt-4">Selector inteligente de proveedores</h3>
          <p className="text-sm text-muted-foreground">
            El campo de proveedor permite buscar por nombre, NIT, teléfono o email. Si el proveedor no existe, puede crearlo directamente sin salir del formulario de factura usando el botón <strong>"Crear nuevo proveedor"</strong>.
          </p>
        </div>
      ),
    },
    // ─── PROVEEDORES ───
    {
      id: "suppliers",
      title: "Proveedores",
      icon: Truck,
      badge: "Admin · Bodega",
      content: (
        <div className="space-y-4">
          <h2 className="text-2xl font-bold font-heading">Proveedores</h2>
          <p className="text-muted-foreground text-sm">
            Directorio de proveedores con información de contacto y estado activo/inactivo.
          </p>
          <h3 className="text-lg font-semibold">Campos del proveedor</h3>
          <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
            <li><strong>Nombre:</strong> Razón social o nombre comercial.</li>
            <li><strong>NIT / Cédula:</strong> Identificación fiscal.</li>
            <li><strong>Contacto:</strong> Nombre de contacto, teléfono, email.</li>
            <li><strong>Notas:</strong> Observaciones adicionales.</li>
            <li><strong>Estado:</strong> Activo o inactivo.</li>
          </ul>
          <p className="text-sm text-muted-foreground">
            Los proveedores también pueden crearse directamente desde el formulario de facturas de compra.
          </p>
        </div>
      ),
    },
    // ─── PEDIDOS DE COMPRA ───
    {
      id: "purchase-orders",
      title: "Pedidos de Compra",
      icon: ShoppingCart,
      badge: "Admin · Bodega",
      content: (
        <div className="space-y-4">
          <h2 className="text-2xl font-bold font-heading">Pedidos de Compra</h2>
          <p className="text-muted-foreground text-sm">
            Gestión de pedidos a proveedores con generación automática basada en stock mínimo o días de stock.
          </p>
          <h3 className="text-lg font-semibold">Crear un pedido</h3>
          <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
            <li>Vaya a <strong>Compras → Pedidos de Compra</strong>.</li>
            <li>Haga clic en <strong>"Nuevo Pedido"</strong>.</li>
            <li>Seleccione el proveedor.</li>
            <li>Agregue productos con las cantidades deseadas.</li>
            <li>El sistema puede sugerir cantidades basadas en el modo de reorden de cada producto.</li>
            <li>Guarde y envíe el pedido.</li>
          </ol>
        </div>
      ),
    },
    // ─── HISTÓRICO DE PRECIOS ───
    {
      id: "price-history",
      title: "Histórico de Precios",
      icon: TrendingUp,
      badge: "Admin · Bodega",
      content: (
        <div className="space-y-4">
          <h2 className="text-2xl font-bold font-heading">Histórico de Precios</h2>
          <p className="text-muted-foreground text-sm">
            Visualización del historial de costos unitarios de cada producto a lo largo del tiempo, basado en las facturas de compra registradas.
          </p>
          <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
            <li>Seleccione un producto para ver su evolución de precios.</li>
            <li>Identifique tendencias de incremento o reducción de costos.</li>
            <li>Compare precios entre proveedores y períodos.</li>
          </ul>
        </div>
      ),
    },
    // ─── RECETAS ───
    {
      id: "recipes",
      title: "Recetas",
      icon: ChefHat,
      badge: "Admin · Bodega",
      content: (
        <div className="space-y-4">
          <h2 className="text-2xl font-bold font-heading">Recetas</h2>
          <p className="text-muted-foreground text-sm">
            Gestión de recetas con costeo automático basado en los ingredientes y sus costos promedio de inventario.
          </p>
          <h3 className="text-lg font-semibold">Tipos de receta</h3>
          <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
            <li><strong>🍳 Alimentos (food):</strong> Recetas de cocina estándar.</li>
            <li><strong>🧺 Lavandería (laundry):</strong> Fórmulas de insumos de lavandería por prenda.</li>
            <li><strong>🧹 Housekeeping:</strong> Fórmulas de insumos de limpieza por habitación/área.</li>
          </ul>
          <h3 className="text-lg font-semibold mt-4">Crear una receta</h3>
          <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
            <li>Vaya a <strong>Recetas y Costos → Recetas</strong>.</li>
            <li>Haga clic en <strong>"Nueva Receta"</strong>.</li>
            <li>Ingrese nombre, tipo y descripción.</li>
            <li>Agregue ingredientes: seleccione producto, cantidad y unidad.</li>
            <li>El costo se calcula automáticamente basado en el costo promedio de cada ingrediente.</li>
          </ol>
          <div className="rounded-lg bg-muted p-4">
            <p className="text-sm text-muted-foreground">
              <strong>💡 Rendimiento por porción:</strong> Cada ingrediente puede tener un rendimiento por porción. Esto permite escalar las cantidades al registrar consumos en los kioscos.
            </p>
          </div>
        </div>
      ),
    },
    // ─── PLANEACIÓN DE MINUTA ───
    {
      id: "meal-planning",
      title: "Planeación de Minuta",
      icon: CalendarDays,
      badge: "Admin · Bodega",
      content: (
        <div className="space-y-4">
          <h2 className="text-2xl font-bold font-heading">Planeación de Minuta</h2>
          <p className="text-muted-foreground text-sm">
            Sistema de planificación de menú basado en componentes configurables y recetas, con proyección de insumos y costos.
          </p>
          <h3 className="text-lg font-semibold">Conceptos clave</h3>
          <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
            <li><strong>Componentes:</strong> Categorías del plato (ej. Principal, Proteína, Acompañante, Bebida).</li>
            <li><strong>Servicios:</strong> Tipos de servicio del día (Desayuno, Almuerzo, Cena).</li>
            <li><strong>Porciones proyectadas:</strong> Cantidad de comensales esperados por servicio.</li>
          </ul>
          <h3 className="text-lg font-semibold mt-4">Crear un plan de minuta</h3>
          <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
            <li>Vaya a <strong>Recetas y Costos → Planeación Minuta</strong>.</li>
            <li>Cree un nuevo plan con nombre y rango de fechas.</li>
            <li>Para cada día y servicio, asigne recetas a los componentes.</li>
            <li>Configure las porciones proyectadas.</li>
            <li>Revise la proyección de insumos: el sistema calcula los requerimientos totales y los compara con el stock actual.</li>
          </ol>
        </div>
      ),
    },
    // ─── KIOSCO COCINA ───
    {
      id: "kitchen-kiosk",
      title: "Kiosco de Cocina",
      icon: UtensilsCrossed,
      badge: "Todos",
      content: (
        <div className="space-y-4">
          <h2 className="text-2xl font-bold font-heading">Kiosco de Cocina</h2>
          <p className="text-muted-foreground text-sm">
            Interfaz táctil optimizada para registro rápido de consumos de ingredientes en cocina.
          </p>
          <h3 className="text-lg font-semibold">Flujo de uso</h3>
          <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
            <li><strong>Paso 1 - Seleccionar productos:</strong> Use la cuadrícula para seleccionar múltiples productos. Puede buscar por nombre o código de barras. Verá secciones de "Recientes" y "Más usados" para acceso rápido.</li>
            <li><strong>Paso 2 - Receta (opcional):</strong> Vincule opcionalmente una receta para precargar las cantidades. Si no aplica, salte este paso.</li>
            <li><strong>Paso 3 - Cantidades:</strong> Ingrese o ajuste la cantidad de cada producto. Use el teclado numérico táctil. Seleccione la unidad de medida si difiere de la base del producto.</li>
            <li><strong>Confirmar:</strong> Revise el costo estimado total y confirme. Se descuenta automáticamente del stock.</li>
          </ol>
          <h3 className="text-lg font-semibold mt-4">Funcionalidades especiales</h3>
          <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
            <li><strong>Lector de barras:</strong> Compatible con lectores USB. Simplemente escanee y el producto se selecciona automáticamente.</li>
            <li><strong>Teclado numérico táctil:</strong> Se activa automáticamente en modo kiosco para facilitar la entrada de datos en tablets.</li>
            <li><strong>Conversión de unidades:</strong> Puede ingresar en g y el sistema convierte a kg internamente (o ml → l, etc.).</li>
            <li><strong>Validación de stock:</strong> El sistema advierte si la cantidad solicitada excede el stock disponible.</li>
          </ul>
        </div>
      ),
    },
    // ─── KIOSCO OPERATIVO ───
    {
      id: "operations-kiosk",
      title: "Kiosco Operativo",
      icon: SprayCan,
      badge: "Todos",
      content: (
        <div className="space-y-4">
          <h2 className="text-2xl font-bold font-heading">Kiosco Operativo</h2>
          <p className="text-muted-foreground text-sm">
            Interfaz táctil para registro de consumos no alimentarios: lavandería, housekeeping, aseo y consumibles generales.
          </p>
          <h3 className="text-lg font-semibold">Dos modos de operación</h3>
          
          <h4 className="text-base font-semibold mt-3">📋 Recetas Operativas</h4>
          <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
            <li>Seleccione el tipo: Lavandería o Housekeeping.</li>
            <li>Elija la receta operativa (ej. "Lavado estándar", "Limpieza habitación").</li>
            <li>Ingrese la cantidad de unidades (prendas u habitaciones).</li>
            <li>Los insumos se escalan automáticamente según la receta.</li>
            <li>Confirme y el stock se descuenta.</li>
          </ol>
          
          <h4 className="text-base font-semibold mt-3">🧴 Registro por Servicio</h4>
          <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
            <li><strong>Seleccione un servicio</strong> (ej. "Aseo diario de cocina", "Limpieza baños").</li>
            <li><strong>Seleccione múltiples productos</strong> de la cuadrícula. Solo aparecen los productos de las categorías vinculadas al servicio.</li>
            <li><strong>Ingrese cantidades</strong> para cada producto. Puede cambiar la unidad de medida (ej. g en lugar de kg) y el sistema convierte automáticamente.</li>
            <li><strong>Confirme</strong> el consumo. Se registra un movimiento por cada producto, todos vinculados al mismo servicio.</li>
          </ol>

          <h3 className="text-lg font-semibold mt-4">Gestión de servicios (Admin)</h3>
          <p className="text-sm text-muted-foreground">
            Los administradores pueden crear, editar y eliminar servicios operativos desde el botón <strong>"Gestionar Servicios"</strong>.
            Cada servicio se vincula a categorías de productos, lo que determina qué productos están disponibles para consumo en ese servicio.
          </p>
        </div>
      ),
    },
    // ─── DASHBOARD EJECUTIVO ───
    {
      id: "executive",
      title: "Dashboard Ejecutivo",
      icon: PieChart,
      badge: "Admin",
      content: (
        <div className="space-y-4">
          <h2 className="text-2xl font-bold font-heading">Dashboard Ejecutivo</h2>
          <p className="text-muted-foreground text-sm">
            Vista consolidada de KPIs y métricas financieras del inventario para la toma de decisiones.
          </p>
          <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
            <li>Valor total del inventario.</li>
            <li>Costo de consumos por período.</li>
            <li>Tendencias de consumo.</li>
            <li>Productos más consumidos y más costosos.</li>
            <li>Análisis de desperdicios.</li>
          </ul>
        </div>
      ),
    },
    // ─── REPORTES ───
    {
      id: "reports",
      title: "Reportes",
      icon: BarChart3,
      badge: "Admin",
      content: (
        <div className="space-y-4">
          <h2 className="text-2xl font-bold font-heading">Reportes</h2>
          <p className="text-muted-foreground text-sm">
            Módulo de reportes detallados con gráficos, tablas y filtros para análisis de inventario, costos y operaciones.
          </p>
          <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
            <li>Reporte de movimientos por tipo, producto, fecha.</li>
            <li>Análisis de costos por categoría.</li>
            <li>Reporte de consumos por receta.</li>
            <li>Valoración del inventario.</li>
          </ul>
        </div>
      ),
    },
    // ─── REPORTES OPERATIVOS ───
    {
      id: "operational-reports",
      title: "Reportes Operativos",
      icon: Layers,
      badge: "Admin · Bodega",
      content: (
        <div className="space-y-4">
          <h2 className="text-2xl font-bold font-heading">Reportes Operativos</h2>
          <p className="text-muted-foreground text-sm">
            Reportes específicos de consumos operativos (lavandería, housekeeping, aseo) con desglose por servicio, producto y período.
          </p>
          <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
            <li>Filtro por área/servicio operativo.</li>
            <li>Todos los servicios aparecen en el filtro, incluso sin movimientos registrados.</li>
            <li>Desglose de costos por centro de consumo.</li>
            <li>Comparación entre períodos.</li>
          </ul>
        </div>
      ),
    },
    // ─── USUARIOS ───
    {
      id: "users",
      title: "Gestión de Usuarios",
      icon: Users,
      badge: "Admin",
      content: (
        <div className="space-y-4">
          <h2 className="text-2xl font-bold font-heading">Gestión de Usuarios</h2>
          <p className="text-muted-foreground text-sm">
            Administración de cuentas de usuario, aprobación de registros y asignación de roles.
          </p>
          <h3 className="text-lg font-semibold">Aprobar un usuario nuevo</h3>
          <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
            <li>Vaya a <strong>Configuración → Usuarios</strong>.</li>
            <li>Los usuarios pendientes aparecen con estado <strong>"Pendiente"</strong>.</li>
            <li>Haga clic en el usuario para revisar sus datos.</li>
            <li>Apruébelo y asígnele un rol (admin, bodega, cocina, etc.).</li>
            <li>El usuario recibirá acceso según los permisos de su rol.</li>
          </ol>
          <h3 className="text-lg font-semibold mt-4">Crear usuario manualmente</h3>
          <p className="text-sm text-muted-foreground">
            Los administradores pueden crear usuarios directamente sin que estos se registren, asignando correo, contraseña y rol desde el panel de administración.
          </p>
        </div>
      ),
    },
    // ─── ROLES Y PERMISOS ───
    {
      id: "roles",
      title: "Roles y Permisos",
      icon: Shield,
      badge: "Admin",
      content: (
        <div className="space-y-4">
          <h2 className="text-2xl font-bold font-heading">Roles y Permisos</h2>
          <p className="text-muted-foreground text-sm">
            Sistema granular de permisos basado en roles. Cada rol define qué módulos y funciones puede acceder un usuario.
          </p>
          <h3 className="text-lg font-semibold">Roles del sistema</h3>
          <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
            <li><strong>Admin:</strong> Acceso total a todos los módulos y configuraciones.</li>
            <li><strong>Bodega:</strong> Gestión de inventario, compras, proveedores, productos.</li>
            <li><strong>Cocina:</strong> Acceso a kioscos y consulta de recetas y movimientos.</li>
            <li><strong>Roles personalizados:</strong> El administrador puede crear roles adicionales con permisos específicos.</li>
          </ul>
          <h3 className="text-lg font-semibold mt-4">Configurar permisos</h3>
          <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
            <li>Vaya a <strong>Configuración → Roles y Permisos</strong>.</li>
            <li>Seleccione un rol existente o cree uno nuevo.</li>
            <li>Marque/desmarque las funciones del sistema que el rol debe tener acceso.</li>
            <li>Los cambios se aplican inmediatamente a todos los usuarios con ese rol.</li>
          </ol>
        </div>
      ),
    },
    // ─── BRANDING ───
    {
      id: "branding",
      title: "Configuración Visual",
      icon: Paintbrush,
      badge: "Admin",
      content: (
        <div className="space-y-4">
          <h2 className="text-2xl font-bold font-heading">Configuración Visual (Branding)</h2>
          <p className="text-muted-foreground text-sm">
            Personalización de la apariencia del sistema: nombre, logos, colores y fondo de login.
          </p>
          <h3 className="text-lg font-semibold">Opciones configurables</h3>
          <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
            <li><strong>Nombre de la aplicación:</strong> Se muestra en el sidebar, header y login.</li>
            <li><strong>Logo principal:</strong> Se muestra en la pantalla de login.</li>
            <li><strong>Logo pequeño:</strong> Se muestra en el sidebar.</li>
            <li><strong>Favicon:</strong> Ícono del navegador.</li>
            <li><strong>Color primario:</strong> Botones, links, elementos de acento.</li>
            <li><strong>Color secundario:</strong> Elementos de soporte visual.</li>
            <li><strong>Color de acento:</strong> Highlights y badges.</li>
            <li><strong>Imagen de fondo de login:</strong> Fondo personalizado para la pantalla de inicio de sesión.</li>
          </ul>
          <div className="rounded-lg bg-muted p-4">
            <p className="text-sm text-muted-foreground">
              <strong>💡 Vista previa:</strong> Los cambios se previsualizan en tiempo real antes de guardar.
              Cada tenant/restaurante puede tener su propia configuración visual independiente.
            </p>
          </div>
        </div>
      ),
    },
    // ─── AUDITORÍA ───
    {
      id: "audit",
      title: "Auditoría",
      icon: History,
      badge: "Admin",
      content: (
        <div className="space-y-4">
          <h2 className="text-2xl font-bold font-heading">Registro de Auditoría</h2>
          <p className="text-muted-foreground text-sm">
            Historial completo de todas las acciones realizadas en el sistema con detalle de quién, cuándo y qué se hizo.
          </p>
          <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
            <li>Registro de creación, edición y eliminación de registros.</li>
            <li>Datos "antes" y "después" de cada cambio.</li>
            <li>Filtros por tipo de entidad, acción, usuario y fecha.</li>
            <li>Algunas acciones permiten <strong>rollback</strong> (revertir el cambio).</li>
          </ul>
        </div>
      ),
    },
    // ─── RESET INVENTARIO ───
    {
      id: "reset-inventory",
      title: "Reset de Inventario",
      icon: Trash2,
      badge: "Admin",
      content: (
        <div className="space-y-4">
          <h2 className="text-2xl font-bold font-heading">Reset de Inventario</h2>
          <p className="text-muted-foreground text-sm">
            Función administrativa para reiniciar el inventario a cero. <strong className="text-destructive">⚠️ Esta acción es irreversible.</strong>
          </p>
          <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
            <li>Elimina todos los movimientos de inventario.</li>
            <li>Reinicia el stock de todos los productos a 0.</li>
            <li>Mantiene el catálogo de productos, recetas y configuración.</li>
            <li>Requiere confirmación explícita por seguridad.</li>
          </ul>
          <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-4">
            <p className="text-sm text-destructive">
              <strong>⚠️ Advertencia:</strong> Use esta función solo cuando necesite empezar de cero con el inventario. 
              No hay forma de recuperar los datos una vez ejecutado el reset.
            </p>
          </div>
        </div>
      ),
    },
    // ─── CONVERSIÓN DE UNIDADES ───
    {
      id: "units",
      title: "Conversión de Unidades",
      icon: Settings,
      badge: "Referencia",
      content: (
        <div className="space-y-4">
          <h2 className="text-2xl font-bold font-heading">Sistema de Conversión de Unidades</h2>
          <p className="text-muted-foreground text-sm">
            El sistema maneja automáticamente las conversiones entre unidades compatibles para garantizar precisión en el inventario.
          </p>
          <h3 className="text-lg font-semibold">Conversiones soportadas</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border">
              <thead>
                <tr className="bg-muted">
                  <th className="p-2 text-left border">De</th>
                  <th className="p-2 text-left border">A</th>
                  <th className="p-2 text-left border">Factor</th>
                </tr>
              </thead>
              <tbody>
                <tr><td className="p-2 border">g</td><td className="p-2 border">kg</td><td className="p-2 border">÷ 1000</td></tr>
                <tr><td className="p-2 border">kg</td><td className="p-2 border">g</td><td className="p-2 border">× 1000</td></tr>
                <tr><td className="p-2 border">ml</td><td className="p-2 border">l</td><td className="p-2 border">÷ 1000</td></tr>
                <tr><td className="p-2 border">l</td><td className="p-2 border">ml</td><td className="p-2 border">× 1000</td></tr>
              </tbody>
            </table>
          </div>
          <div className="rounded-lg bg-muted p-4">
            <p className="text-sm text-muted-foreground">
              <strong>Ejemplo:</strong> Si un producto está en <strong>kg</strong> y usted registra 500 <strong>g</strong>, 
              el sistema convierte automáticamente a 0.5 kg antes de descontar del stock.
              Esta conversión aplica en: movimientos, kioscos, recetas, facturas e inventario físico.
            </p>
          </div>
        </div>
      ),
    },
    // ─── MODO KIOSCO ───
    {
      id: "kiosk-mode",
      title: "Modo Kiosco (Tablets)",
      icon: Monitor,
      badge: "Referencia",
      content: (
        <div className="space-y-4">
          <h2 className="text-2xl font-bold font-heading">Modo Kiosco para Tablets</h2>
          <p className="text-muted-foreground text-sm">
            El sistema detecta automáticamente cuando se usa desde una tablet y activa optimizaciones táctiles.
          </p>
          <h3 className="text-lg font-semibold">Características del modo kiosco</h3>
          <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
            <li><strong>Teclado numérico integrado:</strong> Al tocar un campo de cantidad, se abre un teclado numérico propio en lugar del teclado del sistema.</li>
            <li><strong>Teclado alfanumérico integrado:</strong> Los campos de texto (búsqueda, notas) abren un teclado QWERTY propio.</li>
            <li><strong>Botones de tamaño grande:</strong> Optimizados para interacción táctil.</li>
            <li><strong>Formato regional:</strong> Los números se muestran con formato latino (punto para miles, coma para decimales).</li>
            <li><strong>Botones rápidos:</strong> +0.1, +0.5, +1 para ajustar cantidades rápidamente.</li>
          </ul>
          <div className="rounded-lg bg-muted p-4">
            <p className="text-sm text-muted-foreground">
              <strong>💡 Activación:</strong> El modo kiosco se activa automáticamente en dispositivos táctiles. 
              También puede forzarse manualmente desde la configuración.
            </p>
          </div>
        </div>
      ),
    },
  ];

  const activeContent = sections.find((s) => s.id === activeSection);

  return (
    <AppLayout>
      <div className="flex flex-col lg:flex-row gap-6 max-w-6xl mx-auto">
        {/* Sidebar / Table of Contents */}
        <div className="lg:w-64 shrink-0">
          <Card className="lg:sticky lg:top-4">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-primary" /> Manual de Usuario
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="max-h-[60vh] lg:max-h-[75vh]">
                <div className="px-2 pb-3 space-y-0.5">
                  {sections.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => {
                        setActiveSection(s.id);
                        contentRef.current?.scrollTo({ top: 0, behavior: "smooth" });
                      }}
                      className={`w-full text-left text-sm px-3 py-2 rounded-md transition-colors flex items-center gap-2 ${
                        activeSection === s.id
                          ? "bg-primary/10 text-primary font-medium"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      }`}
                    >
                      <s.icon className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate flex-1">{s.title}</span>
                      {s.badge && (
                        <Badge variant="outline" className="text-[10px] px-1 py-0 shrink-0 hidden sm:inline-flex">
                          {s.badge}
                        </Badge>
                      )}
                    </button>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
          <Button variant="outline" size="sm" className="w-full mt-3 print:hidden" onClick={handlePrint}>
            <Download className="mr-2 h-4 w-4" /> Imprimir / Guardar PDF
          </Button>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0" ref={contentRef}>
          <Card>
            <CardContent className="p-6 sm:p-8 prose-sm">
              {activeContent?.content}

              {/* Navigation */}
              <div className="flex justify-between items-center mt-8 pt-4 border-t print:hidden">
                {(() => {
                  const idx = sections.findIndex((s) => s.id === activeSection);
                  const prev = idx > 0 ? sections[idx - 1] : null;
                  const next = idx < sections.length - 1 ? sections[idx + 1] : null;
                  return (
                    <>
                      {prev ? (
                        <Button variant="ghost" size="sm" onClick={() => setActiveSection(prev.id)}>
                          <ChevronRight className="h-4 w-4 rotate-180 mr-1" /> {prev.title}
                        </Button>
                      ) : <div />}
                      {next ? (
                        <Button variant="ghost" size="sm" onClick={() => setActiveSection(next.id)}>
                          {next.title} <ChevronRight className="h-4 w-4 ml-1" />
                        </Button>
                      ) : <div />}
                    </>
                  );
                })()}
              </div>
            </CardContent>
          </Card>

          {/* Print-only: render all sections */}
          <div className="hidden print:block space-y-8">
            {sections.map((s) => (
              <div key={s.id} className="break-inside-avoid">
                {s.content}
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
