import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-1.5 rounded-md font-semibold whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-55";
const variants: Record<Variant, string> = {
  primary: "bg-accent text-on-accent hover:opacity-90",
  secondary: "border border-border-input bg-bg text-text hover:bg-surface",
  ghost: "text-accent hover:bg-surface",
  danger: "border border-danger bg-bg text-danger hover:bg-verdict-ai-bg",
};
const sizes: Record<Size, string> = { sm: "h-8 px-3 text-sm", md: "h-10 px-4 text-sm", lg: "h-12 px-5 text-base" };

export function buttonClass(variant: Variant = "primary", size: Size = "md", extra?: string) {
  return cx(base, variants[variant], sizes[size], extra);
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  className,
  children,
  ...props
}: ComponentProps<"button"> & { variant?: Variant; size?: Size; loading?: boolean }) {
  return (
    <button
      {...props}
      aria-busy={loading || undefined}
      disabled={props.disabled || loading}
      className={buttonClass(variant, size, className)}
    >
      {children}
    </button>
  );
}

export function ButtonLink({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link {...props} className={buttonClass(variant, size, cx("no-underline", className))} />;
}

export function Panel({ children, className, ...props }: ComponentProps<"section">) {
  return (
    <section {...props} className={cx("rounded-lg border border-border bg-bg", className)}>
      {children}
    </section>
  );
}

export function Block({ title, children, className }: { title?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cx("border-t border-border px-4 py-4 first:border-t-0 md:px-5", className)}>
      {title && <h3 className="mb-2 text-base font-semibold">{title}</h3>}
      {children}
    </div>
  );
}
