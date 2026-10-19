import { redirect } from "next/navigation";

/** The public site opens on approved cases; private checks have their own entry. */
export default function Home() {
  redirect("/cases");
}
