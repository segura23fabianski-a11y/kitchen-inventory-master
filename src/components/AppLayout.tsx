import { ReactNode, useState, useEffect, useRef } from "react";
import { DesktopSidebar, MobileSidebarContent } from "./AppSidebar";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Menu } from "lucide-react";
import * as VisuallyHidden from "@radix-ui/react-visually-hidden";
import { useBranding } from "@/hooks/use-branding";
import { useLocation } from "react-router-dom";

export default function AppLayout({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const branding = useBranding();
  const location = useLocation();
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (mainRef.current) {
      mainRef.current.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
    }
  }, [location.pathname, location.search]);

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop sidebar */}
      <DesktopSidebar />

      {/* Mobile header */}
      <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-background px-4 md:hidden">
        <Button variant="ghost" size="icon" onClick={() => setMobileOpen(true)}>
          <Menu className="h-5 w-5" />
        </Button>
        <span className="font-heading text-lg font-semibold">{branding.app_name || "Inventario"}</span>
      </header>

      {/* Mobile sidebar sheet */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-64 p-0 bg-sidebar border-sidebar-border">
          <VisuallyHidden.Root>
            <SheetTitle>Menú de navegación</SheetTitle>
          </VisuallyHidden.Root>
          <MobileSidebarContent onClose={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      {/* Main content */}
      <main ref={mainRef} className="md:pl-64 overflow-y-auto h-screen">
        <div className="p-4 sm:p-6 lg:p-8">{children}</div>
      </main>
    </div>
  );
}
