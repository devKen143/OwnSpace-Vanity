import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Navigate, useLocation } from 'react-router-dom';
import { supabase } from './lib/supabase';
const SessionContext = createContext<{ session: Session | null; loading: boolean }>({
  session: null,
  loading: true,
});
export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    let active = true;
    let eventReceived = false;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, next) => {
      eventReceived = true;
      if (active) {
        setSession(next);
        setLoading(false);
      }
    });
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (active && !eventReceived) {
          setSession(data.session);
          setLoading(false);
        }
      })
      .catch(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);
  return <SessionContext.Provider value={{ session, loading }}>{children}</SessionContext.Provider>;
}
export const useSession = () => useContext(SessionContext);
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { session, loading } = useSession();
  const location = useLocation();
  if (loading) return <p className="status">Loading your space…</p>;
  return session ? children : <Navigate to="/login" state={{ from: location.pathname }} replace />;
}
