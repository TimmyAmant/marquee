"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { UserAvatar } from "@/components/user-avatar";
import { avatarPath } from "@/lib/users/avatar-path";
import { updateHouseholdMemberAction, deleteUserAction, type HouseholdMember } from "./users-actions";
import { lastActiveLabel } from "@/lib/users/last-active-label";
import { PERMISSION_PRESET_LABELS, presetFor } from "@/lib/users/permissions";
import { useT } from "@/lib/i18n/client";
import { rich } from "@/lib/i18n/rich";
import { PermissionsEditor } from "./permissions-editor";

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
  const t = useT();
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
        setError(data.error ?? t("settings.photoSaveFailed"));
        return;
      }
      setSrc(data.avatarUrl ?? null);
      // The menu's avatar and the list row are server-rendered.
      router.refresh();
    } catch {
      setError(t("settings.serverUnreachable"));
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
            {busy ? t("common.saving") : src ? t("settings.changePhoto") : t("settings.addPhoto")}
          </button>
          {src && (
            <button
              type="button"
              disabled={busy}
              onClick={() => send("DELETE")}
              className="text-xs text-text-secondary underline-offset-2 hover:text-red-400 hover:underline disabled:opacity-60"
            >
              {t("common.remove")}
            </button>
          )}
        </div>
        <p className="text-xs text-text-muted">{t("settings.photoHelp")}</p>
        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>
      {/* No name: the photo isn't part of the form's own submission. */}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,image/avif,image/heic,image/heif"
        aria-label={t("settings.choosePhoto")}
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
    </div>
  );
}

function RemoveMemberButton({ member }: { member: HouseholdMember }) {
  const t = useT();
  const [confirming, setConfirming] = useState(false);
  const [state, formAction, isPending] = useActionState(deleteUserAction, undefined);

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="text-xs text-text-secondary underline-offset-2 hover:text-red-400 hover:underline"
      >
        {t("common.remove")}
      </button>
    );
  }

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="userId" value={member.id} />
      {state?.error && <span className="text-xs text-red-400">{state.error}</span>}
      <span className="text-xs text-text-secondary">{t("settings.removeMemberConfirm", { name: member.username })}</span>
      <button
        type="submit"
        disabled={isPending}
        className="text-xs font-medium text-red-400 underline-offset-2 hover:underline disabled:opacity-60"
      >
        {isPending ? t("settings.removing") : t("common.confirm")}
      </button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        className="text-xs text-text-secondary underline-offset-2 hover:text-accent hover:underline"
      >
        {t("common.cancel")}
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
  const t = useT();
  const [state, formAction, isPending] = useActionState(updateHouseholdMemberAction, undefined);

  useEffect(() => {
    if (state?.success) onSaved();
  }, [state?.success, onSaved]);

  return (
    <form action={formAction} className="flex flex-col gap-3 px-6 py-4">
      <input type="hidden" name="userId" value={member.id} />
      <PhotoField member={member} />
      <label className="flex flex-col gap-1.5 text-sm text-text-secondary">
        {t("settings.nameLabel")}
        <input
          type="text"
          name="displayName"
          defaultValue={member.displayName ?? ""}
          className="rounded-lg border border-border bg-bg-0 px-3.5 py-2.5 text-text-primary outline-none transition-colors focus:border-accent"
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm text-text-secondary">
        {t("settings.usernameLabel")}
        <input
          type="text"
          name="username"
          required
          defaultValue={member.username}
          className="rounded-lg border border-border bg-bg-0 px-3.5 py-2.5 text-text-primary outline-none transition-colors focus:border-accent"
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm text-text-secondary">
        {t("settings.newPasswordLabel")}
        <input
          type="password"
          name="password"
          autoComplete="new-password"
          placeholder={member.hasPassword ? t("settings.newPasswordKeepPlaceholder") : t("settings.newPasswordNonePlaceholder")}
          minLength={8}
          className="rounded-lg border border-border bg-bg-0 px-3.5 py-2.5 text-text-primary outline-none transition-colors focus:border-accent"
        />
      </label>
      {/* Only asked for on your own account (the server checks it whenever a
          new password is set there); the admin resetting a member's password
          doesn't know theirs, and an account made by Plex/Jellyfin sign-in
          has none yet. */}
      {isSelf && member.hasPassword && (
        <label className="flex flex-col gap-1.5 text-sm text-text-secondary">
          {t("settings.currentPasswordLabel")}
          <input
            type="password"
            name="currentPassword"
            autoComplete="current-password"
            placeholder={t("settings.currentPasswordPlaceholder")}
            className="rounded-lg border border-border bg-bg-0 px-3.5 py-2.5 text-text-primary outline-none transition-colors focus:border-accent"
          />
        </label>
      )}

      {isAdmin && member.role !== "admin" && !isSelf && (
        <>
          <PermissionsEditor initial={member.permissions} />
          <fieldset className="flex flex-col gap-2 text-sm text-text-secondary">
            <legend className="mb-1">{t("settings.requestLimitsLegend")}</legend>
            {(["movie", "tv"] as const).map((kind) => (
              <div key={kind} className="flex flex-wrap items-center gap-2">
                <span className="w-16">{kind === "movie" ? t("common.movies") : t("settings.tvShort")}</span>
                {rich(t("settings.requestLimitEvery"), {
                  limit: () => (
                    <input
                      type="number"
                      min={1}
                      max={1000}
                      name={`${kind}QuotaLimit`}
                      defaultValue={(kind === "movie" ? member.movieQuotaLimit : member.tvQuotaLimit) ?? ""}
                      placeholder={t("settings.noLimit")}
                      className="w-24 rounded-lg border border-border bg-bg-0 px-3 py-2 text-text-primary outline-none focus:border-accent"
                    />
                  ),
                  days: () => (
                    <input
                      type="number"
                      min={1}
                      max={365}
                      name={`${kind}QuotaDays`}
                      defaultValue={kind === "movie" ? member.movieQuotaDays : member.tvQuotaDays}
                      className="w-20 rounded-lg border border-border bg-bg-0 px-3 py-2 text-text-primary outline-none focus:border-accent"
                    />
                  ),
                  text: (chunks) => <span>{chunks}</span>,
                })}
              </div>
            ))}
          </fieldset>
        </>
      )}

      {state?.error && <p className="text-sm text-red-400">{state.error}</p>}

      <div className="mt-1 flex gap-2">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-bg-0 transition-colors hover:bg-accent-hover disabled:opacity-60"
        >
          {isPending ? t("common.saving") : t("common.save")}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full border border-border-strong px-4 py-2 text-sm text-text-primary transition-colors hover:border-accent hover:text-accent"
        >
          {t("common.cancel")}
        </button>
      </div>
    </form>
  );
}

