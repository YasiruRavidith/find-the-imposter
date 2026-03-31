import type { RoomPlayer } from "@/lib/types";

export const TURN_SECONDS = 20;
export const TURN_MS = TURN_SECONDS * 1000;

const ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export const AVATARS = [
  "Agent Fox",
  "Detective Owl",
  "Neon Cat",
  "Captain Byte",
  "Rogue Comet",
  "Pixel Ninja",
  "Radar Wolf",
  "Echo Sparrow",
];

export const COUNTRIES = [
  "US",
  "UK",
  "CA",
  "IN",
  "DE",
  "FR",
  "BR",
  "JP",
  "NG",
  "AU",
];

export const FALLBACK_WORD_PAIRS: Array<[string, string]> = [
  ["Apple", "Pear"],
  ["Coffee", "Tea"],
  ["Ocean", "River"],
  ["Piano", "Guitar"],
  ["Winter", "Autumn"],
  ["Rocket", "Airplane"],
  ["Lion", "Tiger"],
  ["Mountain", "Hill"],
  ["Chocolate", "Vanilla"],
  ["Forest", "Jungle"],
];

export function generateRoomCode(length = 6): string {
  let code = "";
  for (let i = 0; i < length; i += 1) {
    const randomIndex = Math.floor(Math.random() * ROOM_ALPHABET.length);
    code += ROOM_ALPHABET[randomIndex];
  }
  return code;
}

export function normalizeRoomCode(input: string): string {
  return input.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
}

export function pickRandomPair(): [string, string] {
  return FALLBACK_WORD_PAIRS[Math.floor(Math.random() * FALLBACK_WORD_PAIRS.length)];
}

export function sortPlayers(players: Record<string, RoomPlayer> | undefined): RoomPlayer[] {
  if (!players) {
    return [];
  }

  return Object.values(players).sort((a, b) => {
    if (a.joinedAt === b.joinedAt) {
      return a.displayName.localeCompare(b.displayName);
    }
    return a.joinedAt - b.joinedAt;
  });
}
