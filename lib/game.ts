import type { RoomPlayer } from "@/lib/types";
import { pickRandomWordPair, WORD_PAIR_LIBRARY } from "@/lib/word-library";

export const TURN_SECONDS = 20;
export const TURN_MS = TURN_SECONDS * 1000;

const ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export const AVATARS = [
  "cha1.png",
  "cha2.png",
  "cha3.png",
  "cha4.png",
  "cha5.png",
  "cha6.png",
  "cha7.png",
  "cha8.png",
  "cha9.png",
  "cha10.png",
  "cha11.png",
  "cha12.png",
  "cha13.png",
  "cha14.png",
  "cha15.png",
  "cha16.png",
  "cha17.png",
  "cha18.png",
  "cha19.png",
  "cha20.png",
  "cha21.png",
  "cha22.png",
];

const LEGACY_AVATAR_MAP: Record<string, string> = {
  "Agent Fox": "cha1.png",
  "Detective Owl": "cha2.png",
  "Neon Cat": "cha3.png",
  "Captain Byte": "cha4.png",
  "Rogue Comet": "cha5.png",
  "Pixel Ninja": "cha6.png",
  "Radar Wolf": "cha7.png",
  "Echo Sparrow": "cha8.png",
};

export function resolveAvatarFile(value: string | undefined): string {
  if (!value) {
    return AVATARS[0];
  }

  if (AVATARS.includes(value)) {
    return value;
  }

  return LEGACY_AVATAR_MAP[value] ?? AVATARS[0];
}

export function avatarImagePath(value: string | undefined): string {
  return `/avatar/${resolveAvatarFile(value)}`;
}

export const COUNTRIES = [
  "🌐 Global Account",
  "🇺🇸 United States",
  "🇬🇧 United Kingdom",
  "🇨🇦 Canada",
  "🇮🇳 India",
  "🇩🇪 Germany",
  "🇫🇷 France",
  "🇧🇷 Brazil",
  "🇯🇵 Japan",
  "🇳🇬 Nigeria",
  "🇦🇺 Australia",
  "🇱🇰 Sri Lanka",
];

const LEGACY_COUNTRY_MAP: Record<string, string> = {
  GLOBAL: "🌐 Global Account",
  US: "🇺🇸 United States",
  USA: "🇺🇸 United States",
  UK: "🇬🇧 United Kingdom",
  GB: "🇬🇧 United Kingdom",
  CA: "🇨🇦 Canada",
  IN: "🇮🇳 India",
  DE: "🇩🇪 Germany",
  FR: "🇫🇷 France",
  BR: "🇧🇷 Brazil",
  JP: "🇯🇵 Japan",
  NG: "🇳🇬 Nigeria",
  AU: "🇦🇺 Australia",
  LK: "🇱🇰 Sri Lanka",
  "SRI LANKA": "🇱🇰 Sri Lanka",
};

export function resolveCountry(value: string | undefined): string {
  if (!value) {
    return COUNTRIES[0];
  }

  if (COUNTRIES.includes(value)) {
    return value;
  }

  const normalized = value.trim().toUpperCase();
  return LEGACY_COUNTRY_MAP[normalized] ?? COUNTRIES[0];
}

export const FALLBACK_WORD_PAIRS: Array<[string, string]> = WORD_PAIR_LIBRARY.map((pair) => [
  pair.common,
  pair.imposter,
]);

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
  const pair = pickRandomWordPair();
  return [pair.common, pair.imposter];
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
