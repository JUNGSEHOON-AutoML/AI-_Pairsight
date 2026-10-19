// Read-only live-provider smoke: real local case snapshot, no approval or case mutation.
import {CaseRepository} from "../lib/newsroom/repository";
import {writeDeskReport,reportingLLM,evidenceIds} from "../lib/newsroom/reporting";
import {validateReport} from "../lib/newsroom/harness/validator";
import {protectionGuard} from "../lib/newsroom/harness/guard";
async function main(){const repo=new CaseRepository();try{const c=repo.list().find(c=>c.sections.monitoring?.state==="done");if(!c)throw Error();const check=protectionGuard();check();const start=Date.now();const text=await writeDeskReport(c,"intake","pass",0,reportingLLM(),AbortSignal.timeout(180000));check();validateReport(text,{caseId:c.id,desk:"intake",evidenceIds:evidenceIds(c)});console.log(JSON.stringify({provider:"configured-local-provider",valid:true,durationMs:Date.now()-start,caseMutated:false}));}finally{repo.close();}}
main().catch(()=>{console.error("실제 제공자 보고서 검증 실패. 오류 원문은 숨겼습니다.");process.exitCode=1;});
