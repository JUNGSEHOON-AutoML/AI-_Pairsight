import Link from "next/link";
import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pairsight · 이미지 근거 확인",
  description: "의심되는 이미지의 원본을 찾아 나란히 보여주고, 근거와 함께 판정합니다.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-50 focus:rounded-md focus:bg-bg focus:px-3 focus:py-2"
        >
          본문으로 건너뛰기
        </a>
        <SiteHeader />
        <main id="main" className="mx-auto w-full max-w-content flex-1 px-4 py-8 md:px-8 md:py-12">
          {children}
        </main>
        <footer className="border-t border-border px-4 py-6 text-center text-sm text-text-muted">
          Pairsight · 자동 분석에는 오류가 있을 수 있어요.{" "}
          <a href="/how-it-works" className="underline">
            판정·게재 기준
          </a> · <Link href="/newsroom">운영자 편집국</Link>
        </footer>
      </body>
    </html>
  );
}
