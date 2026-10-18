import { Suspense } from "react";
import { LoginForm } from "@/components/login-form";

export default function LoginPage() {
  return (
    <div className="mx-auto grid max-w-reading gap-4">
      <h1 className="text-xl">가입·로그인</h1>
      <p className="text-text-muted">
        이메일로 받은 링크를 누르면 바로 로그인돼요. 비밀번호와 결제 정보는 필요 없어요. 지금까지 한 검사는 그대로 기록에 남아요.
      </p>
      <Suspense fallback={<div aria-hidden="true" className="h-32 animate-pulse rounded-lg bg-surface" />}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
