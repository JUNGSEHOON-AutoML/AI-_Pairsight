import { GoogleFactCheckFeed, type FeedClaim } from "./factcheck-feed";
import { CaseError } from "./model";
import type { CaseRepository } from "./repository";
export function cachedFeed(repo:CaseRepository,query:string) {
  repo.db.exec("CREATE TABLE IF NOT EXISTS feed_cache(query TEXT PRIMARY KEY,record TEXT NOT NULL,created INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS feed_requests(at INTEGER NOT NULL)");
  const row=repo.db.prepare("SELECT record,created FROM feed_cache WHERE query=?").get(query) as {record:string;created:number}|undefined;
  return row?{items:JSON.parse(row.record) as FeedClaim[],created:row.created}:null;
}
export async function searchFeed(repo:CaseRepository,query:string,signal:AbortSignal=AbortSignal.timeout(15_000)) {
  signal.throwIfAborted();
  const cache=cachedFeed(repo,query);
  if(cache&&Date.now()-cache.created<900_000)return {items:cache.items,cached:true};
  repo.db.exec("BEGIN IMMEDIATE");
  try {
    const recent=repo.db.prepare("SELECT count(*) AS n FROM feed_requests WHERE at>?").get(Date.now()-3600_000) as {n:number};
    if(recent.n>=6)throw new CaseError("feed_local_limit","내부 피드는 시간당 6회까지 조회해요. 기존 결과를 이용해 주세요.");
    repo.db.prepare("INSERT INTO feed_requests(at) VALUES(?)").run(Date.now());
    repo.db.exec("COMMIT");
  }catch(e){repo.db.exec("ROLLBACK");throw e;}
  const items=await new GoogleFactCheckFeed().search(query,AbortSignal.any([signal,AbortSignal.timeout(15_000)]));
  repo.db.prepare("INSERT OR REPLACE INTO feed_cache(query,record,created) VALUES(?,?,?)").run(query,JSON.stringify(items),Date.now());
  return {items,cached:false};
}
export function importFeedItem(repo:CaseRepository,item:FeedClaim,reportedBy:string) {
  const old=repo.list().find(c=>c.input.feedReview?.url===item.url&&c.input.claim===item.claim);
  if(old)return old;
  return repo.create({origin:"factcheck",claim:item.claim,claimedDate:null,pageUrl:item.url,imageUrl:null,thumbnail:null,imageHash:null,
    provenance:[],candidateUrls:[],channels:["news"],topic:null,contentFlags:[],rightsConfirmed:false,reportedBy,
    feedReview:{url:item.url,publisher:item.publisher,rating:item.rating,reviewedAt:item.reviewedAt}});
}
