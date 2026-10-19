import {cookies} from "next/headers";
import {boundedRequest,intake} from "@/lib/newsroom/intake";
import {requireSameOrigin,newsroomError} from "@/lib/newsroom/operator-session";
import {caseRepository} from "@/lib/newsroom/repository";
import {VisitorAccess,VISITOR_COOKIE} from "@/lib/newsroom/visitor";
export async function POST(req:Request){try{
 requireSameOrigin(req);const repo=caseRepository(),access=new VisitorAccess(repo),jar=await cookies(),token=access.session(jar.get(VISITOR_COOKIE)?.value);
 access.reserve(token);
 const raw=await(await boundedRequest(req)).formData(),form=new FormData();
 // Anonymous submitters can supply input, never rights, category, candidate evidence or approval fields.
 for(const key of ["claim","image","pageUrl","externalSearch"])if(raw.has(key))form.set(key,raw.get(key)!);
 const input=await intake(form,"visitor"),c=repo.create(input);access.attach(c.id,token);
 jar.set(VISITOR_COOKIE,token,{httpOnly:true,sameSite:"strict",secure:new URL(req.url).protocol==="https:",path:"/",maxAge:30*86400});
 return Response.json({id:c.id},{status:201,headers:{"Cache-Control":"no-store"}});
}catch(e){return newsroomError(e);}}
