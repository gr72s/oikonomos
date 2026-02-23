import { create } from "zustand";
import { configureAuthClient } from "../api/client";
import { getCurrentUser, login as loginApi, logout as logoutApi, refreshToken } from "../api/finance";
import type { CurrentUser, LoginInput } from "../types/finance";

interface PersistedAuthState {
  accessToken: string;
  refreshToken: string;
}

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  currentUser: CurrentUser | null;
  isAuthenticated: boolean;
  authLoading: boolean;
  authError: string | null;
  bootstrapAuth: () => Promise<void>;
  login: (input: LoginInput) => Promise<void>;
  refresh: () => Promise<boolean>;
  logout: () => Promise<void>;
  clearAuth: () => void;
}

const STORAGE_KEY = "oikonomos.auth";

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function loadPersistedAuth(): PersistedAuthState | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as PersistedAuthState;
    if (!parsed.accessToken || !parsed.refreshToken) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function persistAuth(accessToken: string, refreshTokenValue: string): void {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ accessToken, refreshToken: refreshTokenValue } satisfies PersistedAuthState),
  );
}

function clearPersistedAuth(): void {
  localStorage.removeItem(STORAGE_KEY);
}

const persisted = loadPersistedAuth();

export const useAuthStore = create<AuthState>((set, get) => ({
  accessToken: persisted?.accessToken ?? null,
  refreshToken: persisted?.refreshToken ?? null,
  currentUser: null,
  isAuthenticated: Boolean(persisted?.accessToken && persisted?.refreshToken),
  authLoading: false,
  authError: null,
  bootstrapAuth: async () => {
    const { accessToken, refreshToken: refreshTokenValue } = get();
    if (!accessToken || !refreshTokenValue) {
      return;
    }

    set({ authLoading: true, authError: null });
    try {
      const currentUser = await getCurrentUser();
      set({ currentUser, isAuthenticated: true });
    } catch {
      const refreshed = await get().refresh();
      if (!refreshed) {
        get().clearAuth();
      } else {
        try {
          const currentUser = await getCurrentUser();
          set({ currentUser, isAuthenticated: true });
        } catch (error) {
          set({ authError: toErrorMessage(error) });
          get().clearAuth();
        }
      }
    } finally {
      set({ authLoading: false });
    }
  },
  login: async (input) => {
    set({ authLoading: true, authError: null });
    try {
      const tokens = await loginApi(input);
      persistAuth(tokens.accessToken, tokens.refreshToken);
      set({
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        isAuthenticated: true,
      });
      const currentUser = await getCurrentUser();
      set({ currentUser, authError: null });
    } catch (error) {
      set({ authError: toErrorMessage(error) });
      throw error;
    } finally {
      set({ authLoading: false });
    }
  },
  refresh: async () => {
    const currentRefreshToken = get().refreshToken;
    if (!currentRefreshToken) {
      return false;
    }
    try {
      const tokens = await refreshToken(currentRefreshToken);
      persistAuth(tokens.accessToken, tokens.refreshToken);
      set({
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        isAuthenticated: true,
      });
      return true;
    } catch {
      get().clearAuth();
      return false;
    }
  },
  logout: async () => {
    const currentRefreshToken = get().refreshToken;
    try {
      if (currentRefreshToken) {
        await logoutApi(currentRefreshToken);
      }
    } catch {
      // Ignore logout API failures and clear local auth state anyway.
    }
    get().clearAuth();
  },
  clearAuth: () => {
    clearPersistedAuth();
    set({
      accessToken: null,
      refreshToken: null,
      currentUser: null,
      isAuthenticated: false,
      authError: null,
      authLoading: false,
    });
  },
}));

configureAuthClient({
  getAccessToken: () => useAuthStore.getState().accessToken,
  refreshAccessToken: () => useAuthStore.getState().refresh(),
  onUnauthorized: () => useAuthStore.getState().clearAuth(),
});
