import { supabase } from '../services/supabase';

export type UserRole = 'admin' | 'beta' | 'pro' | 'standard' | 'byok';

export async function getUserRole(): Promise<UserRole | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (error || !data) return null;
  return (data.role as UserRole) ?? 'byok';
}

export async function isAdmin(): Promise<boolean> {
  const role = await getUserRole();
  return role === 'admin';
}
