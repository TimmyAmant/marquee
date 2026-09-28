"use client";

import { useEffect, useRef } from "react";
import { showToast } from "@/components/toast";

/**
 * Settings' saved / failed toasts: shows one each time a form's action
 * answers (a new state object from useActionState). `success` gets the
 * saved text; `error` is shown as it is. The form keeps its own inline
 * message too, next to the field it's about.
 */
export function useResultToast(
  state: { success?: boolean; error?: string | null } | null | undefined,
  savedText: string,
) {
  const shown = useRef<unknown>(null);
  useEffect(() => {
    if (!state || shown.current === state) return;
    shown.current = state;
    if (state.error) showToast(state.error, "error");
    else if (state.success) showToast(savedText);
  }, [state, savedText]);
}
