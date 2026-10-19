import { CaseRepository } from "../lib/newsroom/repository";
import { createNewsroomAdapter } from "../lib/newsroom/controlroom";
const repo=new CaseRepository(),port=Number(process.env.PAIRSIGHT_CONTROLROOM_PORT??3461);
if(!Number.isInteger(port)||port<1024||port>65535||port===3000)throw Error("Invalid control-room port");
const server=createNewsroomAdapter(repo,process.env.PAIRSIGHT_CONTROLROOM_TOKEN??"");
server.on("error",()=>{console.error("관제실 서버를 시작하지 못했습니다. 포트와 설정을 확인하세요.");repo.close();process.exitCode=1;});
server.listen(port,"127.0.0.1",()=>console.log("실제 사건 HTTP 관제 어댑터 준비 · 보기 전용"));
for(const event of ["SIGINT","SIGTERM"] as const)process.once(event,()=>server.close(()=>repo.close()));