export function HouseholdMembersList({
  members,
  currentUserId,
  isAdmin,
  jellyfinName = "Jellyfin",
}: {
  members: HouseholdMember[];
  currentUserId: string;
  isAdmin: boolean;
  /** "Emby" when that's the connected server. */
  jellyfinName?: string;
}) {
  const t = useT();
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
                {/* The admin's view of who still uses Marquee; relative to
                    the viewer's clock, so the server's render may differ. */}
                {isAdmin && member.id !== currentUserId && (
                  <p className="mt-0.5 truncate text-xs text-text-muted" suppressHydrationWarning>
                    {lastActiveLabel(t, member.lastActiveAt, new Date())}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3">
              {member.plexLinked && (
                <span className="rounded-full border border-border-strong px-2.5 py-0.5 text-xs text-text-secondary">
                  Plex
                </span>
              )}
              {member.jellyfinLinked && (
                <span className="rounded-full border border-border-strong px-2.5 py-0.5 text-xs text-text-secondary">
                  {jellyfinName}
                </span>
              )}
              {member.ssoLinked && (
                <span className="rounded-full border border-border-strong px-2.5 py-0.5 text-xs text-text-secondary">
                  SSO
                </span>
              )}
              {member.role === "admin" && (
                <span className="rounded-full border border-accent/50 px-2.5 py-0.5 text-xs text-accent">
                  {t(PERMISSION_PRESET_LABELS.admin)}
                </span>
              )}
              {member.role !== "admin" && presetFor(member) !== "member" && (
                <span className="rounded-full border border-accent/30 px-2.5 py-0.5 text-xs text-accent">
                  {t(PERMISSION_PRESET_LABELS[presetFor(member)])}
                </span>
              )}
              {member.id === currentUserId && (
                <span className="rounded-full border border-border-strong px-2.5 py-0.5 text-xs text-text-secondary">
                  {t("settings.youBadge")}
                </span>
              )}
              {(isAdmin || member.id === currentUserId) && (
                <button
                  onClick={() => setEditingId(member.id)}
                  className="text-xs text-text-secondary underline-offset-2 hover:text-accent hover:underline"
                >
                  {t("common.edit")}
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
