import { createContext, useContext, useEffect, ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export interface BrandingSettings {
  app_name: string | null;
  logo_url: string | null;
  logo_small_url: string | null;
  favicon_url: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  accent_color: string | null;
  login_background_url: string | null;
}

const DEFAULT_BRANDING: BrandingSettings = {
  app_name: null,
  logo_url: null,
  logo_small_url: null,
  favicon_url: null,
  primary_color: null,
  secondary_color: null,
  accent_color: null,
  login_background_url: null,
};

const BrandingContext = createContext<BrandingSettings>(DEFAULT_BRANDING);

export function useBranding() {
  return useContext(BrandingContext);
}

/** Parse a hex color (#rrggbb) into HSL string "h s% l%" for CSS vars */
function hexToHSL(hex: string): string | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return null;
  let r = parseInt(result[1], 16) / 255;
  let g = parseInt(result[2], 16) / 255;
  let b = parseInt(result[3], 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

function applyBrandingCSS(branding: BrandingSettings) {
  const root = document.documentElement;

  if (branding.primary_color) {
    const hsl = hexToHSL(branding.primary_color);
    if (hsl) {
      root.style.setProperty("--primary", hsl);
      root.style.setProperty("--ring", hsl);
      root.style.setProperty("--sidebar-primary", hsl);
      root.style.setProperty("--sidebar-ring", hsl);
    }
  } else {
    root.style.removeProperty("--primary");
    root.style.removeProperty("--ring");
    root.style.removeProperty("--sidebar-primary");
    root.style.removeProperty("--sidebar-ring");
  }

  if (branding.secondary_color) {
    const hsl = hexToHSL(branding.secondary_color);
    if (hsl) {
      root.style.setProperty("--secondary", hsl);
    }
  } else {
    root.style.removeProperty("--secondary");
  }

  if (branding.accent_color) {
    const hsl = hexToHSL(branding.accent_color);
    if (hsl) {
      root.style.setProperty("--accent", hsl);
    }
  } else {
    root.style.removeProperty("--accent");
  }

  // Favicon
  if (branding.favicon_url) {
    let link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    link.href = branding.favicon_url;
  }
}

export function BrandingProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  const { data: branding } = useQuery({
    queryKey: ["branding-settings", user?.id],
    queryFn: async () => {
      // Use RPC to get restaurant_id, then fetch branding
      const { data: profile } = await supabase
        .from("profiles")
        .select("restaurant_id")
        .eq("user_id", user!.id)
        .single();
      if (!profile?.restaurant_id) return DEFAULT_BRANDING;

      const { data, error } = await supabase
        .from("branding_settings")
        .select("*")
        .eq("restaurant_id", profile.restaurant_id)
        .maybeSingle();
      if (error || !data) return DEFAULT_BRANDING;
      return data as BrandingSettings;
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const activeBranding = branding || DEFAULT_BRANDING;

  useEffect(() => {
    applyBrandingCSS(activeBranding);
  }, [activeBranding]);

  return (
    <BrandingContext.Provider value={activeBranding}>
      {children}
    </BrandingContext.Provider>
  );
}
