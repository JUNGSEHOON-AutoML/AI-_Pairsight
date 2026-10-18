// Small helpers shared by route handlers.
import { NextResponse } from "next/server";
import { getStore } from "./data/store";
import type { ErrorCode } from "./domain";
import { currentUser } from "./session";

export const json = (body: unknown, status = 200) => NextResponse.json(body, { status });
export const errorCode = (code: ErrorCode, status = 400) => json({ errorCode: code }, status);

/** Loads a check and its analysis if the current session owns it. 404 otherwise (no existence leak). */
export async function ownedCheck(id: string) {
  const user = await currentUser();
  if (!user) return null;
  const store = getStore();
  const check = await store.getCheck(id);
  if (!check || check.userId !== user.id) return null;
  const analysis = await store.getAnalysis(check.analysisId);
  return analysis ? { user, check, analysis } : null;
}

export const notFound = () => json({ error: "not_found" }, 404);

export function parseClaimedDate(raw: unknown): string | null | "invalid" {
  if (raw == null || raw === "") return null;
  if (typeof raw !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return "invalid";
  const d = new Date(`${raw}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== raw) return "invalid";
  if (raw > new Date().toISOString().slice(0, 10)) return "invalid";
  return raw;
}
