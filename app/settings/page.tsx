import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { CreateUserForm } from "./create-user-form";
import { HouseholdMembersList } from "./household-members-list";
import { SignOutButton } from "./sign-out-button";
import { listHouseholdMembers } from "./users-actions";

export default async function AccountSettingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const members = await listHouseholdMembers();
  const isAdmin = session.user.role === "admin";

  return (
    <div>
      <h2 className="font-display text-xl text-text-primary">Account</h2>
      <p className="mt-2 text-sm text-text-secondary">
        Your Marquee account details.
      </p>

      <div className="mt-6 max-w-md rounded-2xl border border-border bg-bg-1 p-6">
        <div className="flex flex-col gap-4 text-sm">
          <div>
            <p className="text-text-muted">Name</p>
            <p className="mt-1 text-text-primary">{session.user.name || "—"}</p>
          </div>
          <div>
            <p className="text-text-muted">Email</p>
            <p className="mt-1 text-text-primary">{session.user.email}</p>
          </div>
        </div>

        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/" });
          }}
          className="mt-6"
        >
          <SignOutButton />
        </form>
      </div>

      <h2 className="mt-10 font-display text-xl text-text-primary">Household members</h2>
      <p className="mt-2 text-sm text-text-secondary">
        Everyone with an account on this Marquee instance.
      </p>
      <div className="mt-6 max-w-md overflow-hidden rounded-2xl border border-border bg-bg-1">
        <HouseholdMembersList members={members} currentUserId={session.user.id} isAdmin={isAdmin} />
      </div>

      {isAdmin && (
        <>
          <h2 className="mt-10 font-display text-xl text-text-primary">Add a household member</h2>
          <p className="mt-2 text-sm text-text-secondary">
            There&apos;s no public signup page — create accounts for other people in your
            household here.
          </p>
          <div className="mt-6 max-w-md rounded-2xl border border-border bg-bg-1 p-6">
            <CreateUserForm />
          </div>
        </>
      )}
    </div>
  );
}
