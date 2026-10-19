import { cookies } from "next/headers";
import { OperatorAuth } from "./operator-auth";
import { caseRepository } from "./repository";
import { CaseError } from "./model";
export const OPERATOR_COOKIE = "pairsight_operator";
export const operatorAuth = () => new OperatorAuth(caseRepository());
export async function currentOperator() { return operatorAuth().verify((await cookies()).get(OPERATOR_COOKIE)?.value); }
export async function requireOperator() {
  const id = await currentOperator();
  if (!id) throw new CaseError("unauthorized", "운영자 로그인이 필요해요.");
  return id;
}
export function requireSameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin || req.headers.get("x-newsroom-request") !== "1") throw new CaseError("csrf", "같은 사이트의 운영자 화면에서 요청해 주세요.");
  let same = false;
  try { same = new URL(origin).host === (req.headers.get("host") ?? new URL(req.url).host); } catch { /* fail closed */ }
  if (!same) throw new CaseError("csrf", "다른 사이트의 요청은 허용하지 않아요.");
}
export function newsroomError(e: unknown) {
  return Response.json({ error: e instanceof CaseError ? e.code : "internal", message: e instanceof CaseError ? e.message : "처리에 실패했어요. 비밀 정보가 포함될 수 있는 오류 원문은 표시하지 않아요." },
    { status: e instanceof CaseError && e.code === "unauthorized" ? 401 : e instanceof CaseError && e.code === "csrf" ? 403 : 400, headers: { "Cache-Control": "no-store" } });
}
