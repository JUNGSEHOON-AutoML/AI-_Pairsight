import {caseRepository} from "../lib/newsroom/repository";
import {writeBriefing} from "../lib/newsroom/briefing";
async function main(){const repo=caseRepository();try{const retry=process.argv.includes("--retry");for(const c of repo.list().filter(x=>["failed","complete","awaiting_approval","rejected","withdrawn"].includes(x.status))){await writeBriefing(repo,"case",c.id,{retry});}await writeBriefing(repo,"daily",undefined,{retry});console.log("편집장 브리핑 작성 처리를 마쳤습니다. 화면에서 작성 방식을 확인하세요.");}finally{repo.close();}}
main().catch(()=>{console.error("편집장 브리핑 처리 실패 · 오류 원문은 숨겼습니다.");process.exitCode=1;});
