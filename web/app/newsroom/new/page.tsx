import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { currentOperator } from "@/lib/newsroom/operator-session";
import { IntakeForm } from "@/components/newsroom/forms";
async function Intake() {
  if(!await currentOperator())redirect("/newsroom/login");
  return <div className="mx-auto grid max-w-reading gap-6"><Link href="/newsroom">← 편집국</Link><h1 className="text-xl">새 사건 접수</h1><IntakeForm /></div>;
}
export default function Page(){return <Suspense fallback={<p>로그인 확인 중…</p>}><Intake /></Suspense>;}
