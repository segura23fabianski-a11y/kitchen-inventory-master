import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type ProfileStatus = "pending" | "active" | "blocked";

interface AuthContextType {
  session: Session | null;
  user: User | null;
  roles: string[];
  profileStatus: ProfileStatus | null;
  loading: boolean;
  signOut: () => Promise<void>;
  hasRole: (role: string) => boolean;
  refetchProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [profileStatus, setProfileStatus] = useState<ProfileStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchRoles = async (userId: string) => {
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    if (data) {
      setRoles(data.map((r) => r.role));
    }
  };

  const fetchProfile = async (userId: string) => {
    const { data } = await supabase
      .from("profiles")
      .select("status")
      .eq("user_id", userId)
      .single();
    if (data) {
      setProfileStatus(data.status as ProfileStatus);
    }
  };

  const refetchProfile = async () => {
    if (user) {
      await fetchProfile(user.id);
      await fetchRoles(user.id);
    }
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          setTimeout(() => {
            fetchProfile(session.user.id);
            fetchRoles(session.user.id);
          }, 0);
        } else {
          setRoles([]);
          setProfileStatus(null);
        }
        setLoading(false);
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id);
        fetchRoles(session.user.id);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const hasRole = (role: string) => roles.includes(role);

  return (
    <AuthContext.Provider value={{ session, user, roles, profileStatus, loading, signOut, hasRole, refetchProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
