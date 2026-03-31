"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import {
  get,
  increment,
  onValue,
  ref,
  remove,
  runTransaction,
  set,
  update,
} from "firebase/database";
import { auth, db } from "@/lib/firebase";
import { TURN_MS, TURN_SECONDS, sortPlayers } from "@/lib/game";
import type { Room, RoomPlayer, RoomRound, TurnSubmission, UserProfile } from "@/lib/types";

function countVotes(votes: Record<string, string> | undefined): Record<string, number> {
  const tally: Record<string, number> = {};
  if (!votes) {
    return tally;
  }

  for (const targetUid of Object.values(votes)) {
    tally[targetUid] = (tally[targetUid] ?? 0) + 1;
  }
  return tally;
}

export default function RoomPage() {
  const params = useParams<{ roomId: string }>();
  const router = useRouter();
  const roomId = (params.roomId ?? "").toUpperCase();

  const [authUser, setAuthUser] = useState<User | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [clueInput, setClueInput] = useState("");
  const [now, setNow] = useState(Date.now());

  const autoSubmittingRef = useRef(false);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (nextUser) => {
      if (!nextUser) {
        router.replace("/");
        return;
      }
      setAuthUser(nextUser);
    });

    return () => unsubscribeAuth();
  }, [router]);

  useEffect(() => {
    if (!roomId) {
      return;
    }

    const roomRef = ref(db, `rooms/${roomId}`);
    const unsubscribeRoom = onValue(roomRef, (snapshot) => {
      if (!snapshot.exists()) {
        setRoom(null);
        setLoading(false);
        setError("Room does not exist anymore.");
        return;
      }

      setRoom(snapshot.val() as Room);
      setLoading(false);
    });

    return () => unsubscribeRoom();
  }, [roomId]);

  useEffect(() => {
    if (!authUser || !room) {
      return;
    }

    if (room.players?.[authUser.uid]) {
      return;
    }

    let cancelled = false;

    async function upsertPlayer() {
      const profileSnap = await get(ref(db, `users/${authUser.uid}`));
      if (!profileSnap.exists() || cancelled) {
        return;
      }

      const profile = profileSnap.val() as UserProfile;
      const player: RoomPlayer = {
        uid: profile.uid,
        displayName: profile.displayName,
        country: profile.country,
        avatar: profile.avatar,
        photoURL: profile.photoURL,
        score: profile.score ?? 0,
        joinedAt: Date.now(),
        isHost: false,
      };

      await set(ref(db, `rooms/${roomId}/players/${authUser.uid}`), player);
    }

    void upsertPlayer();

    return () => {
      cancelled = true;
    };
  }, [authUser, room, roomId]);

  const players = useMemo(() => sortPlayers(room?.players), [room?.players]);
  const playersByUid = useMemo(() => {
    const map = new Map<string, RoomPlayer>();
    for (const player of players) {
      map.set(player.uid, player);
    }
    return map;
  }, [players]);

  const isHost = !!authUser && room?.hostUid === authUser.uid;
  const activeTurnUid = room?.round?.turnOrder?.[room.round.activeTurnIndex ?? 0] ?? null;
  const mySecretWord = authUser?.uid ? room?.round?.secretWords?.[authUser.uid] ?? null : null;
  const myVote = authUser?.uid ? room?.round?.votes?.[authUser.uid] : undefined;
  const myReadyState = authUser?.uid ? room?.round?.readyToVote?.[authUser.uid] : undefined;

  const secondsLeft = useMemo(() => {
    if (room?.status !== "playing" || !room.round?.turnEndsAt) {
      return TURN_SECONDS;
    }
    return Math.max(0, Math.ceil((room.round.turnEndsAt - now) / 1000));
  }, [now, room]);

  const submissions = useMemo(() => {
    const value = room?.round?.submissions ?? {};
    return Object.values(value).sort((a, b) => a.submittedAt - b.submittedAt);
  }, [room?.round?.submissions]);

  const voteTally = useMemo(() => countVotes(room?.round?.votes), [room?.round?.votes]);

  useEffect(() => {
    if (room?.status !== "playing") {
      return;
    }

    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [room?.status]);

  const submitTurn = useCallback(
    async (autoSubmitted: boolean) => {
      if (!authUser || !roomId) {
        return;
      }

      const clue = autoSubmitted ? "Didn't answer" : clueInput.trim();
      if (!autoSubmitted && clue.length === 0) {
        return;
      }

      if (!autoSubmitted) {
        setClueInput("");
      }

      await runTransaction(ref(db, `rooms/${roomId}`), (currentData) => {
        const currentRoom = currentData as Room | null;
        if (!currentRoom || currentRoom.status !== "playing" || !currentRoom.round) {
          return currentRoom;
        }

        const round = currentRoom.round as RoomRound;
        const turnOrder = round.turnOrder ?? [];
        const activeIndex = round.activeTurnIndex ?? 0;
        const activeUid = turnOrder[activeIndex];

        if (!activeUid) {
          return currentRoom;
        }

        if (!autoSubmitted && activeUid !== authUser.uid) {
          return currentRoom;
        }

        round.submissions = round.submissions ?? {};
        if (round.submissions[activeUid]) {
          return currentRoom;
        }

        const submission: TurnSubmission = {
          uid: activeUid,
          clue,
          autoSubmitted,
          submittedAt: Date.now(),
        };

        round.submissions[activeUid] = submission;

        if (activeIndex + 1 >= turnOrder.length) {
          currentRoom.status = "voting";
          round.turnEndsAt = 0;
        } else {
          round.activeTurnIndex = activeIndex + 1;
          round.turnEndsAt = Date.now() + TURN_MS;
        }

        currentRoom.round = round;
        return currentRoom;
      });
    },
    [authUser, clueInput, roomId],
  );

  useEffect(() => {
    if (!isHost || room?.status !== "playing" || !room.round?.turnEndsAt) {
      return;
    }

    const interval = setInterval(() => {
      if (Date.now() < room.round!.turnEndsAt) {
        return;
      }

      if (autoSubmittingRef.current) {
        return;
      }

      autoSubmittingRef.current = true;
      void submitTurn(true).finally(() => {
        setTimeout(() => {
          autoSubmittingRef.current = false;
        }, 200);
      });
    }, 400);

    return () => clearInterval(interval);
  }, [isHost, room, submitTurn]);

  useEffect(() => {
    if (!isHost || room?.status !== "playing" || !room.round) {
      return;
    }

    const allReady = players.length > 0 && players.every((player) => room.round?.readyToVote?.[player.uid]);
    if (!allReady) {
      return;
    }

    void runTransaction(ref(db, `rooms/${roomId}`), (currentData) => {
      const currentRoom = currentData as Room | null;
      if (!currentRoom || currentRoom.status !== "playing") {
        return currentRoom;
      }
      currentRoom.status = "voting";
      if (currentRoom.round) {
        currentRoom.round.turnEndsAt = 0;
      }
      return currentRoom;
    });
  }, [isHost, players, room, roomId]);

  useEffect(() => {
    if (!isHost || room?.status !== "result" || !room.round?.result || room.round.result.scoreApplied) {
      return;
    }

    async function applyScores() {
      const scoreAppliedRef = ref(db, `rooms/${roomId}/round/result/scoreApplied`);
      const lock = await runTransaction(scoreAppliedRef, (current) => {
        if (current === true) {
          return current;
        }
        return true;
      });

      if (!lock.committed) {
        return;
      }

      const updates: Record<string, unknown> = {};
      for (const [uid, delta] of Object.entries(room.round?.result?.scoreDelta ?? {})) {
        if (delta === 0) {
          continue;
        }

        updates[`users/${uid}/score`] = increment(delta);
        updates[`rooms/${roomId}/players/${uid}/score`] = increment(delta);
      }

      if (Object.keys(updates).length > 0) {
        await update(ref(db), updates);
      }
    }

    void applyScores();
  }, [isHost, room, roomId]);

  async function handleStartGame() {
    if (!room || !isHost || players.length < 3) {
      return;
    }

    setBusy(true);
    setError("");

    try {
      const response = await fetch("/api/generate-words", { method: "POST" });
      const payload = (await response.json()) as { common: string; imposter: string };

      const commonWord = payload.common || "Apple";
      const imposterWord = payload.imposter || "Pear";
      const turnOrder = players.map((player) => player.uid);
      const imposterUid = turnOrder[Math.floor(Math.random() * turnOrder.length)];

      const secretWords = Object.fromEntries(
        turnOrder.map((uid) => [uid, uid === imposterUid ? imposterWord : commonWord]),
      ) as Record<string, string>;

      const round: RoomRound = {
        commonWord,
        imposterWord,
        imposterUid,
        secretWords,
        turnOrder,
        activeTurnIndex: 0,
        turnEndsAt: Date.now() + TURN_MS,
        submissions: {},
        readyToVote: {},
        votes: {},
        result: null,
        startedAt: Date.now(),
      };

      await update(ref(db, `rooms/${roomId}`), {
        status: "playing",
        round,
      });
    } catch {
      setError("Could not start game. Verify API route, internet connection, and env config.");
    } finally {
      setBusy(false);
    }
  }

  async function handleReadyToVote() {
    if (!authUser || !roomId || room?.status !== "playing") {
      return;
    }

    await set(ref(db, `rooms/${roomId}/round/readyToVote/${authUser.uid}`), true);
  }

  async function handleVote(targetUid: string) {
    if (!authUser || room?.status !== "voting") {
      return;
    }

    await runTransaction(ref(db, `rooms/${roomId}`), (currentData) => {
      const currentRoom = currentData as Room | null;
      if (!currentRoom || currentRoom.status !== "voting" || !currentRoom.round) {
        return currentRoom;
      }

      const round = currentRoom.round;
      round.votes = round.votes ?? {};

      if (round.votes[authUser.uid]) {
        return currentRoom;
      }

      round.votes[authUser.uid] = targetUid;

      const voteEntries = Object.values(round.votes);
      const playerCount = Object.keys(currentRoom.players ?? {}).length;

      if (voteEntries.length >= playerCount) {
        const tally = countVotes(round.votes);
        let mostVotedUid: string | null = null;
        let maxVotes = -1;

        for (const [uid, count] of Object.entries(tally)) {
          if (count > maxVotes) {
            maxVotes = count;
            mostVotedUid = uid;
          }
        }

        const imposterCaught = mostVotedUid === round.imposterUid;
        const scoreDelta: Record<string, number> = {};

        for (const uid of Object.keys(currentRoom.players ?? {})) {
          if (imposterCaught) {
            scoreDelta[uid] = uid === round.imposterUid ? -1 : 1;
          } else {
            scoreDelta[uid] = uid === round.imposterUid ? 2 : 0;
          }
        }

        round.result = {
          mostVotedUid,
          imposterCaught,
          scoreDelta,
          scoreApplied: false,
          completedAt: Date.now(),
        };

        currentRoom.status = "result";
      }

      currentRoom.round = round;
      return currentRoom;
    });
  }

  async function handleBackToLobby() {
    if (!isHost) {
      return;
    }

    await update(ref(db, `rooms/${roomId}`), {
      status: "lobby",
      round: null,
    });
  }

  async function handleLeaveRoom() {
    if (!authUser) {
      return;
    }

    await remove(ref(db, `rooms/${roomId}/players/${authUser.uid}`));
    router.push("/dashboard");
  }

  if (loading) {
    return <main className="min-h-screen p-8">Loading room...</main>;
  }

  if (!room) {
    return (
      <main className="min-h-screen p-8">
        <p className="text-lg font-semibold text-rose-700">{error || "Room not found."}</p>
        <button
          type="button"
          onClick={() => router.push("/dashboard")}
          className="mt-4 rounded-xl border border-zinc-300 bg-white px-4 py-2 font-semibold"
        >
          Back to Dashboard
        </button>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_5%_15%,_#fee2e2_0%,_#fef9c3_45%,_#dcfce7_100%)] px-4 py-6 sm:px-8">
      <section className="mx-auto w-full max-w-5xl space-y-4">
        <header className="rounded-3xl border border-black/10 bg-white/85 p-5 shadow-xl backdrop-blur sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-zinc-600">Room {room.roomId}</p>
              <h1 className="mt-1 text-3xl font-black text-zinc-900">Find the Imposter</h1>
              <p className="mt-1 text-sm text-zinc-700">Status: {room.status.toUpperCase()}</p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => router.push("/dashboard")}
                className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-100"
              >
                Dashboard
              </button>
              <button
                type="button"
                onClick={handleLeaveRoom}
                className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-800 hover:bg-rose-100"
              >
                Leave
              </button>
            </div>
          </div>
        </header>

        <section className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
          <div className="space-y-4 rounded-3xl border border-black/10 bg-white/85 p-5 shadow-xl backdrop-blur">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-2xl font-black text-zinc-900">Players</h2>
              <p className="text-sm font-semibold text-zinc-700">{players.length} connected</p>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              {players.map((player) => {
                const isTurn = player.uid === activeTurnUid && room.status === "playing";
                return (
                  <div
                    key={player.uid}
                    className={`rounded-xl border p-3 text-sm ${
                      isTurn ? "border-emerald-500 bg-emerald-50" : "border-zinc-200 bg-zinc-50"
                    }`}
                  >
                    <p className="font-bold text-zinc-900">{player.displayName}</p>
                    <p className="text-zinc-700">{player.avatar} | {player.country}</p>
                    <p className="text-zinc-700">Score: {player.score ?? 0}</p>
                    {player.isHost ? <p className="mt-1 text-xs font-semibold text-amber-700">Host</p> : null}
                  </div>
                );
              })}
            </div>

            <AnimatePresence mode="wait">
              {room.status === "lobby" ? (
                <motion.div
                  key="lobby"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="space-y-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-4"
                >
                  <p className="text-sm text-zinc-700">Waiting in lobby. Minimum 3 players required.</p>
                  {isHost ? (
                    <button
                      type="button"
                      onClick={handleStartGame}
                      disabled={busy || players.length < 3}
                      className="w-full rounded-xl bg-emerald-600 px-4 py-2 font-bold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {busy ? "Starting..." : "Start Game"}
                    </button>
                  ) : (
                    <p className="text-sm font-semibold text-zinc-700">Host will start the game.</p>
                  )}
                </motion.div>
              ) : null}

              {room.status === "playing" ? (
                <motion.div
                  key="playing"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="space-y-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-4"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-bold text-zinc-900">Clue Round</p>
                    <p className="rounded-full bg-zinc-900 px-3 py-1 text-sm font-bold text-white">{secondsLeft}s</p>
                  </div>

                  <p className="text-sm text-zinc-700">
                    Turn: <span className="font-bold">{playersByUid.get(activeTurnUid ?? "")?.displayName ?? "Unknown"}</span>
                  </p>

                  {authUser?.uid === activeTurnUid ? (
                    <div className="space-y-2">
                      <input
                        value={clueInput}
                        onChange={(event) => setClueInput(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            void submitTurn(false);
                          }
                        }}
                        maxLength={32}
                        placeholder="Type your clue"
                        className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 outline-none ring-emerald-300 transition focus:ring-2"
                      />
                      <button
                        type="button"
                        onClick={() => void submitTurn(false)}
                        className="w-full rounded-xl bg-zinc-900 px-4 py-2 font-bold text-white transition hover:bg-zinc-800"
                      >
                        Submit Clue
                      </button>
                    </div>
                  ) : (
                    <p className="text-sm font-semibold text-zinc-700">Wait for the active player to submit.</p>
                  )}

                  <button
                    type="button"
                    onClick={() => void handleReadyToVote()}
                    disabled={!!myReadyState}
                    className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {myReadyState ? "You are ready" : "Ready to guess imposter"}
                  </button>
                </motion.div>
              ) : null}

              {room.status === "voting" ? (
                <motion.div
                  key="voting"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="space-y-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-4"
                >
                  <p className="font-bold text-zinc-900">Voting Phase</p>
                  <p className="text-sm text-zinc-700">Choose who you think is the imposter.</p>

                  <div className="grid gap-2 sm:grid-cols-2">
                    {players.map((player) => (
                      <button
                        key={player.uid}
                        type="button"
                        onClick={() => void handleVote(player.uid)}
                        disabled={!!myVote}
                        className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-left font-semibold text-zinc-800 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Vote {player.displayName}
                      </button>
                    ))}
                  </div>

                  <p className="text-sm text-zinc-700">
                    Votes submitted: {Object.keys(room.round?.votes ?? {}).length}/{players.length}
                  </p>
                  {myVote ? (
                    <p className="text-sm font-semibold text-emerald-700">
                      You voted for {playersByUid.get(myVote)?.displayName ?? "Unknown"}.
                    </p>
                  ) : null}
                </motion.div>
              ) : null}

              {room.status === "result" ? (
                <motion.div
                  key="result"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="space-y-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-4"
                >
                  <p className="text-2xl font-black text-zinc-900">Round Result</p>
                  <p className="text-zinc-700">
                    Imposter: <span className="font-bold">{playersByUid.get(room.round?.imposterUid ?? "")?.displayName ?? "Unknown"}</span>
                  </p>
                  <p className="rounded-xl bg-zinc-900 px-3 py-2 text-sm font-bold text-white">
                    {room.round?.result?.imposterCaught ? "Crew wins" : "Imposter wins"}
                  </p>

                  <div className="space-y-1 rounded-xl border border-zinc-200 bg-white p-3 text-sm text-zinc-700">
                    <p className="font-bold text-zinc-900">Vote Tally</p>
                    {players.map((player) => (
                      <p key={`tally-${player.uid}`}>
                        {player.displayName}: {voteTally[player.uid] ?? 0}
                      </p>
                    ))}
                  </div>

                  {isHost ? (
                    <button
                      type="button"
                      onClick={() => void handleBackToLobby()}
                      className="w-full rounded-xl bg-emerald-600 px-4 py-2 font-bold text-white transition hover:bg-emerald-700"
                    >
                      Back to Lobby
                    </button>
                  ) : (
                    <p className="text-sm text-zinc-700">Waiting for host to reset to lobby.</p>
                  )}
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>

          <aside className="space-y-4 rounded-3xl border border-black/10 bg-white/85 p-5 shadow-xl backdrop-blur">
            <h2 className="text-2xl font-black text-zinc-900">Round Intel</h2>

            {room.status !== "lobby" ? (
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-600">Your Secret Word</p>
                <p className="mt-1 text-2xl font-black text-zinc-900">{mySecretWord ?? "Waiting..."}</p>
              </div>
            ) : (
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700">
                Secrets are assigned when the host starts a round.
              </div>
            )}

            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-600">Submission Log</p>
              <ul className="mt-2 space-y-1 text-sm text-zinc-700">
                {submissions.length === 0 ? <li>No clues yet.</li> : null}
                {submissions.map((entry) => (
                  <li key={`${entry.uid}-${entry.submittedAt}`}>
                    <span className="font-bold">{playersByUid.get(entry.uid)?.displayName ?? "Unknown"}:</span> {entry.clue}
                    {entry.autoSubmitted ? " (auto)" : ""}
                  </li>
                ))}
              </ul>
            </div>

            {error ? <p className="rounded-xl bg-rose-100 px-3 py-2 text-sm font-semibold text-rose-800">{error}</p> : null}
          </aside>
        </section>
      </section>
    </main>
  );
}
