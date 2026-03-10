import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Package } from "lucide-react";
import { KioskTextInput } from "@/components/ui/kiosk-text-input";
import { useBranding } from "@/hooks/use-branding";

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const branding = useBranding();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    if (isLogin) {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        toast({ title: "Error al iniciar sesión", description: error.message, variant: "destructive" });
      }
    } else {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName },
          emailRedirectTo: window.location.origin,
        },
      });
      if (error) {
        toast({ title: "Error al registrarse", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Registro exitoso", description: "Revisa tu correo para verificar tu cuenta." });
      }
    }
    setLoading(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md border-border/50 shadow-xl">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-primary">
            <Package className="h-7 w-7 text-primary-foreground" />
          </div>
          <div>
            <CardTitle className="font-heading text-2xl">
              {isLogin ? "Iniciar Sesión" : "Crear Cuenta"}
            </CardTitle>
            <CardDescription>
              Sistema de control de inventarios
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <div className="space-y-2">
                <Label htmlFor="fullName">Nombre completo</Label>
                <KioskTextInput
                  id="fullName"
                  value={fullName}
                  onChange={setFullName}
                  placeholder="Juan Pérez"
                  keyboardLabel="Nombre completo"
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">Correo electrónico</Label>
              <KioskTextInput
                id="email"
                value={email}
                onChange={setEmail}
                placeholder="tu@email.com"
                keyboardLabel="Correo electrónico"
                inputType="email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Contraseña</Label>
              <KioskTextInput
                id="password"
                type="password"
                value={password}
                onChange={setPassword}
                placeholder="••••••••"
                keyboardLabel="Contraseña"
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Cargando..." : isLogin ? "Iniciar Sesión" : "Registrarse"}
            </Button>
          </form>
          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={() => setIsLogin(!isLogin)}
              className="text-sm text-muted-foreground hover:text-primary transition-colors"
            >
              {isLogin ? "¿No tienes cuenta? Regístrate" : "¿Ya tienes cuenta? Inicia sesión"}
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
