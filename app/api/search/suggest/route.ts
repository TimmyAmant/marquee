import { NextResponse } from "next/server";
import { getSearchSuggestions, type SearchSuggestion } from "@/lib/search/suggest";

export type { SearchSuggestion };

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const results = await getSearchSuggestions(searchParams.get("q"));
  return NextResponse.json({ results });
}
