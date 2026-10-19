import sharp from "sharp";
import type {ReverseSearchProvider,ImageInput,ReverseSearchResult} from "../providers/types";
import type {Candidate} from "../verification/types";
import {publicUrl,hash,DECODE_LIMIT} from "../verification/retention";
import {assertFetchableUrl} from "../net/ssrf";
import type {CaseRepository} from "./repository";
import {CaseError} from "./model";
const required=(reason:string)=>new CaseError("candidate_required",`${reason} 원본 후보 페이지 링크를 보충해 주세요.`);
const object=(v:unknown):Record<string,unknown>=>v&&typeof v==="object"&&!Array.isArray(v)?v as Record<string,unknown>:{};
export class SearchBudget {
 constructor(private repo:CaseRepository){repo.db.exec("CREATE TABLE IF NOT EXISTS serp_calls(id INTEGER PRIMARY KEY AUTOINCREMENT,image_hash TEXT NOT NULL,at INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS serp_cache(image_hash TEXT PRIMARY KEY,at INTEGER NOT NULL,result TEXT NOT NULL)");}
 counts(now=Date.now()) {return this.repo.db.prepare("SELECT count(*) AS month,coalesce(sum(at>?),0) AS hour FROM serp_calls WHERE at>?").get(now-3600000,now-31*86400000) as {month:number;hour:number};}
 reserve(imageHash:string,now=Date.now()){
  this.repo.db.exec("BEGIN IMMEDIATE");try{const n=this.counts(now);if(n.month>=250||n.hour>=50)throw required("SerpApi 자체 무료 검색 한도에 도달했어요.");this.repo.db.prepare("INSERT INTO serp_calls(image_hash,at) VALUES(?,?)").run(imageHash,now);this.repo.db.exec("COMMIT");}catch(e){this.repo.db.exec("ROLLBACK");throw e;}
 }
 cached(key:string,now=Date.now()):ReverseSearchResult|null {const row=this.repo.db.prepare("SELECT result FROM serp_cache WHERE image_hash=? AND at>?").get(key,now-3600000) as {result:string}|undefined;return row?JSON.parse(row.result):null;}
 save(key:string,result:ReverseSearchResult){this.repo.db.prepare("INSERT INTO serp_cache VALUES(?,?,?) ON CONFLICT(image_hash) DO UPDATE SET at=excluded.at,result=excluded.result").run(key,Date.now(),JSON.stringify(result));}
}
/** Fixed origin, no SDK retries, bounded responses. Error bodies/URLs/account details are never retained. */
export class SerpApiLensProvider implements ReverseSearchProvider {
 readonly name="SerpApi Google Lens";
 readonly budget:SearchBudget;
 constructor(repo:CaseRepository,private options:{allowUpload?:boolean;fetcher?:typeof fetch}={}){this.budget=new SearchBudget(repo);}
 private async json(path:string,params:Record<string,string>,signal:AbortSignal,form?:FormData){
  const key=process.env.SERPAPI_API_KEY;if(!key)throw required("SerpApi 키가 설정되지 않았어요.");
  const url=new URL(path,"https://serpapi.com");for(const [k,v] of Object.entries(params))url.searchParams.set(k,v);
  if(form)form.set("api_key",key);else url.searchParams.set("api_key",key);
  try{
   const r=await(this.options.fetcher??fetch)(url,{method:form?"POST":"GET",body:form,redirect:"error",signal:AbortSignal.any([signal,AbortSignal.timeout(25000)])});
   if(!r.ok){await r.body?.cancel();throw required(r.status===429?"SerpApi 한도 초과로 자동 검색을 멈췄어요.":"SerpApi 연결을 확인하지 못했어요.");}
   const reader=r.body?.getReader();if(!reader)throw Error();let length=0;const chunks:Uint8Array[]=[];
   while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>1000000){await reader.cancel();throw Error();}chunks.push(value);}
   const body=object(JSON.parse(Buffer.concat(chunks).toString("utf8")));if(body.error)throw required("SerpApi 검색을 완료하지 못했어요.");return body;
  }catch(e){if(e instanceof CaseError)throw e;throw required("SerpApi 검색을 완료하지 못했어요.");}
 }
 async search(image:ImageInput,signal:AbortSignal):Promise<ReverseSearchResult>{
  const key=hash(image.bytes),cached=this.budget.cached(key);if(cached)return cached;
  let url:string|null=null;
  if(image.publicUrl){try{url=publicUrl(image.publicUrl);if(!url)throw Error();assertFetchableUrl(url);}catch{throw required("외부에서 접근할 수 있는 공개 이미지 주소가 아니에요.");}}
  if(!url&&!this.options.allowUpload)throw required("업로드 사진의 외부 검색 허용이 없어 자동 검색을 멈췄어요.");
  if(!process.env.SERPAPI_API_KEY)throw required("SerpApi 키가 설정되지 않았어요.");
  const n=this.budget.counts();if(n.month>=250||n.hour>=50)throw required("SerpApi 자체 무료 검색 한도에 도달했어요.");
  const account=await this.json("/account.json",{},signal);
  if(account.plan_monthly_price!==0||!/^free(?: plan)?$/i.test(String(account.plan_name??"")))throw required("SerpApi 무료 플랜임을 확인하지 못했어요. 유료 검색은 실행하지 않아요.");
  if(typeof account.plan_searches_left!=="number"||account.plan_searches_left<1)throw required("SerpApi 월 무료 검색 한도가 소진됐어요.");
  const params:Record<string,string>={engine:"google_lens",type:"visual_matches",hl:"ko",safe:"active"};
  // Reserve before any upload/search; failures count conservatively. 31-day rolling cap avoids renewal-date mismatches.
  this.budget.reserve(key);
  if(url)params.url=url;
  else {
   let bytes:Buffer;
   try{bytes=await sharp(image.bytes,{limitInputPixels:DECODE_LIMIT,pages:1}).rotate().resize(512,512,{fit:"inside",withoutEnlargement:true}).jpeg({quality:80}).toBuffer();}catch{throw required("검색용 썸네일을 만들지 못했어요.");}
   if(bytes.length>500000)throw required("검색용 썸네일 크기를 초과했어요.");
   const form=new FormData();form.set("image",new Blob([new Uint8Array(bytes)],{type:"image/jpeg"}),"thumbnail.jpg");
   const uploaded=await this.json("/image",{},signal,form);
   if(typeof uploaded.image_id!=="string"||!/^[a-zA-Z0-9_-]{1,200}$/.test(uploaded.image_id))throw required("SerpApi 임시 이미지 등록을 확인하지 못했어요.");
   params.image_id=uploaded.image_id; // Ephemeral ID is never put in DB, Markdown, logs or cards.
  }
  const raw=await this.json("/search.json",params,signal),candidates:Candidate[]=[];
  for(const entry of Array.isArray(raw.visual_matches)?raw.visual_matches:[]){
   const link=object(entry).link;if(typeof link!=="string"||link.length>2048)continue;
   const candidate=publicUrl(link);if(!candidate)continue;
   try{const u=assertFetchableUrl(candidate);if(/(^|\.)(instagram\.com|facebook\.com|youtube\.com|youtu\.be|reddit\.com|tiktok\.com|x\.com|twitter\.com|t\.me)$/.test(u.hostname))continue;}catch{continue;}
   if(candidates.some(c=>c.url===candidate))continue;
   candidates.push({url:candidate,provider:this.name,discoveredAt:new Date().toISOString()});if(candidates.length>=5)break;
  }
  const result={candidates,searchedProviders:[this.name]};this.budget.save(key,result);return result;
 }
}
