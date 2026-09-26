"use client";

import { createContext, useCallback, useContext, useEffect, useState, useTransition, type ReactNode } from "react";
import {
  addCommentAction,
  deleteCommentAction,
  editCommentAction,
  loadCommentsAction,
} from "@/lib/comments/actions";
import { UserAvatar } from "@/components/user-avatar";
import type { Comment, CommentThread } from "@/lib/api/types";

// The conversation on a request or problem report (lib/comments): the
// requester or reporter and the reviewers. Collapsed to a "Comments (2)"
// button until opened; the thread loads then. Plain text only — React
// escapes it, and line breaks are kept.

type Kind = "request" | "issue";

const NOTE_LABEL: Partial<Record<Comment["kind"], string>> = {
  report: "Reported",
  resolution: "Marked fixed",
  declined: "Declined",
};

const ROLE_LABEL: Record<NonNullable<Comment["author"]["role"]>, string | null> = {
  admin: "Admin",
  reviewer: "Reviewer",
  member: null,
};

function when(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function CommentItem({
  comment,
  kind,
  parentId,
  onChanged,
}: {
  comment: Comment;
  kind: Kind;
  parentId: string;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.body);
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();
  const note = NOTE_LABEL[comment.kind];
  const role = comment.author.role ? ROLE_LABEL[comment.author.role] : null;

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await editCommentAction(kind, parentId, comment.id, draft);
      if (result.error) setError(result.error);
      else {
        setEditing(false);
        onChanged();
      }
    });
  }

  function remove() {
    setError(null);
    startTransition(async () => {
      const result = await deleteCommentAction(kind, parentId, comment.id);
      if (result.error) setError(result.error);
      else onChanged();
    });
  }

  return (
    <li className="flex gap-2.5">
      <span className="mt-0.5">
        <UserAvatar label={comment.author.label} src={comment.author.avatarUrl} size={28} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-baseline gap-x-1.5 text-xs text-text-muted">
          <span className="font-medium text-text-primary">{comment.author.label}</span>
          {role && <span>{role}</span>}
          {note && <span>· {note}</span>}
          <span>· {when(comment.createdAt)}</span>
          {comment.editedAt && <span>· edited</span>}
        </p>
        {editing ? (
          <div className="mt-1 flex flex-col gap-1.5">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={2000}
              rows={3}
              className="w-full resize-y rounded-lg border border-border bg-bg-0 px-2.5 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={save}
                disabled={busy || draft.trim().length === 0}
                className="rounded-full bg-accent px-3 py-1 text-xs font-medium text-bg-0 hover:bg-accent-hover disabled:opacity-60"
              >
                {busy ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setDraft(comment.body);
                }}
                className="rounded-full border border-border-strong px-3 py-1 text-xs text-text-primary hover:border-accent hover:text-accent"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-text-secondary">{comment.body}</p>
        )}
        {!editing && (comment.canEdit || comment.canDelete) && (
          <div className="mt-0.5 flex gap-3 text-xs">
            {comment.canEdit && (
              <button type="button" onClick={() => setEditing(true)} className="text-text-muted hover:text-accent">
                Edit
              </button>
            )}
            {comment.canDelete && (
              <button type="button" onClick={remove} disabled={busy} className="text-text-muted hover:text-red-400 disabled:opacity-60">
                Delete
              </button>
            )}
          </div>
        )}
        {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
      </div>
    </li>
  );
}

/** The thread itself: the messages, oldest first, and a box to add one. */
export function CommentPanel({
  kind,
  id,
  onCountChange,
}: {
  kind: Kind;
  id: string;
  onCountChange?: (count: number) => void;
}) {
  const [thread, setThread] = useState<CommentThread | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, startTransition] = useTransition();

  const load = useCallback(async () => {
    const result = await loadCommentsAction(kind, id);
    if (result.thread) {
      setThread(result.thread);
      setLoadError(null);
      onCountChange?.(result.thread.results.filter((c) => c.kind === "comment").length);
    } else setLoadError(result.error ?? "Couldn't load the conversation.");
  }, [kind, id, onCountChange]);

  useEffect(() => {
    // Loaded when opened; nothing to do with the render itself.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  function send() {
    setError(null);
    startTransition(async () => {
      const result = await addCommentAction(kind, id, draft);
      if (result.error) setError(result.error);
      else {
        setDraft("");
        await load();
      }
    });
  }

  return (
    <div className="rounded-xl border border-border bg-bg-1/60 p-3">
      {loadError && <p className="text-xs text-red-400">{loadError}</p>}
      {!thread && !loadError && <p className="text-xs text-text-muted">Loading…</p>}
      {thread && (
        <>
          {thread.results.length === 0 ? (
            <p className="text-xs text-text-muted">No comments yet.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {thread.results.map((comment) => (
                <CommentItem key={comment.id} comment={comment} kind={kind} parentId={id} onChanged={() => void load()} />
              ))}
            </ul>
          )}
          {thread.canComment && (
            <div className="mt-3 flex flex-col gap-1.5">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                maxLength={thread.maxLength}
                rows={2}
                placeholder="Write a comment"
                aria-label="Write a comment"
                className="w-full resize-y rounded-lg border border-border bg-bg-0 px-2.5 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
              />
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-text-muted">
                  {draft.length > thread.maxLength - 200 ? `${thread.maxLength - draft.length} left` : ""}
                </span>
                <button
                  type="button"
                  onClick={send}
                  disabled={sending || draft.trim().length === 0}
                  className="rounded-full bg-accent px-3 py-1 text-xs font-medium text-bg-0 hover:bg-accent-hover disabled:opacity-60"
                >
                  {sending ? "Sending…" : "Send"}
                </button>
              </div>
              {error && <p className="text-xs text-red-400">{error}</p>}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function toggleLabel(count: number, open: boolean): string {
  if (open) return "Hide comments";
  return count === 0 ? "Comment" : `Comments (${count})`;
}

const toggleClass = "text-xs text-text-secondary hover:text-accent";

/** A "Comments (2)" button with the thread under it, for lists that aren't tables. */
export function CommentSection({ kind, id, count }: { kind: Kind; id: string; count: number }) {
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState(count);
  return (
    <div className="mt-1.5">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className={toggleClass}>
        {toggleLabel(shown, open)}
      </button>
      {open && (
        <div className="mt-2">
          <CommentPanel kind={kind} id={id} onCountChange={setShown} />
        </div>
      )}
    </div>
  );
}

type RowThread = { open: boolean; toggle: () => void; count: number };
const RowThreadContext = createContext<RowThread | null>(null);

/** A table row whose conversation opens in a full-width row under it. Put a
 * <CommentToggle /> in one of its cells. */
export function ThreadRow({
  kind,
  id,
  count,
  colSpan,
  className,
  children,
}: {
  kind: Kind;
  id: string;
  count: number;
  colSpan: number;
  className?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState(count);
  return (
    <RowThreadContext.Provider value={{ open, toggle: () => setOpen((v) => !v), count: shown }}>
      <tr className={className}>{children}</tr>
      {open && (
        <tr>
          <td colSpan={colSpan} className="px-4 pb-4">
            <CommentPanel kind={kind} id={id} onCountChange={setShown} />
          </td>
        </tr>
      )}
    </RowThreadContext.Provider>
  );
}

export function CommentToggle() {
  const row = useContext(RowThreadContext);
  if (!row) return null;
  return (
    <button type="button" onClick={row.toggle} aria-expanded={row.open} className={`mt-1 block ${toggleClass}`}>
      {toggleLabel(row.count, row.open)}
    </button>
  );
}
