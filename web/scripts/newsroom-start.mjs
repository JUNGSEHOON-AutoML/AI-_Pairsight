// Independent localhost viewers and durable worker; secrets travel only in child environments.
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const web=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const claw=process.env.CLAW3D_DIR;
if(!claw)throw Error("Set CLAW3D_DIR to the separate Claw3D newsroom checkout");
const port=(name,fallback)=>{const p=Number(process.env[name]??fallback);if(!Number.isInteger(p)||p<1024||p>65535)throw Error("Invalid port");return p;};
const appPort=port("PAIRSIGHT_PORT",3002),uiPort=port("PAIRSIGHT_CLAW3D_PORT",3460),adapterPort=port("PAIRSIGHT_CONTROLROOM_PORT",3461);
if(new Set([3000,appPort,uiPort,adapterPort]).size!==4)throw Error("Use distinct ports other than 3000");
const token=process.env.PAIRSIGHT_CONTROLROOM_TOKEN??randomBytes(32).toString("base64url");
const dev=process.argv.includes("--dev"),children=[];
let stopping=false;
function stop(){if(stopping)return;stopping=true;for(const c of children)c.kill("SIGTERM");
  // A browser may still hold an SSE connection; never leave owned child servers behind.
  const timer=setTimeout(()=>{for(const c of children)if(c.exitCode===null&&c.signalCode===null)c.kill("SIGKILL");},5000);timer.unref();
}
function watch(child){children.push(child);child.once("error",()=>{console.error("구성 요소 실행 실패");stop();process.exitCode=1;});child.once("exit",code=>{if(!stopping){stop();process.exitCode=code??1;}});}
function start(args,cwd,env={}){watch(spawn(process.execPath,args,{cwd,env:{...process.env,...env},stdio:["ignore","inherit","inherit"]}));}
for(const signal of ["SIGINT","SIGTERM"])process.once(signal,stop);
// Own a private CPU-only Ollama only when the configured local instance is absent.
// Existing instances are never restarted or killed, and no API keys enter this child's environment.
if ((process.env.PAIRSIGHT_LLM??"ollama")==="ollama" && process.env.PAIRSIGHT_MANAGE_OLLAMA!=="0" &&
    (!process.env.PAIRSIGHT_OLLAMA_URL || process.env.PAIRSIGHT_OLLAMA_URL==="http://127.0.0.1:11500")) {
  let available=false;
  try {available=(await fetch("http://127.0.0.1:11500/api/tags",{signal:AbortSignal.timeout(1500)})).ok;}catch{}
  if(!available){
    const child=spawn("/usr/local/bin/ollama",["serve"],{cwd:web,env:{PATH:process.env.PATH,HOME:process.env.HOME,
      CUDA_VISIBLE_DEVICES:"-1",OLLAMA_HOST:"127.0.0.1:11500",OLLAMA_MODELS:resolve(process.env.HOME,".ollama-pairsight"),OLLAMA_NUM_PARALLEL:"1"},stdio:"ignore"});
    children.push(child);child.once("error",()=>console.error("개인 Ollama 시작 실패 · 편집장 비상 보고서를 사용합니다."));
    for(let n=0;n<20;n++){try{if((await fetch("http://127.0.0.1:11500/api/tags",{signal:AbortSignal.timeout(1000)})).ok){available=true;break;}}catch{}await new Promise(r=>setTimeout(r,250));}
    console.log(available?"개인 CPU Ollama 준비 · 기존 공용 서버 변경 없음":"Ollama 연결 확인 필요 · 보고서 자동 인계는 보류됩니다.");
  }
}

start(["node_modules/next/dist/bin/next",dev?"dev":"start","--hostname","127.0.0.1","--port",String(appPort)],web,{PAIRSIGHT_CLAW3D_PORT:String(uiPort)});
start(["--import","tsx","scripts/newsroom-worker.ts"],web);
start(["--import","tsx","scripts/newsroom-controlroom.ts"],web,{PAIRSIGHT_CONTROLROOM_TOKEN:token,PAIRSIGHT_CONTROLROOM_PORT:String(adapterPort)});
// No Google/Gemini keys or other server secrets are forwarded to Claw3D.
watch(spawn(process.execPath,["server/newsroom.js",...(dev?["--dev"]:[])],{cwd:claw,env:{
  PATH:process.env.PATH,HOME:process.env.HOME,NODE_ENV:dev?"development":"production",PORT:String(uiPort),CLAW3D_NEWSROOM_MODE:"1",
  PAIRSIGHT_CONTROLROOM_TOKEN:token,PAIRSIGHT_NEWSROOM_URL:"http://127.0.0.1:"+adapterPort
},stdio:["ignore","inherit","inherit"]}));
console.log("통합 편집국: http://127.0.0.1:"+appPort+"/newsroom · 대시보드와 3D 관제실을 한 화면에서 확인하세요.");
