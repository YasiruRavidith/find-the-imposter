import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

type VoteCandidate = {
  uid: string;
  displayName: string;
};

type BotVoteBody = {
  botUid?: string;
  candidates?: VoteCandidate[];
  clueLog?: Array<{ uid: string; clue: string }>;
  difficulty?: "easy" | "medium" | "hard";
};

function randomVote(candidates: VoteCandidate[], botUid?: string): string {
  const options = candidates.filter((candidate) => candidate.uid !== botUid);
  if (options.length === 0) {
    return candidates[0]?.uid ?? "";
  }
  return options[Math.floor(Math.random() * options.length)].uid;
}

function pickSuspiciousUid(candidates: VoteCandidate[], clueLog: Array<{ uid: string; clue: string }>, botUid?: string): string {
  const validUids = new Set(candidates.map((candidate) => candidate.uid));
  const scores: Record<string, number> = {};

  for (const candidate of candidates) {
    if (candidate.uid !== botUid) {
      scores[candidate.uid] = 0;
    }
  }

  const clueFrequency: Record<string, number> = {};
  for (const entry of clueLog) {
    const clue = entry.clue.toLowerCase().replace(/[^a-z]/g, "").slice(0, 22);
    if (!clue) {
      continue;
    }
    clueFrequency[clue] = (clueFrequency[clue] ?? 0) + 1;
  }

  for (const entry of clueLog) {
    if (!validUids.has(entry.uid) || entry.uid === botUid || scores[entry.uid] === undefined) {
      continue;
    }

    const clue = entry.clue.toLowerCase().replace(/[^a-z]/g, "").slice(0, 22);
    if (!clue) {
      continue;
    }

    const frequency = clueFrequency[clue] ?? 1;
    const rarityBonus = frequency === 1 ? 2 : 0;
    const lengthBonus = clue.length <= 4 ? 1 : 0;
    scores[entry.uid] += rarityBonus + lengthBonus;
  }

  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const bestScore = ranked[0]?.[1];
  if (bestScore === undefined) {
    return randomVote(candidates, botUid);
  }

  const tiedTop = ranked.filter(([, score]) => score === bestScore).map(([uid]) => uid);
  if (tiedTop.length === 0) {
    return randomVote(candidates, botUid);
  }

  return tiedTop[Math.floor(Math.random() * tiedTop.length)] ?? randomVote(candidates, botUid);
}

async function analyzeWithGemini(
  candidates: VoteCandidate[],
  clueLog: Array<{ uid: string; clue: string }>,
  botUid?: string
): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return null;
  }

  try {
    const client = new GoogleGenerativeAI(apiKey);
    const model = client.getGenerativeModel({ model: "gemini-3-flash-preview" });

    const candidateNames = candidates
      .filter((c) => c.uid !== botUid)
      .map((c) => `${c.displayName} (${c.uid})`)
      .join(", ");

    const clueText = clueLog.map((entry) => `${entry.uid}: "${entry.clue}"`).join("\n");

    const prompt = `You are analyzing clues to find who is the imposter in a word guessing game.

Candidates: ${candidateNames}

Clues submitted:
${clueText}

Based on these clues, which player seems most likely to be the imposter? 
The imposter has a slightly different word, so their clues might be slightly off or inconsistent.

Respond with ONLY the uid of the most suspicious player (e.g., "user123"). No explanation needed.`;

    const response = await model.generateContent(prompt);
    const text = response.response.text().trim();
    
    // Extract the uid from response (should be the first uid-like match)
    const validUids = new Set(candidates.map((c) => c.uid));
    
    // Try exact match first
    if (validUids.has(text)) {
      return text;
    }
    
    // Try finding any valid uid in the response
    for (const uid of validUids) {
      if (text.includes(uid)) {
        return uid;
      }
    }

    return null;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as BotVoteBody;
    const candidates = body.candidates ?? [];

    if (candidates.length < 2) {
      return NextResponse.json({ error: "Not enough candidates" }, { status: 400 });
    }

    const fallbackUid = randomVote(candidates, body.botUid);
    if (body.difficulty === "easy") {
      return NextResponse.json({ targetUid: fallbackUid, source: "library-random" });
    }

    const clueLog = body.clueLog ?? [];

    // Try Gemini analysis for medium/hard difficulty
    if (body.difficulty === "medium" || body.difficulty === "hard") {
      const geminiChoice = await analyzeWithGemini(candidates, clueLog, body.botUid);
      if (geminiChoice) {
        return NextResponse.json({
          targetUid: geminiChoice,
          source: "gemini-analysis",
        });
      }
    }

    // Fallback to local heuristic
    const suspiciousUid = pickSuspiciousUid(candidates, clueLog, body.botUid);

    return NextResponse.json({
      targetUid: suspiciousUid || fallbackUid,
      source: "library-heuristic",
    });
  } catch {
    return NextResponse.json({ targetUid: "", source: "library-random" }, { status: 200 });
  }
}
