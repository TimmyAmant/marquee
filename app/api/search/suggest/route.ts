import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getSearchSuggestions, type SearchSuggestion } from "@/lib/search/suggest";

export type { SearchSuggestion };

export async function GET(request: Request) {
  // The proxy already redirects anonymous visitors, but this route spends
  // TMDb quota, so it checks the session itself as well.
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const results = await getSearchSuggestions(searchParams.get("q"));
  return NextResponse.json({ results });
}
