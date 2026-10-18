import { CheckForm } from "@/components/check-form";

export default function Home() {
  return (
    <div className="mx-auto grid max-w-reading gap-6">
      <div className="grid gap-2">
        <h1 className="text-xl">이 이미지, 원본은 어디에 있을까요?</h1>
        <p className="text-text-muted">
          의심되는 이미지를 넣거나, 이미지가 있는 페이지 주소를 붙여 넣어 주세요. 원본을 찾아 나란히 보여주고, 무엇을 근거로
          판정했는지 함께 알려드려요.
        </p>
      </div>
      <CheckForm />
    </div>
  );
}
