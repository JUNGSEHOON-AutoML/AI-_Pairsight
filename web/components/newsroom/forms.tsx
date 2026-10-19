"use client";
import { useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button, ButtonLink, Panel } from "../ui";
import { CHANNELS, TOPICS } from "@/lib/public/types";
import type { FeedClaim } from "@/lib/newsroom/factcheck-feed";
import type { CaseRecord } from "@/lib/newsroom/model";
import { VERDICTS, VERDICT_LABEL } from "@/lib/domain";

export const fieldClass = "w-full min-w-0 rounded-md border border-border-input bg-bg p-3 text-base";
function Field({ title, children }: { title: string; children: ReactNode }) {
  return <label className="grid gap-1 text-sm font-semibold">{title}{children}</label>;
}
export async function request(path: string, body?: object | FormData, method = "POST") {
  const r = await fetch(path, { method, headers: { "x-newsroom-request": "1", ...(body instanceof FormData ? {} : { "content-type": "application/json" }) },
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined });
  const data = await r.json();
  if (!r.ok) throw Error(data.message ?? "요청을 완료하지 못했어요.");
  return data;
}
const message = (e: unknown) => e instanceof Error ? e.message : "요청을 완료하지 못했어요.";

export function OperatorLogin() {
  const router = useRouter(), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const f = new FormData(e.currentTarget); setBusy(true); setError("");
    try { await request("/api/operator/session", { id: f.get("id"), password: f.get("password") }); router.replace("/newsroom"); router.refresh(); }
    catch (e) { setError(message(e)); } finally { setBusy(false); }
  }
  return <form onSubmit={submit} className="grid gap-4">
    <Field title="운영자 ID"><input name="id" autoComplete="username" required className={fieldClass} /></Field>
    <Field title="비밀번호"><input name="password" type="password" autoComplete="current-password" required className={fieldClass} /></Field>
    {error && <p role="alert">{error}</p>}<Button type="submit" loading={busy}>편집국 로그인</Button>
  </form>;
}
export function Logout() {
  const router = useRouter(), [error, setError] = useState("");
  return <><Button variant="ghost" onClick={async () => { try { await request("/api/operator/session", undefined, "DELETE"); router.replace("/newsroom/login"); router.refresh(); } catch(e) { setError(message(e)); } }}>로그아웃</Button>{error && <p role="alert">{error}</p>}</>;
}
export function IntakeForm() {
  const router = useRouter(), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const f = new FormData(e.currentTarget); setError(""); setBusy(true);
    try { const d = await request("/api/operator/cases", f); router.push("/newsroom/" + d.id); }
    catch(e) { setError(message(e)); } finally { setBusy(false); }
  }
  return <form onSubmit={submit} className="grid gap-5">
    <p className="text-sm text-text-muted">이미지 또는 기사 URL과 확인할 주장을 입력해 주세요. 원본은 보관하지 않고 최대 512px 썸네일과 근거만 남겨요.</p>
    <Field title="확인할 주장 (200자 이내)"><textarea name="claim" maxLength={200} rows={3} required className={fieldClass} /></Field>
    <Field title="이미지 업로드 (10MB 이하)"><input name="image" type="file" accept="image/png,image/jpeg,image/webp,image/heic,image/heif" className={fieldClass} /></Field>
    <Field title="기사 URL"><input name="pageUrl" type="url" placeholder="https://" className={fieldClass} /></Field>
    <details><summary className="cursor-pointer text-sm">기사에서 검증할 이미지 주소 지정</summary><Field title="기사에 포함된 이미지 URL"><input name="imageUrl" type="url" className={fieldClass} /></Field><p className="text-sm">지정하지 않으면 대표 이미지의 동일성을 확정하지 않고 판단 불가로 남겨요.</p></details>
    <Field title="원본 후보 페이지 링크 (최대 5개, 한 줄에 하나)"><textarea name="candidateUrls" rows={3} className={fieldClass} /></Field>
    <div className="grid gap-4 sm:grid-cols-2"><Field title="주장에서 말하는 날짜"><input name="claimedDate" type="date" className={fieldClass} /></Field>
      <Field title="카테고리"><select name="topic" className={fieldClass}><option value="">자동 분류</option>{TOPICS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}</select></Field></div>
    <fieldset><legend className="mb-2 text-sm font-semibold">제보된 유포 경로</legend><div className="flex flex-wrap gap-4">{CHANNELS.map(c => <label key={c.id}><input type="checkbox" name="channels" value={c.id} /> {c.label}</label>)}</div></fieldset>
    <fieldset className="grid gap-2"><legend className="mb-2 text-sm font-semibold">추가 검토 사항</legend>{[["sexual_content","성적 콘텐츠 (이미지를 보관하거나 표시하지 않음)"],["minor","미성년자 관련"],["private_person","사생활·사인 관련"],["graphic_violence","잔혹한 장면"],["election_period","선거 기간 관련"]].map(([v,l]) => <label key={v}><input type="checkbox" name="flags" value={v} /> {l}</label>)}</fieldset>
    <label><input type="checkbox" name="rights" value="yes" /> 이미지의 공개 이용 권한을 확인했어요.</label>
    {error && <p role="alert">{error}</p>}<Button loading={busy} type="submit">사건 접수하고 부서 검토 시작</Button>
  </form>;
}
export function FactcheckFeed() {
  const [query,setQuery] = useState("사진"), [items,setItems] = useState<FeedClaim[]>([]), [error,setError] = useState(""), [busy,setBusy] = useState(false), [loaded,setLoaded] = useState(false);
  const [searched,setSearched] = useState(""), router = useRouter();
  async function search(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError("");
    try { const d = await request("/api/operator/feed", { query }); setItems(d.items); setSearched(query); setLoaded(true); }
    catch(e) { setError(message(e)); } finally { setBusy(false); }
  }
  return <Panel className="grid gap-4 p-4"><h2 className="text-lg font-semibold">팩트체크 모니터링 피드</h2>
    <p className="text-sm text-text-muted">Google의 한국어 검색 결과예요. 타 기관의 결론을 우리 판정으로 옮기지 않아요. 선택한 사건만 부서 검토에 접수해요.</p>
    <form onSubmit={search} className="flex flex-wrap gap-2"><label className="min-w-0 flex-1"><span className="sr-only">피드 검색어</span><input required maxLength={100} value={query} onChange={e=>setQuery(e.target.value)} className={fieldClass} /></label><Button loading={busy}>피드 조회</Button></form>
    {error && <p role="alert">{error}</p>}{loaded && !items.length && <p>검색 결과가 없어요.</p>}
    <ul className="grid gap-3">{items.map((i,n)=><li key={i.id + n} className="grid gap-2 border-t border-border pt-3">
      <p>{i.claim}</p><p className="text-sm text-text-muted">{i.publisher} · {i.reviewedAt?.slice(0,10) ?? "날짜 미확인"} · 출처의 평가: {i.rating}</p>
      <div className="flex flex-wrap items-center gap-4"><a href={i.url} target="_blank" rel="noreferrer">출처 원문</a><Button variant="secondary" disabled={busy} onClick={async()=>{setBusy(true);setError("");try {const d=await request("/api/operator/feed",{action:"import",query:searched,id:i.id});router.push("/newsroom/"+d.id);}catch(e){setError(message(e));}finally{setBusy(false);}}}>사건으로 접수</Button></div>
    </li>)}</ul><p className="text-sm text-text-muted">언론사 RSS는 조직 내 이용 허락이 확인되기 전까지 연결하지 않아요.</p>
  </Panel>;
}
export function ReviewActions({ c }: { c: CaseRecord }) {
  const router = useRouter(), [error,setError] = useState(""), [busy,setBusy] = useState(false);
  async function act(action: string, fields: object = {}) {
    setBusy(true);setError("");
    try { await request("/api/operator/cases/"+c.id, {action,revision:c.revision,...fields});router.refresh(); }
    catch(e) {setError(message(e));} finally {setBusy(false);}
  }
  return <Panel className="grid gap-4 p-4"><h2 className="text-lg font-semibold">사람 검토</h2>
    {c.status==="awaiting_approval" && <form className="grid gap-4" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);void act("approve",{title:f.get("title"),summary:f.get("summary")});}}>
      <p>근거와 법무 경고를 확인한 뒤 승인해 주세요. 정치·선거는 서로 다른 운영자 두 명의 검토가 필요해요.</p>
      <Field title="공개 제목 · 확인된 사실 문장"><input name="title" required maxLength={160} defaultValue={c.approvals[0]?.title} readOnly={!!c.approvals.length} className={fieldClass} /></Field>
      <Field title="공개 요약 (200자 이내)"><textarea name="summary" required maxLength={200} defaultValue={c.approvals[0]?.summary} readOnly={!!c.approvals.length} className={fieldClass} /></Field>
      <div className="flex flex-wrap gap-2"><Button loading={busy}>검토 완료 · 게재 승인</Button><Button type="button" variant="danger" disabled={busy} onClick={()=>act("reject")}>반려</Button></div>
    </form>}
    {c.status==="failed" && <Button variant="secondary" loading={busy} onClick={()=>act("retry")}>실패한 부서부터 다시 실행</Button>}
    {c.approvals.length>0 && ["complete","ready","failed"].includes(c.status) && <Button variant="danger" loading={busy} onClick={()=>act("withdraw")}>공개 승인 철회</Button>}
    <p className="text-sm">승인 {c.approvals.length}건{c.status==="complete" && <> · <a href={"/cases/"+c.id}>공개 결과 보기</a></>}</p>
    {c.sections.factcheck?.state==="done" && <details><summary className="cursor-pointer">신뢰성 평가 라벨 기록</summary><form className="mt-3 grid gap-3" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);void act("label",{expected:f.get("expected"),reason:f.get("reason")});}}>
      <Field title="사람이 확인한 정답"><select name="expected" className={fieldClass}>{VERDICTS.map(v=><option key={v} value={v}>{VERDICT_LABEL[v]}</option>)}</select></Field>
      <Field title="평가 근거 (200자 이내)"><textarea name="reason" required maxLength={200} className={fieldClass}/></Field><Button loading={busy}>평가 기록</Button>
    </form></details>}
    {error && <p role="alert">{error}</p>}<ButtonLink href="/newsroom" variant="ghost">편집국 보드로</ButtonLink>
  </Panel>;
}
