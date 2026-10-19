import {cookies} from "next/headers";
import {caseRepository} from "@/lib/newsroom/repository";
import {VisitorAccess,VISITOR_COOKIE,visitorView} from "@/lib/newsroom/visitor";
export async function GET(_req:Request,ctx:{params:Promise<{id:string}>}){const c=new VisitorAccess(caseRepository()).get((await ctx.params).id,(await cookies()).get(VISITOR_COOKIE)?.value);return Response.json(c?visitorView(c):{message:"접수한 브라우저에서만 확인할 수 있어요."},{status:c?200:404,headers:{"Cache-Control":"no-store"}});}
