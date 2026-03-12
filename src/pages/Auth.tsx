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
import { cn } from "@/lib/utils";

type View = "login" | "register" | "forgot";

export default function Auth() {
  const [view, setView] = useState<View>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const branding = useBranding();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      toast({ title: "Error al iniciar sesión", description: error.message, variant: "destructive" });
    }
    setLoading(false);
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    // Check for existing user with same email via a signIn attempt
    const { data: signUpData, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: window.location.origin,
      },
    });

    if (error) {
      toast({ title: "Error al registrarse", description: error.message, variant: "destructive" });
    } else if (signUpData.user && signUpData.user.identities && signUpData.user.identities.length === 0) {
      // Supabase returns empty identities for duplicate emails
      toast({
        title: "Correo ya registrado",
        description: "Ya existe una cuenta con este correo electrónico. Intenta iniciar sesión o recuperar tu contraseña.",
        variant: "destructive",
      });
    } else {
      toast({ title: "Registro exitoso", description: "Revisa tu correo para verificar tu cuenta." });
      setView("login");
    }
    setLoading(false);
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      toast({ title: "Error", description: "Ingresa tu correo electrónico", variant: "destructive" });
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Correo enviado", description: "Revisa tu bandeja de entrada para restablecer tu contraseña." });
      setView("login");
    }
    setLoading(false);
  };

  const renderForm = () => {
    if (view === "forgot") {
      return (
        <form onSubmit={handleForgotPassword} className="space-y-4">
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
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Enviando..." : "Enviar enlace de recuperación"}
          </Button>
        </form>
      );
    }

    return (
      <form onSubmit={view === "login" ? handleLogin : handleRegister} className="space-y-4">
        {view === "register" && (
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
          {loading ? "Cargando..." : view === "login" ? "Iniciar Sesión" : "Registrarse"}
        </Button>
        {view === "login" && (
          <div className="text-center">
            <button
              type="button"
              onClick={() => setView("forgot")}
              className="text-sm text-muted-foreground hover:text-primary transition-colors"
            >
              ¿Olvidaste tu contraseña?
            </button>
          </div>
        )}
      </form>
    );
  };

  const getTitle = () => {
    if (view === "forgot") return "Recuperar Contraseña";
    return view === "login" ? "Iniciar Sesión" : "Crear Cuenta";
  };

  const getToggleText = () => {
    if (view === "forgot") return "Volver al inicio de sesión";
    return view === "login" ? "¿No tienes cuenta? Regístrate" : "¿Ya tienes cuenta? Inicia sesión";
  };

  const handleToggle = () => {
    if (view === "forgot") setView("login");
    else setView(view === "login" ? "register" : "login");
  };

  return (
    <div
      className="flex min-h-screen items-center justify-center bg-background p-4"
      style={branding.login_background_url ? { backgroundImage: `url(${branding.login_background_url})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
    >
      <Card className={cn("w-full max-w-md border-border/50 shadow-xl", branding.login_background_url && "bg-background/90 backdrop-blur-sm")}>
        <CardHeader className="text-center space-y-4">
          {branding.logo_url ? (
            <img src={branding.logo_url} alt="Logo" className="mx-auto h-14 w-auto object-contain" />
          ) : (
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-primary">
              <Package className="h-7 w-7 text-primary-foreground" />
            </div>
          )}
          <div>
            <CardTitle className="font-heading text-2xl">{getTitle()}</CardTitle>
            <CardDescription>
              {view === "forgot"
                ? "Ingresa tu correo para recibir un enlace de recuperación"
                : branding.app_name || "Sistema de control de inventarios"}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {renderForm()}
          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={handleToggle}
              className="text-sm text-muted-foreground hover:text-primary transition-colors"
            >
              {getToggleText()}
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
