import { useCallback, useEffect, useState } from 'react';
import { fetchCurrentUser, type CurrentUser } from '../utils/apiClient';

export type UseCredits = {
  user: CurrentUser | null;
  balance: number;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

export function useCredits(): UseCredits {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await fetchCurrentUser();
      setUser(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    user,
    balance: user?.creditBalance ?? 0,
    loading,
    error,
    refresh,
  };
}
