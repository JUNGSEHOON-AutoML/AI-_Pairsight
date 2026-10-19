import {cookies} from "next/headers";
import {Suspense} from "react";
import {notFound} from "next/navigation";
import {caseRepository} from "@/lib/newsroom/repository";
import {VisitorAccess,VISITOR_COOKIE,visitorView} from "@/lib/newsroom/visitor";
import {SubmissionStatus} from "@/components/submission";
async function Status({params}:{params:Promise<{id:string}>}){const c=new VisitorAccess(caseRepository()).get((await params).id,(await cookies()).get(VISITOR_COOKIE)?.value);if(!c)notFound();return <SubmissionStatus initial={visitorView(c)}/>;}
export default function Page({params}:{params:Promise<{id:string}>}){return <Suspense fallback={<p>접수 상태 확인 중…</p>}><Status params={params}/></Suspense>;}
