import { withApi } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/api/auth";
import { unwrap } from "@/lib/api/guards";
import { parseUuidSegment, readJsonBody } from "@/lib/api/request";
import { addComment, deleteComment, editComment, listComments, type CommentTarget } from "@/lib/comments";
import type { CommentThread, Ok } from "@/lib/api/types";

// /requests/{id}/comments and /issues/{id}/comments (and /{commentId}):
// the same handlers for both. Who may see and write is decided in
// lib/comments — a thread the caller isn't part of is a 404.

const NOT_FOUND: Record<CommentTarget["kind"], string> = {
  request: "Request not found.",
  issue: "Report not found.",
};

export function threadRoutes(kind: CommentTarget["kind"]) {
  return {
    GET: withApi<{ id: string }>(async (request, params): Promise<CommentThread> => {
      const ctx = await requireApiUser(request);
      const id = parseUuidSegment(params.id, NOT_FOUND[kind]);
      return unwrap(await listComments({ userId: ctx.user.id, role: ctx.user.role }, { kind, id })).thread;
    }),
    POST: withApi<{ id: string }>(async (request, params): Promise<Ok & { commentId: string }> => {
      const ctx = await requireApiUser(request);
      const id = parseUuidSegment(params.id, NOT_FOUND[kind]);
      const body = await readJsonBody(request);
      const { commentId } = unwrap(await addComment({ userId: ctx.user.id, role: ctx.user.role }, { kind, id }, body.body));
      return { ok: true, commentId };
    }),
  };
}

export function commentRoutes(kind: CommentTarget["kind"]) {
  return {
    PATCH: withApi<{ id: string; commentId: string }>(async (request, params): Promise<Ok> => {
      const ctx = await requireApiUser(request);
      const id = parseUuidSegment(params.id, NOT_FOUND[kind]);
      const commentId = parseUuidSegment(params.commentId, "Comment not found.");
      const body = await readJsonBody(request);
      unwrap(await editComment({ userId: ctx.user.id, role: ctx.user.role }, { kind, id }, commentId, body.body));
      return { ok: true };
    }),
    DELETE: withApi<{ id: string; commentId: string }>(async (request, params): Promise<Ok> => {
      const ctx = await requireApiUser(request);
      const id = parseUuidSegment(params.id, NOT_FOUND[kind]);
      const commentId = parseUuidSegment(params.commentId, "Comment not found.");
      unwrap(await deleteComment({ userId: ctx.user.id, role: ctx.user.role }, { kind, id }, commentId));
      return { ok: true };
    }),
  };
}
