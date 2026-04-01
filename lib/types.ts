export type RoomStatus = "lobby" | "playing" | "voting" | "result";

export type PlayerRole = "crew" | "imposter";

export type UserProfile = {
  uid: string;
  displayName: string;
  photoURL: string;
  country: string;
  avatar: string;
  score: number;
  createdAt: number;
};

export type RoomPlayer = {
  uid: string;
  displayName: string;
  country: string;
  avatar: string;
  photoURL: string;
  score: number;
  joinedAt: number;
  isHost: boolean;
  isBot?: boolean;
};

export type TurnSubmission = {
  uid: string;
  clue: string;
  autoSubmitted: boolean;
  submittedAt: number;
};

export type RoundResult = {
  mostVotedUid: string | null;
  imposterCaught: boolean;
  scoreDelta: Record<string, number>;
  scoreApplied?: boolean;
  completedAt: number;
};

export type RoomRound = {
  commonWord: string;
  imposterWord: string;
  imposterUid: string;
  secretWords: Record<string, string>;
  turnOrder: string[];
  activeTurnIndex: number;
  turnEndsAt: number;
  submissions: Record<string, TurnSubmission>;
  readyToVote: Record<string, true>;
  votes: Record<string, string>;
  result: RoundResult | null;
  startedAt: number;
};

export type Room = {
  roomId: string;
  hostUid: string;
  status: RoomStatus;
  mode?: "multiplayer" | "solo";
  difficulty?: "easy" | "medium" | "hard";
  createdAt: number;
  players: Record<string, RoomPlayer>;
  round: RoomRound | null;
};
