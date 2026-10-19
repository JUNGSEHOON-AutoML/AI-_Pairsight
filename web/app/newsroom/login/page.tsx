import { Suspense } from "react";
import { redirect } from "next/navigation";
import { currentOperator, operatorAuth } from "@/lib/newsroom/operator-session";
import { OperatorLogin } from "@/components/newsroom/forms";
async function Login() {
  if (await currentOperator()) redirect("/newsroom");
  return <div className="mx-auto grid max-w-md gap-5"><h1 className="text-xl">편집국 로그인</h1>
    <p className="text-text-muted">실제 사건 접수와 게재 검토는 등록된 운영자만 할 수 있어요.</p>
    {operatorAuth().configured() ? <OperatorLogin /> : <p className="rounded-lg bg-surface p-4">운영자 계정이 아직 없어요. 서버 관리자에게 계정 등록을 요청해 주세요.</p>}
  </div>;
}
export default function Page(){return <Suspense fallback={<p>로그인 확인 중…</p>}><Login /></Suspense>;}
