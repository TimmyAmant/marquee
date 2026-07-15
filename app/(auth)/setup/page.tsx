import { redirect } from "next/navigation";
import { hasAnyUser } from "@/lib/auth/setup";
import { SetupForm } from "./setup-form";

export default async function SetupPage() {
  if (await hasAnyUser()) redirect("/login");

  return <SetupForm />;
}
