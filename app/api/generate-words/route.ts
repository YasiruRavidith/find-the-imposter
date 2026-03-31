import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { pickRandomPair } from "@/lib/game";

type PairPayload = {
  common: string;
  imposter: string;
};

function parsePair(rawText: string | undefined): PairPayload | null {
  if (!rawText) {
    return null;
  }

  const lines = rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    const [left, right] = line.split(/[,-]/).map((item) => item.trim());
    if (!left || !right) {
      continue;
    }
    if (left.toLowerCase() === right.toLowerCase()) {
      continue;
    }

    return {
      common: left,
      imposter: right,
    };
  }

  return null;
}

export async function POST() {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    const [common, imposter] = pickRandomPair();
    return NextResponse.json({ common, imposter, source: "fallback" });
  }

  try {
    const ai = new GoogleGenAI({ apiKey });

    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents:
        "Generate one pair of closely related but different words for an imposter party game. Output exactly one line as: CommonWord, ImposterWord",
      config: {
        temperature: 1,
      },
    });

    const parsed = parsePair(response.text);
    if (!parsed) {
      const [common, imposter] = pickRandomPair();
      return NextResponse.json({ common, imposter, source: "fallback" });
    }

    return NextResponse.json({ ...parsed, source: "gemini" });
  } catch {
    const [common, imposter] = pickRandomPair();
    return NextResponse.json({ common, imposter, source: "fallback" });
  }
}
