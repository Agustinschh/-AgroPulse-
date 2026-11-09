import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../services/supabase';
import { Organization, UserRole } from '../types/database';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  role: UserRole;
  organizations: Organization[];
  activeOrg: Organization | null;
  loading: boolean;
  setActiveOrg: (org: Organization) => void;
  signIn: (email: string, pass: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  loginAsDemoUser: (roleType: UserRole) => Promise<{ error: string | null }>;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

const DEMO_ORG: Organization = {
  id: 'a0000000-0000-0000-0000-000000000001',
  name: 'Estancia Didáctica Concordia',
  region: 'Concordia, Entre Ríos',
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<UserRole>('producer');
  const [organizations, setOrganizations] = useState<Organization[]>([DEMO_ORG]);
  const [activeOrg, setActiveOrg] = useState<Organization | null>(DEMO_ORG);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchUserRoleAndOrgs(session.user.id);
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchUserRoleAndOrgs(session.user.id);
      } else {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchUserRoleAndOrgs = async (userId: string) => {
    try {
      const { data: memberships, error } = await supabase
        .from('memberships')
        .select('role, organization_id, organizations(*)')
        .eq('user_id', userId);

      if (!error && memberships && memberships.length > 0) {
        setRole((memberships[0].role as UserRole) || 'producer');
        const orgs = memberships.map((m: any) => m.organizations).filter(Boolean);
        if (orgs.length > 0) {
          setOrganizations(orgs);
          setActiveOrg(orgs[0]);
        }
      }
    } catch (err) {
      console.warn('Error cargando membresía/rol:', err);
    } finally {
      setLoading(false);
    }
  };

  const signIn = async (email: string, pass: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password: pass });
      if (error) return { error: error.message };
      return { error: null };
    } catch (err: any) {
      return { error: err.message || 'Error de conexión' };
    }
  };

  const loginAsDemoUser = async (roleType: UserRole) => {
    const demoEmails = {
      producer: 'productor@agropulse.test',
      operator: 'operador@agropulse.test',
      advisor: 'asesor@agropulse.test',
    };
    const email = demoEmails[roleType];
    const pass = 'AgroPulse2026!';

    // Intentar login o simular estado local
    const res = await signIn(email, pass);
    if (res.error) {
      // Si Supabase local no tiene el usuario creado aún, seteamos el rol en memoria para desarrollo fluido
      setRole(roleType);
      setUser({ id: `demo-${roleType}`, email } as any);
      return { error: null };
    }
    return res;
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        role,
        organizations,
        activeOrg,
        loading,
        setActiveOrg,
        signIn,
        signOut,
        loginAsDemoUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
