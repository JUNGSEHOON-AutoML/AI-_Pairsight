import { requireOperator, requireSameOrigin, newsroomError } from "@/lib/newsroom/operator-session";
import { boundedRequest } from "@/lib/newsroom/intake";
import { caseRepository } from "@/lib/newsroom/repository";
import { CaseError } from "@/lib/newsroom/model";
import { cachedFeed, searchFeed, importFeedItem } from "@/lib/newsroom/feed-service";
export async function POST(req:Request) {
  try {
    requireSameOrigin(req);const operator=await requireOperator(),repo=caseRepository();
    const body=await (await boundedRequest(req,4096)).json();
    const query=typeof body.query==="string"?body.query.trim().slice(0,100):"";
    if(!query)throw new CaseError("feed_query","검색어를 입력해 주세요.");
    if(body.action==="import") {
      const item=cachedFeed(repo,query)?.items.find(i=>i.id===body.id);
      if(!item)throw new CaseError("feed_missing","먼저 피드를 조회하고 항목을 선택해 주세요.");
      return Response.json({id:importFeedItem(repo,item,operator).id});
    }
    return Response.json(await searchFeed(repo,query),{headers:{"Cache-Control":"no-store"}});
  }catch(e){return newsroomError(e);}
}
