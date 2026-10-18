import { AccountPanel } from "@/components/account-panel";

export default function AccountPage() {
  return (
    <div className="mx-auto grid max-w-reading gap-4">
      <h1 className="text-xl">내 계정</h1>
      <AccountPanel />
    </div>
  );
}
