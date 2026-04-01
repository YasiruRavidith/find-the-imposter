import { NextResponse } from "next/server";
import { pickRandomWordPair } from "@/lib/word-library";

export async function POST() {
  const pair = pickRandomWordPair();

  return NextResponse.json({
    common: pair.common,
    imposter: pair.imposter,
    source: "library",
  });
}
