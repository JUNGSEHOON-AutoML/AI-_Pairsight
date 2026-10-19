import { Suspense } from "react";
import { redirect } from "next/navigation";
import { currentOperator } from "@/lib/newsroom/operator-session";
import { caseRepository } from "@/lib/newsroom/repository";
import { reliability } from "@/lib/newsroom/reliability";
import { NewsroomBoard } from "@/components/newsroom/board";
async function Board() {
  const operator=await currentOperator();if(!operator)redirect("/newsroom/login");
  const repo=caseRepository(),cases=repo.list();
  return <NewsroomBoard operator={operator} initial={{cases,metrics:reliability(cases,repo.allEvents())}} />;
}
export default function Page(){return <Suspense fallback={<p>편집국 기록 확인 중…</p>}><Board /></Suspense>;}
