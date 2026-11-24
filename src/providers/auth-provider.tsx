import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from "react";
import { authSnapshot, subscribeAuth, restoreSession, type AuthState } from "@/services/auth";
const Context = createContext<(AuthState & { retry: () => void }) | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const state = useSyncExternalStore(subscribeAuth, authSnapshot, authSnapshot);
  useEffect(() => {
    const restore = () => {
      void restoreSession();
    };
    restore();
    // A window focus (switching browser tabs) must not trigger a database
    // round trip — that was the main cause of slow tab switches. The session
    // is restored on mount and only re-checked when the API reports expiry.
    window.addEventListener("queuecare:session-expired", restore);
    return () => window.removeEventListener("queuecare:session-expired", restore);
  }, []);
  return (
    <Context.Provider
      value={{
        ...state,
        retry: () => {
          void restoreSession();
        },
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useAuth() {
  const state = useContext(Context);
  if (!state) throw new Error("AuthProvider is required.");
  return state;
}
