"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { UserAvatar } from "@/components/user-avatar";
import { avatarPath } from "@/lib/users/avatar-path";
import { updateHouseholdMemberAction, deleteUserAction, type HouseholdMember } from "./users-actions";

/** Longest side of what the browser sends. The server crops to a 512px
 * square anyway; this just keeps a 12-megapixel phone photo from being a
 * 10 MB upload. */
const UPLOAD_MAX_SIDE = 1600;

/** Shrinks and re-encodes the chosen photo in the browser when it can. That
 * also covers iPhone HEIC photos in Safari, which can decode them while the
 * server can't. Anything the browser can't decode goes up as it is, and the
 * server has the final say. */
async function prepareUpload(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, UPLOAD_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
    return blob ?? file;
  } catch {
    return file;
  }
}

/** The edit form's photo: saved as soon as it's chosen or removed, on its
 * own route (app/api/avatars/[id]), independent of the form's Save. The
 * photo stays on this server; nothing is uploaded anywhere else. */
function PhotoField({ member }: { member: HouseholdMember }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [src, setSrc] = useState(() => avatarPath(member, "/api"));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(method: "PUT" | "DELETE", body?: Blob) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/avatars/${member.id}`, {
        method,
        body,
        headers: body ? { "Content-Type": body.type || "application/octet-stream" } : undefined,
      });
      const data = (await res.json().catch(() => ({}))) as { avatarUrl?: string | null; error?: string };
      if (!res.ok) {
        setError(data.error ?? "Couldn't save the photo. Try again.");
        return;
      }
      setSrc(data.avatarUrl ?? null);
      // The menu's avatar and the list row are server-rendered.
      router.refresh();
    } catch {
      setError("Couldn't reach the server. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handleFile(file: File | undefined) {
    if (!file) return;
    await send("PUT", await prepareUpload(file));
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="flex items-center gap-4">
      <UserAvatar label={member.displayName || member.username} src={src} size={64} />
      <div className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="rounded-full border border-border-strong px-3.5 py-1.5 text-xs text-text-primary transition-colors hover:border-accent hover:text-accent disabled:opacity-60"
          >
            {busy ? "Saving…" : src ? "Change photo" : "Add photo"}
          </button>
          {src && (
            <button
              type="button"
              disabled={busy}
              onClick={() => send("DELETE")}
              className="text-xs text-text-secondary underline-offset-2 hover:text-red-400 hover:underline disabled:opacity-60"
            >
              Remove
            </button>
          )}
        </div>
        <p className="text-xs text-text-muted">Kept on this server and shown in the menu and the apps.</p>
        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>
      {/* No name: the photo isn't part of the form's own submission. */}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,image/avif,image/heic,image/heif"
        aria-label="Choose a profile photo"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
    </div>
  );
}

function RemoveMemberButton({ member }: { member: HouseholdMember }) {
  const [confirming, setConfirming] = useState(false);
  const [state, formAction, isPending] = useActionState(deleteUserAction, undefined);

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="text-xs text-text-secondary underline-offset-2 hover:text-red-400 hover:underline"
      >
        Remove
      </button>
    );
  }

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="userId" value={member.id} />
      {state?.error && <span className="text-xs text-red-400">{state.error}</span>}
      <span className="text-xs text-text-secondary">Remove {member.username}?</span>
      <button
        type="submit"
        disabled={isPending}
        className="text-xs font-medium text-red-400 underline-offset-2 hover:underline disabled:opacity-60"
      >
        {isPending ? "Removing…" : "Confirm"}
      </button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        className="text-xs text-text-secondary underline-offset-2 hover:text-accent hover:underline"
      >
        Cancel
      </button>
    </form>
  );
}

function EditMemberForm({
  member,
  isAdmin,
  isSelf,
  onCancel,
  onSaved,
}: {
  member: HouseholdMember;
  isAdmin: boolean;
  isSelf: boolean;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [state, formAction, isPending] = useActionState(updateHouseholdMemberAction, undefined);

  useEffect(() => {
    if (state?.success) onSaved();
  }, [state?.success, onSaved]);

  return (
    <form action={formAction} className="flex flex-col gap-3 px-6 py-4">
      <input type="hidden" name="userId" value={member.id} />
      <PhotoField member={member} />
      <label className="flex flex-col gap-1.5 text-sm text-text-secondary">
        Name
        <input
          type="text"
          name="displayName"
          defaultValue={member.displayName ?? ""}
          className="rounded-lg border border-border bg-bg-0 px-3.5 py-2.5 text-text-primary outline-none transition-colors focus:border-accent"
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm text-text-secondary">
        Username
        <input
          type="text"
          name="username"
          required
          defaultValue={member.username}
          className="rounded-lg border border-border bg-bg-0 px-3.5 py-2.5 text-text-primary outline-none transition-colors focus:border-accent"
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm text-text-secondary">
        New password
        <input
          type="password"
          name="password"
          autoComplete="new-password"
          placeholder="Leave blank to keep current password"
          minLength={8}
          className="rounded-lg border border-border bg-bg-0 px-3.5 py-2.5 text-text-primary outline-none transition-colors focus:border-accent"
        />
      </label>
      {/* Only asked for on your own account (the server checks it whenever a
          new password is set there); the admin resetting a member's password
          doesn't know theirs. */}
      {isSelf && (
        <label className="flex flex-col gap-1.5 text-sm text-text-secondary">
          Current password
          <input
            type="password"
            name="currentPassword"
            autoComplete="current-password"
            placeholder="Needed only when setting a new password"
            className="rounded-lg border border-border bg-bg-0 px-3.5 py-2.5 text-text-primary outline-none transition-colors focus:border-accent"
          />
        </label>
      )}

      {isAdmin && member.role !== "admin" && (
        <>
          <label className="flex items-center gap-2 text-sm text-text-secondary">
            <input
              type="checkbox"
              name="autoApproveMovies"
              defaultChecked={member.autoApproveMovies}
              className="h-4 w-4 rounded border-border accent-accent"
            />
            Auto-approve movie requests
          </label>
          <label className="flex items-center gap-2 text-sm text-text-secondary">
            <input
              type="checkbox"
              name="autoApproveTv"
              defaultChecked={member.autoApproveTv}
              className="h-4 w-4 rounded border-border accent-accent"
            />
            Auto-approve TV requests
          </label>
        </>
      )}

      {state?.error && <p className="text-sm text-red-400">{state.error}</p>}

      <div className="mt-1 flex gap-2">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-bg-0 transition-colors hover:bg-accent-hover disabled:opacity-60"
        >
          {isPending ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full border border-border-strong px-4 py-2 text-sm text-text-primary transition-colors hover:border-accent hover:text-accent"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

export function HouseholdMembersList({
  members,
  currentUserId,
  isAdmin,
}: {
  members: HouseholdMember[];
  currentUserId: string;
  isAdmin: boolean;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <ul className="divide-y divide-border">
      {members.map((member) =>
        editingId === member.id ? (
          <li key={member.id}>
            <EditMemberForm
              member={member}
              isAdmin={isAdmin}
              isSelf={member.id === currentUserId}
              onCancel={() => setEditingId(null)}
              onSaved={() => setEditingId(null)}
            />
          </li>
        ) : (
          <li key={member.id} className="flex items-center justify-between gap-3 px-6 py-4 text-sm">
            <div className="flex min-w-0 items-center gap-3">
              <UserAvatar label={member.displayName || member.username} src={avatarPath(member, "/api")} size={36} />
              <div className="min-w-0">
                <p className="truncate text-text-primary">{member.displayName || member.username}</p>
                {member.displayName && <p className="mt-0.5 truncate text-text-muted">{member.username}</p>}
              </div>
            </div>
            <div className="flex items-center gap-3">
              {member.role === "admin" && (
                <span className="rounded-full border border-accent/50 px-2.5 py-0.5 text-xs text-accent">
                  Admin
                </span>
              )}
              {member.id === currentUserId && (
                <span className="rounded-full border border-border-strong px-2.5 py-0.5 text-xs text-text-secondary">
                  You
                </span>
              )}
              {(isAdmin || member.id === currentUserId) && (
                <button
                  onClick={() => setEditingId(member.id)}
                  className="text-xs text-text-secondary underline-offset-2 hover:text-accent hover:underline"
                >
                  Edit
                </button>
              )}
              {isAdmin && member.role !== "admin" && <RemoveMemberButton member={member} />}
            </div>
          </li>
        ),
      )}
    </ul>
  );
}
