import { Fragment, type ReactNode } from "react";

/**
 * A translated sentence with markup in it: the message marks the parts
 * with tags, and each tag says what those parts become —
 *
 *   "requests.addedBy": "Added by <who>{name}</who> on <link>Plex</link>"
 *   rich(t("requests.addedBy", { name }), {
 *     who: (chunks) => <strong>{chunks}</strong>,
 *     link: (chunks) => <a href={url}>{chunks}</a>,
 *   })
 *
 * so a translation can move the link or the bold part to wherever its
 * grammar puts it. Tags don't nest; a tag with no renderer shows its text
 * plainly. Works in Server and Client Components alike.
 */
export type RichTags = Record<string, (chunks: ReactNode) => ReactNode>;

export function rich(message: string, tags: RichTags): ReactNode {
  const parts: ReactNode[] = [];
  const pattern = /<([a-zA-Z][\w-]*)>([\s\S]*?)<\/\1>/g;
  let last = 0;
  let index = 0;
  for (const match of message.matchAll(pattern)) {
    const start = match.index ?? 0;
    if (start > last) parts.push(message.slice(last, start));
    const render = tags[match[1]];
    parts.push(<Fragment key={index++}>{render ? render(match[2]) : match[2]}</Fragment>);
    last = start + match[0].length;
  }
  if (last < message.length) parts.push(message.slice(last));
  return parts.length === 1 ? parts[0] : parts;
}

/** The same message with its tags taken out, for a plain-text place (an
 * aria-label, a title attribute). */
export function plain(message: string): string {
  return message.replace(/<\/?[a-zA-Z][\w-]*>/g, "");
}
