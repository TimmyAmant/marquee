import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { hasAnyUser } from "@/lib/auth/setup";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  if (!(await hasAnyUser())) redirect("/setup");

  const session = await auth();
  if (session?.user) redirect("/");

  return <LoginForm />;
}
