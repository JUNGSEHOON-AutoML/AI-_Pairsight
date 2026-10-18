import { ButtonLink } from "./ui";

export function Stub({ title, body }: { title: string; body: string }) {
  return (
    <div className="mx-auto grid max-w-reading gap-3">
      <h1 className="text-xl">{title}</h1>
      <p className="text-text-muted">{body}</p>
      <ButtonLink href="/" variant="secondary" className="w-fit">
        검사하러 가기
      </ButtonLink>
    </div>
  );
}
