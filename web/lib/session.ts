// Session cookie: "<userId>.<hmac>". Signed so a visitor cannot swap in someone else's id.
// Every visitor gets an anonymous user on first write, like Supabase anonymous sign-in (architecture.md).
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { getStore, type User } from "./data/store";

const COOKIE = "ps_session";
const g = globalThis as unknown as { __pairsightSecret?: string };
// In dev without a configured secret, a per-process secret is fine: the memory store resets on restart too.
const secret = () => process.env.PAIRSIGHT_SESSION_SECRET ?? (g.__pairsightSecret ??= randomBytes(32).toString("hex"));

const sign = (id: string) => createHmac("sha256", secret()).update(id).digest("base64url");

function verify(value: string | undefined): string | null {
  if (!value) return null;
  const dot = value.lastIndexOf(".");
  if (dot < 1) return null;
  const id = value.slice(0, dot);
  const mac = Buffer.from(value.slice(dot + 1));
  const want = Buffer.from(sign(id));
  return mac.length === want.length && timingSafeEqual(mac, want) ? id : null;
}

export async function setSessionUser(userId: string) {
  (await cookies()).set(COOKIE, `${userId}.${sign(userId)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

export async function clearSession() {
  (await cookies()).delete(COOKIE);
}

/** The signed-in or anonymous user, or null if this browser has no session yet. */
export async function currentUser(): Promise<User | null> {
  const id = verify((await cookies()).get(COOKIE)?.value);
  return id ? getStore().getUser(id) : null;
}

/** For writes: returns the current user, creating an anonymous one if needed. Route handlers only. */
export async function requireUser(): Promise<User> {
  const existing = await currentUser();
  if (existing) return existing;
  const user = await getStore().createAnonymousUser();
  await setSessionUser(user.id);
  return user;
}
