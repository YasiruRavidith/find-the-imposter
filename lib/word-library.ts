export type Difficulty = "easy" | "medium" | "hard";

export type WordPair = {
  common: string;
  imposter: string;
};

export const WORD_PAIR_LIBRARY: WordPair[] = [
  { common: "apple", imposter: "pear" },
  { common: "coffee", imposter: "tea" },
  { common: "ocean", imposter: "river" },
  { common: "piano", imposter: "guitar" },
  { common: "winter", imposter: "autumn" },
  { common: "lion", imposter: "tiger" },
  { common: "mountain", imposter: "hill" },
  { common: "chocolate", imposter: "vanilla" },
  { common: "forest", imposter: "jungle" },
  { common: "rocket", imposter: "airplane" },
  { common: "doctor", imposter: "nurse" },
  { common: "camera", imposter: "telescope" },
  { common: "football", imposter: "basketball" },
  { common: "pizza", imposter: "burger" },
  { common: "phone", imposter: "laptop" },
  { common: "city", imposter: "town" },
  { common: "train", imposter: "bus" },
  { common: "beach", imposter: "desert" },
  { common: "moon", imposter: "star" },
  { common: "rain", imposter: "snow" },
  { common: "book", imposter: "magazine" },
  { common: "king", imposter: "queen" },
  { common: "cat", imposter: "dog" },
  { common: "fire", imposter: "smoke" },
  { common: "cake", imposter: "cookie" },
  { common: "pen", imposter: "pencil" },
  { common: "movie", imposter: "series" },
  { common: "car", imposter: "bike" },
  { common: "shirt", imposter: "jacket" },
  { common: "school", imposter: "college" },
  { common: "wallet", imposter: "purse" },
  { common: "bridge", imposter: "tunnel" },
  { common: "keyboard", imposter: "mouse" },
  { common: "singer", imposter: "rapper" },
  { common: "castle", imposter: "palace" },
  { common: "garden", imposter: "farm" },
  { common: "chef", imposter: "baker" },
  { common: "helmet", imposter: "cap" },
  { common: "island", imposter: "peninsula" },
  { common: "thunder", imposter: "lightning" },
];

