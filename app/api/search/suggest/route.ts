import { NextResponse } from "next/server";
import { getViewerContext } from "@/lib/integrations/library-owner";
import { getSearchSuggestions, type SearchSuggestion } from "@/lib/search/suggest";

export type { SearchSuggestion };

export async function GET(request: Request) {
  // The proxy already redirects anonymous visitors, but this route spends
  // TMDb quota, so it checks the session itself as well.
  const viewer = await getViewerContext();
  if (!viewer.session) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const results = await getSearchSuggestions(searchParams.get("q"), viewer.libraryOwnerId);
  return NextResponse.json({ results });
}
