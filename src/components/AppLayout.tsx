import { ReactNode, useState, useEffect, useRef } from "react";
import { DesktopSidebar, MobileSidebar } from "./AppSidebar";
import { useLocation } from "react-router-dom";

export default function AppLayout({ children }: { children: ReactNode }) {
  const location = useLocation();
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (mainRef.current) {
      mainRef.current.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
    }
  }, [location.pathname, location.search]);

  return (
    <div className="min-h-screen bg-background flex">
      {/* Desktop sidebar - fixed 256px */}
      <DesktopSidebar />

      {/* Mobile sidebar - collapsible icon strip */}
      <MobileSidebar />

      {/* Main content */}
      <main ref={mainRef} className="flex-1 overflow-y-auto h-screen md:ml-64 ml-12">
        <div className="p-3 sm:p-6 lg:p-8">{children}</div>
      </main>
    </div>
  );
}
