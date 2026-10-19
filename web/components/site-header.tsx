import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="border-b border-border bg-bg">
      <nav aria-label="주요 메뉴" className="mx-auto flex h-16 max-w-content items-center justify-between gap-2 px-4 md:gap-4 md:px-8">
        <Link href="/" className="flex items-center gap-2 text-lg font-bold text-text no-underline">
          <span aria-hidden="true" className="inline-flex gap-0.5">
            <span className="h-4 w-3 rounded-sm border-2 border-accent" />
            <span className="h-4 w-3 rounded-sm border-2 border-accent bg-highlight" />
          </span>
          Pairsight
        </Link>
        <ul className="flex items-center gap-1 text-sm">
          <li>
            <Link href="/cases" className="whitespace-nowrap rounded-md px-2 py-2 text-text no-underline hover:bg-surface md:px-3">
              공개 사례
            </Link>
          </li>
          <li>
            <Link href="/check" className="whitespace-nowrap rounded-md px-2 py-2 text-text no-underline hover:bg-surface md:px-3">
              사진 확인
            </Link>
          </li>
          <li>
            <Link href="/newsroom" className="whitespace-nowrap rounded-md px-2 py-2 text-text no-underline hover:bg-surface md:px-3">
              운영자
            </Link>
          </li>

        </ul>
      </nav>
    </header>
  );
}
