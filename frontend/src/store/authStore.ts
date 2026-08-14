import { create } from "zustand";

import { requestService, setAuthFailureHandler } from "../shared/requestService";

export interface AuthUser {
    id: string;
    email: string;
}

interface AuthState {
    user: AuthUser | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    login: (email: string, password: string) => Promise<void>;
    logout: () => Promise<void>;
    fetchCurrentUser: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
    user: null,
    isAuthenticated: false,
    isLoading: true,

    login: async (email: string, password: string) => {
        const response = await requestService.post<{ data: { user: AuthUser } }>("/auth/login", {
            email,
            password
        });
        set({ user: response.data.data.user, isAuthenticated: true, isLoading: false });
    },

    logout: async () => {
        await requestService.post("/auth/logout").catch(() => undefined);
        set({ user: null, isAuthenticated: false, isLoading: false });
    },

    fetchCurrentUser: async () => {
        try {
            const response = await requestService.get<{ data: { user: AuthUser } }>("/auth/me");
            set({ user: response.data.data.user, isAuthenticated: true, isLoading: false });
        } catch {
            set({ user: null, isAuthenticated: false, isLoading: false });
        }
    }
}));

setAuthFailureHandler(() => {
    useAuthStore.setState({ user: null, isAuthenticated: false, isLoading: false });
});
