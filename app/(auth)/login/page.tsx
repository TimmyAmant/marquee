import { redirect } from "next/navigation";
import { hasAnyUser } from "@/lib/auth/setup";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  if (!(await hasAnyUser())) redirect("/setup");

  return <LoginForm />;
}
