import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [loadingProfile, setLoadingProfile] = useState(false);

  async function fetchProfile(nextSession) {
    if (!nextSession?.access_token) {
      setProfile(null);
      return;
    }

    setLoadingProfile(true);

    try {
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/me`, {
        headers: {
          Authorization: `Bearer ${nextSession.access_token}`,
        },
      });

      if (!response.ok) {
        setProfile(null);
        return;
      }

      const payload = await response.json();
      setProfile(payload?.data?.profile || null);
    } catch (_error) {
      setProfile(null);
    } finally {
      setLoadingProfile(false);
    }
  }

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (mounted) {
        setSession(data.session);
        setLoadingSession(false);
        fetchProfile(data.session).catch(console.error);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setLoadingSession(false);
      fetchProfile(nextSession).catch(console.error);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const value = useMemo(
    () => ({
      session,
      user: session?.user || null,
      profile,
      role: profile?.role || null,
      loading: loadingSession || loadingProfile,
      signIn: (email, password) => supabase.auth.signInWithPassword({ email, password }),
      signUp: (email, password) => supabase.auth.signUp({ email, password }),
      signOut: () => supabase.auth.signOut(),
      hasRole: (...roles) => roles.includes(profile?.role),
      getAccessToken: async () => {
        const { data } = await supabase.auth.getSession();
        return data.session?.access_token || null;
      },
    }),
    [session, profile, loadingSession, loadingProfile]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider.');
  }
  return context;
}
