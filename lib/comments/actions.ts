"use server";

import { auth } from "@/auth";
import { addComment, deleteComment, editComment, listComments, type CommentTarget } from "@/lib/comments";
import type { CommentThread } from "@/lib/api/types";

// The website's side of comment threads — thin session wrappers around
// lib/comments, which /api/v1/{requests,issues}/{id}/comments shares. The
// target comes from the browser, so it's checked here before use.

export type CommentActionState = { error?: string; success?: boolean };

function target(kind: unknown, id: unknown): CommentTarget | null {
  if ((kind !== "request" && kind !== "issue") || typeof id !== "string") return null;
  return { kind, id };
}

async function viewer() {
  const session = await auth();
  return session?.user ? { userId: session.user.id, role: session.user.role } : null;
}

export async function loadCommentsAction(
  kind: CommentTarget["kind"],
  id: string,
): Promise<{ thread?: CommentThread; error?: string }> {
  const who = await viewer();
  if (!who) return { error: "Sign in first." };
  const t = target(kind, id);
  if (!t) return { error: "Not found." };
  const result = await listComments(who, t, "/api");
  return result.ok ? { thread: result.thread } : { error: result.error };
}

export async function addCommentAction(kind: CommentTarget["kind"], id: string, body: string): Promise<CommentActionState> {
  const who = await viewer();
  if (!who) return { error: "Sign in first." };
  const t = target(kind, id);
  if (!t) return { error: "Not found." };
  const result = await addComment(who, t, body);
  return result.ok ? { success: true } : { error: result.error };
}

export async function editCommentAction(
  kind: CommentTarget["kind"],
  id: string,
  commentId: string,
  body: string,
): Promise<CommentActionState> {
  const who = await viewer();
  if (!who) return { error: "Sign in first." };
  const t = target(kind, id);
  if (!t || typeof commentId !== "string") return { error: "Not found." };
  const result = await editComment(who, t, commentId, body);
  return result.ok ? { success: true } : { error: result.error };
}

export async function deleteCommentAction(
  kind: CommentTarget["kind"],
  id: string,
  commentId: string,
): Promise<CommentActionState> {
  const who = await viewer();
  if (!who) return { error: "Sign in first." };
  const t = target(kind, id);
  if (!t || typeof commentId !== "string") return { error: "Not found." };
  const result = await deleteComment(who, t, commentId);
  return result.ok ? { success: true } : { error: result.error };
}
