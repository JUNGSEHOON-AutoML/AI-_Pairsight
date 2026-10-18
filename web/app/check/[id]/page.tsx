import { Suspense } from "react";
import { CheckScreen } from "@/components/check-screen";

// The id comes from the URL at runtime (useParams), so it streams in behind a Suspense boundary
// while the page shell is prerendered (Cache Components).
export default function CheckPage() {
  return (
    <Suspense fallback={<div aria-hidden="true" className="mx-auto h-40 max-w-reading animate-pulse rounded-lg bg-surface" />}>
      <CheckScreen />
    </Suspense>
  );
}
