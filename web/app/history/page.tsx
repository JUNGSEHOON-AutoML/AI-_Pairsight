import { Suspense } from "react";
import { HistoryList } from "@/components/history-list";

export default function HistoryPage() {
  return (
    <div className="mx-auto grid max-w-reading gap-4">
      <h1 className="text-xl">검사 기록</h1>
      <Suspense fallback={<div aria-hidden="true" className="h-40 animate-pulse rounded-lg bg-surface" />}>
        <HistoryList />
      </Suspense>
    </div>
  );
}
