import { notFound } from "next/navigation";
import type { ReactNode } from "react";
export default function Layout({children}:{children:ReactNode}) {
  if(process.env.NODE_ENV==="production")notFound();
  return <div className="grid gap-4"><p className="rounded-md bg-surface p-3 text-sm"><strong>개발용 모의 데이터</strong> · 실제 사건이나 판정이 아닙니다.</p>{children}</div>;
}