export const CLUE_LIBRARY: Record<string, string[]> = {
  apple: ["orchard", "cider", "pie", "crisp", "fruit", "snack", "red", "teacher", "lowkey", "fresh"],
  pear: ["orchard", "juicy", "fruit", "green", "sweet", "soft", "snack", "shape", "chill", "fresh"],

  coffee: ["cafe", "morning", "mug", "brew", "beans", "energy", "latte", "bitter", "grind", "wakeup"],
  tea: ["kettle", "herbal", "mug", "steep", "calm", "leaf", "sip", "warm", "zen", "cozy"],

  ocean: ["waves", "salt", "deep", "beach", "blue", "tide", "marine", "vast", "chill", "shore"],
  river: ["flow", "fresh", "stream", "bridge", "banks", "current", "water", "nature", "path", "rush"],

  piano: ["keys", "melody", "chords", "classical", "bench", "pedal", "concert", "practice", "vibes", "tempo"],
  guitar: ["strings", "strum", "chords", "band", "solo", "amp", "pick", "acoustic", "jam", "riff"],

  winter: ["cold", "jacket", "frost", "night", "ice", "season", "cozy", "fireplace", "snowy", "chill"],
  autumn: ["leaves", "orange", "breeze", "cozy", "season", "harvest", "pumpkin", "sweater", "golden", "crisp"],

  lion: ["roar", "mane", "safari", "king", "wild", "pride", "claws", "feline", "alpha", "beast"],
  tiger: ["stripes", "roar", "jungle", "wild", "claws", "feline", "orange", "stealth", "predator", "beast"],

  mountain: ["peak", "hike", "summit", "trail", "altitude", "climb", "cold", "rocks", "view", "epic"],
  hill: ["slope", "grass", "small", "climb", "view", "rolling", "breeze", "park", "uphill", "easy"],

  chocolate: ["sweet", "cocoa", "dessert", "bar", "melt", "treat", "brown", "snack", "craving", "delish"],
  vanilla: ["cream", "sweet", "dessert", "icecream", "flavor", "soft", "basic", "classic", "smooth", "chill"],

  forest: ["trees", "green", "trail", "nature", "wild", "woods", "camp", "shade", "fresh", "quiet"],
  jungle: ["humid", "wild", "vines", "dense", "tropical", "canopy", "rain", "beast", "adventure", "untamed"],

  rocket: ["launch", "space", "fuel", "orbit", "booster", "engine", "fast", "blastoff", "zero", "cosmic"],
  airplane: ["flight", "airport", "wings", "pilot", "travel", "clouds", "takeoff", "landing", "route", "sky"],

  doctor: ["clinic", "patient", "diagnose", "medicine", "stethoscope", "health", "treatment", "checkup", "care", "urgent"],
  nurse: ["ward", "patient", "care", "hospital", "shift", "assist", "health", "kind", "support", "scrubs"],

  camera: ["photo", "lens", "focus", "flash", "capture", "frame", "memory", "zoom", "snap", "aesthetic"],
  telescope: ["stars", "lens", "night", "space", "zoom", "observe", "orbit", "sky", "cosmic", "focus"],

  football: ["goal", "stadium", "team", "kick", "match", "field", "fans", "league", "captain", "hype"],
  basketball: ["hoop", "court", "dribble", "team", "dunk", "match", "fans", "bounce", "swish", "hype"],

  pizza: ["slice", "cheese", "oven", "crust", "delivery", "party", "snack", "toppings", "late", "greasy"],
  burger: ["bun", "patty", "fries", "grill", "fastfood", "cheese", "stack", "sauce", "bite", "juicy"],

  phone: ["call", "screen", "apps", "battery", "selfie", "pocket", "ring", "scroll", "chat", "ping"],
  laptop: ["keyboard", "screen", "work", "charge", "coding", "desk", "browser", "tabs", "study", "grind"],

  city: ["traffic", "buildings", "busy", "lights", "downtown", "metro", "crowd", "fast", "hustle", "noise"],
  town: ["quiet", "local", "small", "streets", "community", "cozy", "slow", "familiar", "simple", "chill"],

  train: ["tracks", "station", "rail", "commute", "platform", "engine", "wagon", "schedule", "travel", "rush"],
  bus: ["stop", "route", "commute", "seats", "ticket", "driver", "city", "public", "crowd", "late"],

  beach: ["sand", "sun", "waves", "umbrella", "vacation", "shore", "tan", "summer", "chill", "coast"],
  desert: ["sand", "hot", "dry", "dunes", "cactus", "sun", "vast", "thirst", "mirage", "blazing"],

  moon: ["night", "orbit", "glow", "sky", "crater", "lunar", "phase", "silver", "calm", "dreamy"],
  star: ["night", "sky", "sparkle", "space", "constellation", "bright", "glow", "cosmic", "shine", "famous"],

  rain: ["cloud", "drops", "umbrella", "wet", "storm", "drizzle", "puddle", "forecast", "gloom", "cozy"],
  snow: ["cold", "flakes", "winter", "white", "frost", "blizzard", "boots", "ice", "chill", "powder"],

  book: ["pages", "story", "read", "library", "chapter", "author", "cover", "plot", "quiet", "classic"],
  magazine: ["glossy", "issue", "cover", "articles", "fashion", "weekly", "pages", "trend", "celeb", "read"],

  king: ["crown", "throne", "royal", "rule", "palace", "kingdom", "power", "scepter", "boss", "elite"],
  queen: ["crown", "throne", "royal", "rule", "palace", "kingdom", "grace", "power", "icon", "slay"],

  cat: ["whiskers", "purr", "feline", "nap", "claws", "meow", "lazy", "sneaky", "vibes", "cute"],
  dog: ["bark", "puppy", "loyal", "walk", "tail", "playful", "fetch", "pet", "hype", "cute"],

  fire: ["heat", "flame", "burn", "spark", "smoke", "camp", "danger", "red", "blaze", "hot"],
  smoke: ["air", "ash", "haze", "burn", "gray", "signal", "foggy", "cloud", "drift", "faint"],

  cake: ["slice", "sweet", "frosting", "birthday", "dessert", "bake", "party", "layers", "treat", "yum"],
  cookie: ["crunch", "sweet", "chips", "snack", "bake", "jar", "treat", "crumbs", "milk", "yum"],

  pen: ["ink", "write", "paper", "notes", "scribble", "journal", "tip", "signature", "study", "doodle"],
  pencil: ["lead", "erase", "write", "paper", "sketch", "notes", "school", "tip", "draft", "doodle"],

  movie: ["cinema", "screen", "scene", "director", "ticket", "runtime", "trailer", "plot", "popcorn", "binge"],
  series: ["episodes", "season", "stream", "cliffhanger", "binge", "show", "plot", "weekend", "next", "hype"],

  car: ["drive", "wheels", "road", "engine", "fuel", "garage", "speed", "trip", "keys", "ride"],
  bike: ["pedal", "helmet", "ride", "wheels", "road", "balance", "lane", "chain", "speed", "cruise"],

  shirt: ["cotton", "sleeves", "wear", "fit", "outfit", "casual", "buttons", "closet", "drip", "daily"],
  jacket: ["zip", "warm", "layer", "outerwear", "winter", "pockets", "style", "fit", "drip", "cozy"],

  school: ["class", "teacher", "homework", "bell", "students", "exam", "campus", "uniform", "study", "rush"],
  college: ["campus", "lecture", "degree", "semester", "dorm", "credits", "major", "students", "study", "grind"],

  wallet: ["cash", "cards", "pocket", "leather", "money", "id", "carry", "fold", "daily", "essentials"],
  purse: ["bag", "strap", "carry", "style", "zip", "cards", "daily", "accessory", "fit", "essentials"],

  bridge: ["cross", "river", "steel", "arch", "connect", "traffic", "span", "support", "link", "path"],
  tunnel: ["underground", "dark", "passage", "road", "echo", "lights", "connect", "route", "drill", "path"],

  keyboard: ["keys", "typing", "desk", "input", "shortcut", "letters", "spacebar", "coding", "clack", "work"],
  mouse: ["click", "cursor", "scroll", "desk", "pointer", "wireless", "drag", "tap", "work", "quick"],

  singer: ["vocals", "stage", "mic", "album", "melody", "chorus", "fans", "concert", "voice", "idol"],
  rapper: ["bars", "flow", "beat", "mic", "stage", "album", "verse", "hype", "rhymes", "fire"],

  castle: ["stone", "tower", "moat", "royal", "fortress", "old", "guards", "kingdom", "epic", "medieval"],
  palace: ["royal", "gold", "luxury", "throne", "kingdom", "grand", "rooms", "elegant", "elite", "majestic"],

  garden: ["flowers", "plants", "soil", "water", "green", "yard", "grow", "calm", "nature", "bloom"],
  farm: ["crops", "barn", "tractor", "fields", "harvest", "animals", "soil", "rural", "grow", "fresh"],

  chef: ["kitchen", "recipe", "cook", "flavor", "knife", "plate", "restaurant", "heat", "taste", "pro"],
  baker: ["oven", "dough", "bread", "cake", "sweet", "recipe", "flour", "rise", "warm", "pro"],

  helmet: ["safety", "head", "ride", "protection", "strap", "gear", "sport", "hard", "secure", "guard"],
  cap: ["hat", "head", "casual", "visor", "style", "wear", "outfit", "shade", "fit", "daily"],

  island: ["water", "coast", "alone", "shore", "palm", "escape", "travel", "tropical", "remote", "chill"],
  peninsula: ["coast", "land", "water", "attached", "shore", "map", "region", "edge", "geography", "coastline"],

  thunder: ["storm", "boom", "cloud", "loud", "sky", "rain", "flash", "rumble", "scary", "energy"],
  lightning: ["flash", "storm", "sky", "electric", "bright", "bolt", "cloud", "strike", "energy", "fast"],
};

