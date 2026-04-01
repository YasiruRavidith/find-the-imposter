import { NextRequest, NextResponse } from "next/server";
import { pickClueForWord, type Difficulty } from "@/lib/word-library";

type BotTurnBody = {
  secretWord?: string;
  difficulty?: Difficulty;
  previousClues?: string[];
};

function sanitizeWord(value: string): string {
  return value.toLowerCase().replace(/[^a-z]/g, "").slice(0, 22);
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as BotTurnBody;
    const secretWord = body.secretWord?.trim();

    if (!secretWord) {
      return NextResponse.json({ error: "Missing secretWord" }, { status: 400 });
    }

    const clue = pickClueForWord(secretWord, {
      difficulty: body.difficulty ?? "medium",
      recentClues: body.previousClues,
    });

    return NextResponse.json({
      clue: sanitizeWord(clue),
      source: "library",
    });
  } catch {
    return NextResponse.json({ error: "Bot clue generation failed." }, { status: 502 });
  }
}
