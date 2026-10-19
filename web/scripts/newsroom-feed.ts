import { CaseRepository } from "../lib/newsroom/repository";
import { searchFeed, importFeedItem } from "../lib/newsroom/feed-service";
async function main() {
  const args=process.argv.slice(2),query=args[0]?.trim(),limit=Number(args[1]??0);
  if(!query||query.length>100||!Number.isInteger(limit)||limit<0||limit>3)throw Error("Usage: newsroom-feed.ts QUERY [IMPORT_COUNT_0_TO_3]");
  const repo=new CaseRepository();
  try {
    const result=await searchFeed(repo,query);
    console.log(JSON.stringify({ok:true,results:result.items.length,cached:result.cached}));
    for(const item of result.items.slice(0,limit)) {
      const c=importFeedItem(repo,item,"google-factcheck-feed");
      console.log(JSON.stringify({caseId:c.id,stage:c.stage,status:c.status}));
    }
  }finally{repo.close();}
}
main().catch(()=>{console.error("피드를 가져오지 못했습니다. 키·API 설정 또는 내부 호출 한도를 확인하세요.");process.exitCode=1;});
