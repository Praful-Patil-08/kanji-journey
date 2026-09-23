import React, { createContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { api } from '@/integrations/api/client';
import type { User, Session } from '@supabase/supabase-js';
import type { Tables } from '@/integrations/supabase/types';

type Profile = Tables<'profiles'>;

const ONBOARDING_KEY = 'kairo_onboarding_done';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signUp: (email: string, password: string) => Promise<{ error: any }>;
  signInWithGoogle: () => Promise<{ data: any; error: any }>;
  signOut: () => Promise<{ error: any }>;
  updateProfile: (updates: Partial<Profile>) => Promise<{ error: any }>;
  refreshProfile: () => Promise<void>;
}

function mapAuthError(message: string): string {
  if (message.includes('Invalid login credentials') || message.includes('invalid_credentials'))
    return 'Invalid email or password.';
  if (message.includes('Email not confirmed'))
    return 'Please confirm your email before signing in.';
  if (message.includes('User already registered'))
    return 'An account with this email already exists.';
  if (message.includes('Password should be'))
    return 'Password must be at least 6 characters.';
  if (message.includes('Unable to validate email'))
    return 'Please enter a valid email address.';
  return message || 'Authentication failed. Please try again.';
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser]       = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Build a synthetic profile from the Supabase user object when the API is unavailable.
  // Reads localStorage so that onboarding_completed survives reloads even without MongoDB.
  const buildFallbackProfile = useCallback((authUser: User): Profile => {
    const now = new Date().toISOString();
    const onboardingDone = localStorage.getItem(ONBOARDING_KEY) === '1';
    return {
      id: authUser.id,
      user_id: authUser.id,
      display_name: (authUser.user_metadata?.full_name as string | undefined)
        ?? authUser.email?.split('@')[0]
        ?? 'User',
      bio: null,
      avatar_url: (authUser.user_metadata?.avatar_url as string | undefined) ?? null,
      current_level: 'N5',
      xp: 0,
      streak: 0,
      readiness_score: 0,
      daily_goal_minutes: 20,
      exam_date: null,
      onboarding_completed: onboardingDone,
      learning_path: null,
      last_activity_date: null,
      created_at: now,
      updated_at: now,
    } as Profile;
  }, []);

  const fetchProfile = useCallback(async (userId: string, fallbackUser?: User | null): Promise<Profile | null> => {
    try {
      const data = await api.get<Profile>(`/api/profiles/${userId}`);
      // If MongoDB returned a real profile with onboarding done, sync the localStorage flag.
      if (data?.onboarding_completed) localStorage.setItem(ONBOARDING_KEY, '1');
      return data;
    } catch {
      if (!fallbackUser) return null;
      return buildFallbackProfile(fallbackUser);
    }
  }, [buildFallbackProfile]);

  useEffect(() => {
    let active = true;

    // ── Eager init ─────────────────────────────────────────────────────────────
    // Read the cached session immediately so the full-screen spinner clears in
    // one microtask. Also set a fallback profile synchronously so the Dashboard
    // renders right away instead of waiting for the profile API round-trip.
    supabase.auth.getSession().then(({ data: { session: cached } }) => {
      if (!active) return;
      const cachedUser = cached?.user ?? null;
      setSession(cached);
      setUser(cachedUser);
      setIsLoading(false);
      if (cachedUser) {
        // Immediately unblock the UI with a fallback profile; replace with the
        // real profile once the API responds (silently — no spinner).
        setProfile(buildFallbackProfile(cachedUser));
        fetchProfile(cachedUser.id, cachedUser).then(p => { if (active && p) setProfile(p); });
      }
    });

    // ── Subsequent changes (sign-in, sign-out, token refresh) ──────────────────
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, currentSession) => {
        if (!active) return;
        // INITIAL_SESSION is already handled by getSession() above.
        if (event === 'INITIAL_SESSION') return;

        const currentUser = currentSession?.user ?? null;

        if (event === 'SIGNED_OUT') {
          setSession(null); setUser(null); setProfile(null); setIsLoading(false);
          return;
        }

        setSession(currentSession);
        setUser(currentUser);
        setIsLoading(false);

        if (currentUser) {
          setProfile(buildFallbackProfile(currentUser));
          const profileData = await fetchProfile(currentUser.id, currentUser);
          if (active && profileData) setProfile(profileData);
        } else {
          setProfile(null);
        }
      }
    );

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [fetchProfile]);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: new Error(mapAuthError(error.message)) };
    return { error: null };
  };

  const signUp = async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/dashboard` },
    });
    if (error) return { error: new Error(mapAuthError(error.message)) };
    return { error: null };
  };

  const signInWithGoogle = async () => {
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}/dashboard`, queryParams: { access_type: 'offline', prompt: 'consent' } },
      });
      if (error) throw error;
      return { data, error: null };
    } catch (err) {
      return { data: null, error: err };
    }
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    return { error };
  };

  const refreshProfile = useCallback(async () => {
    if (!user) return;
    const profileData = await fetchProfile(user.id, user);
    setProfile(profileData);
  }, [user, fetchProfile]);

  const updateProfile = async (updates: Partial<Profile>) => {
    if (!user) return { error: new Error('Not authenticated') };
    try {
      const updated = await api.put<Profile>(`/api/profiles/${user.id}`, updates);
      setProfile(updated as Profile);
      return { error: null };
    } catch (err) {
      return { error: err };
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user, session, profile, isLoading,
        isAuthenticated: !!user,
        signIn, signUp, signInWithGoogle, signOut, updateProfile, refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