const DEFAULT_CLUES = ["signal", "object", "motion", "detail", "vibe", "focus", "route", "shape", "color", "energy"];

function normalizeWord(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z]/g, "");
}

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

export function pickRandomWordPair(): WordPair {
  const index = Math.floor(Math.random() * WORD_PAIR_LIBRARY.length);
  return WORD_PAIR_LIBRARY[index];
}

export function getClueCandidates(word: string): string[] {
  const key = normalizeWord(word);
  const direct = CLUE_LIBRARY[key] ?? [];
  return unique([...direct, ...DEFAULT_CLUES]).map((item) => normalizeWord(item)).filter((item) => item.length >= 3);
}

export function pickClueForWord(
  word: string,
  options?: {
    difficulty?: Difficulty;
    recentClues?: string[];
  },
): string {
  const key = normalizeWord(word);
  const difficulty = options?.difficulty ?? "medium";
  const recent = (options?.recentClues ?? []).map((item) => normalizeWord(item));

  const all = getClueCandidates(key).filter((item) => item !== key && !recent.includes(item));
  if (all.length === 0) {
    return DEFAULT_CLUES[Math.floor(Math.random() * DEFAULT_CLUES.length)];
  }

  const third = Math.max(1, Math.floor(all.length / 3));
  let pool = all;

  if (difficulty === "easy") {
    pool = all.slice(0, third + 2);
  } else if (difficulty === "hard") {
    pool = all.slice(third);
  }

  return pool[Math.floor(Math.random() * pool.length)] ?? all[0];
}

export function hasWordInLibrary(word: string): boolean {
  return Object.prototype.hasOwnProperty.call(CLUE_LIBRARY, normalizeWord(word));
}
