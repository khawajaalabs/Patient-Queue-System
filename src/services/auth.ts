import { api } from "@/api/client";
import type { UserProfile } from "@/types/local";
export type AuthState = {
  user: UserProfile | null;
  profile: UserProfile | null;
  loading: boolean;
  error: string;
};
let state: AuthState = { user: null, profile: null, loading: true, error: "" };
let revision = 0;
const listeners = new Set<() => void>();
export function authSnapshot() {
  return state;
}
export function subscribeAuth(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
function publish(profile: UserProfile | null, error = "") {
  state = { user: profile, profile, loading: false, error };
  listeners.forEach((l) => l());
}
export async function restoreSession() {
  const request = ++revision;
  try {
    const profile = await api<UserProfile | null>("/auth/me");
    if (request === revision) publish(profile);
  } catch (error) {
    if (request === revision)
      publish(null, error instanceof Error ? error.message : "Unable to restore your session.");
  }
}
export async function login(email: string, password: string) {
  const request = ++revision;
  const profile = await api<UserProfile>("/auth/login", {
    method: "POST",
    body: { email: email.trim(), password },
  });
  if (request === revision) publish(profile);
  return profile;
}
export async function register(fullName: string, email: string, phone: string, password: string) {
  const request = ++revision;
  const profile = await api<UserProfile>("/auth/register", {
    method: "POST",
    body: { fullName: fullName.trim(), email: email.trim(), phone: phone.trim(), password },
  });
  if (request === revision) publish(profile);
  return profile;
}
export async function logout() {
  await api("/auth/logout", { method: "POST", body: {} });
  ++revision;
  publish(null);
}
