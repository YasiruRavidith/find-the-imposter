"use client";

import { AnimatePresence, motion } from "framer-motion";
import Image from "next/image";
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
import { avatarImagePath, resolveCountry, TURN_MS, TURN_SECONDS, sortPlayers } from "@/lib/game";
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

    const currentUid = authUser.uid;

    let cancelled = false;

    async function upsertPlayer() {
      const profileSnap = await get(ref(db, `users/${currentUid}`));
      if (!profileSnap.exists() || cancelled) {
        return;
      }

      const profile = profileSnap.val() as UserProfile;
      const player: RoomPlayer = {
        uid: profile.uid,
        displayName: profile.displayName,
        country: resolveCountry(profile.country),
        avatar: profile.avatar,
        photoURL: profile.photoURL,
        score: profile.score ?? 0,
        joinedAt: Date.now(),
        isHost: false,
      };

      await set(ref(db, `rooms/${roomId}/players/${currentUid}`), player);
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

    const scoreDelta = room.round.result.scoreDelta;

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
      for (const [uid, delta] of Object.entries(scoreDelta)) {
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
    return (
      <main className="noir-shell">
        <section className="noir-frame max-w-3xl p-6 text-center">
          <p className="text-lg font-semibold uppercase text-slate-800">Loading case file...</p>
        </section>
      </main>
    );
  }

  if (!room) {
    return (
      <main className="noir-shell">
        <section className="noir-frame max-w-3xl space-y-4 p-6">
          <p className="text-lg font-semibold text-rose-800">{error || "Room not found."}</p>
          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            className="noir-btn-ghost px-4 py-2 text-sm uppercase tracking-[0.08em]"
          >
            Back To Dashboard
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="noir-shell">
      <section className="noir-frame max-w-7xl space-y-4 p-3 sm:p-4">
        <header className="noir-panel p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="noir-label">Case File {room.roomId}</p>
              <h1 className="noir-title mt-1 text-2xl font-bold sm:text-4xl">Phase: {room.status}</h1>
              <p className="noir-screen-id mt-1">Screen ID: N-003 Interrogation</p>
            </div>
            <div className="flex w-full gap-2 sm:w-auto">
              <button
                type="button"
                onClick={() => router.push("/dashboard")}
                className="noir-btn-ghost w-full px-4 py-2 text-xs uppercase tracking-[0.08em] sm:w-auto"
              >
                Dashboard
              </button>
              <button
                type="button"
                onClick={handleLeaveRoom}
                className="w-full rounded-full border-3 border-[#1b2235] bg-white px-4 py-2 text-xs font-extrabold uppercase tracking-[0.08em] text-[#d22f67] sm:w-auto"
              >
                Leave
              </button>
            </div>
          </div>
        </header>

        <section className="grid gap-4 xl:grid-cols-[260px_minmax(0,1fr)_320px]">
          <aside className="noir-panel p-3 sm:p-4">
            <div className="noir-divider flex items-center justify-between pb-2">
              <h2 className="text-xl font-bold uppercase text-slate-900">Suspects</h2>
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">{players.length}</p>
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
              {players.map((player) => {
                const isTurn = player.uid === activeTurnUid && room.status === "playing";
                return (
                  <article
                    key={player.uid}
                    className={`relative border p-2.5 text-sm ${
                      isTurn
                        ? "border-[#1b2235] bg-[#e1f6ff]"
                        : "border-[#1b2235]/45 bg-[#fffefb]"
                    }`}
                  >
                    <Image
                      src={avatarImagePath(player.avatar)}
                      alt={player.displayName}
                      width={44}
                      height={44}
                      className="mb-2 h-11 w-11 rounded-full border-2 border-[#1b2235] object-cover"
                    />
                    <p className="font-bold uppercase text-slate-900">{player.displayName}</p>
                    <p className="text-xs text-slate-600">{resolveCountry(player.country)}</p>
                    <p className="text-xs font-semibold text-slate-700">Score {player.score ?? 0}</p>
                    {player.isHost ? <p className="mt-1 text-[11px] font-bold uppercase text-amber-800">Chief</p> : null}
                    {isTurn ? <span className="noir-stamp absolute right-2 top-2">Speaking</span> : null}
                  </article>
                );
              })}
            </div>
          </aside>

          <div className="noir-panel p-3 sm:p-4">
            <div className="noir-divider flex items-center justify-between pb-2">
              <h2 className="text-xl font-bold uppercase text-slate-900">The Log</h2>
              {room.status === "playing" ? (
                <p className="rounded-full border-3 border-[#1b2235] bg-[#ffc93b] px-3 py-1 text-lg font-extrabold text-[#1b2235]">{secondsLeft}s</p>
              ) : null}
            </div>

            <div className="mt-3 min-h-60 space-y-1 border border-slate-400/40 bg-[#fbfbf9] p-3 text-sm">
              {submissions.length === 0 ? <p className="text-slate-500">No clues yet.</p> : null}
              {submissions.map((entry) => (
                <p key={`${entry.uid}-${entry.submittedAt}`} className="text-slate-700">
                  <span className="font-bold text-slate-900">{playersByUid.get(entry.uid)?.displayName ?? "Unknown"}:</span>{" "}
                  {entry.clue}
                  {entry.autoSubmitted ? " (auto)" : ""}
                </p>
              ))}
            </div>

            <AnimatePresence mode="wait">
              {room.status === "lobby" ? (
                <motion.div
                  key="lobby"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="mt-4 border border-slate-500/40 bg-[#f2f1ec] p-3"
                >
                  <p className="text-sm text-slate-700">Awaiting full detachment. Minimum 3 players required.</p>
                  {isHost ? (
                    <button
                      type="button"
                      onClick={handleStartGame}
                      disabled={busy || players.length < 3}
                      className="noir-btn mt-3 w-full px-4 py-2 text-sm"
                    >
                      {busy ? "Starting..." : "Start Investigation"}
                    </button>
                  ) : (
                    <p className="mt-3 text-sm font-semibold text-slate-700">Host will initiate the case.</p>
                  )}
                </motion.div>
              ) : null}

              {room.status === "playing" ? (
                <motion.div
                  key="playing"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="mt-4 border border-slate-500/40 bg-[#f2f1ec] p-3"
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">Active Subject</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">
                    {playersByUid.get(activeTurnUid ?? "")?.displayName ?? "Unknown"}
                  </p>

                  {authUser?.uid === activeTurnUid ? (
                    <div className="mt-3 space-y-2">
                      <input
                        value={clueInput}
                        onChange={(event) => setClueInput(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            void submitTurn(false);
                          }
                        }}
                        maxLength={32}
                        placeholder="Type 1 word..."
                        className="noir-input"
                      />
                      <button
                        type="button"
                        onClick={() => void submitTurn(false)}
                        className="noir-btn w-full px-4 py-2 text-sm"
                      >
                        Submit
                      </button>
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-slate-700">Awaiting current detective response.</p>
                  )}

                  <button
                    type="button"
                    onClick={() => void handleReadyToVote()}
                    disabled={!!myReadyState}
                    className="noir-btn-ghost mt-3 w-full px-4 py-2 text-xs uppercase tracking-[0.08em] disabled:opacity-50"
                  >
                    {myReadyState ? "Ready Confirmed" : "Ready To Guess Imposter"}
                  </button>
                </motion.div>
              ) : null}

              {room.status === "voting" ? (
                <motion.div
                  key="voting"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="mt-4 border border-slate-500/40 bg-[#f2f1ec] p-3"
                >
                  <p className="noir-title text-xl font-bold text-slate-900">Who Is Lying?</p>
                  <p className="mt-1 text-sm text-slate-700">Select one suspect and lock your vote.</p>

                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {players.map((player) => (
                      <button
                        key={player.uid}
                        type="button"
                        onClick={() => void handleVote(player.uid)}
                        disabled={!!myVote}
                        className="flex items-center gap-2 rounded-2xl border-3 border-[#1b2235] bg-white px-3 py-2 text-left text-sm font-extrabold uppercase text-slate-900 transition hover:bg-[#fff0f7] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Image
                          src={avatarImagePath(player.avatar)}
                          alt={player.displayName}
                          width={34}
                          height={34}
                          className="h-8 w-8 rounded-full border-2 border-[#1b2235] object-cover"
                        />
                        {player.displayName}
                      </button>
                    ))}
                  </div>

                  <p className="mt-3 text-sm text-slate-700">
                    Votes: {Object.keys(room.round?.votes ?? {}).length}/{players.length}
                  </p>
                  {myVote ? (
                    <p className="mt-1 text-sm font-extrabold text-[#169ed1]">
                      Vote locked on {playersByUid.get(myVote)?.displayName ?? "Unknown"}.
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
                  className="mt-4 border border-slate-500/40 bg-[#f2f1ec] p-3"
                >
                  <p className="noir-title text-2xl font-bold text-slate-900">
                    {room.round?.result?.imposterCaught ? "Imposter Caught" : "Imposter Escaped"}
                  </p>
                  <p className="mt-1 text-sm text-slate-700">
                    Target: <span className="font-bold">{playersByUid.get(room.round?.imposterUid ?? "")?.displayName ?? "Unknown"}</span>
                  </p>

                  <div className="mt-3 border border-slate-400/50 bg-white p-3 text-sm">
                    <p className="font-bold uppercase text-slate-900">Vote Tally</p>
                    {players.map((player) => (
                      <p key={`tally-${player.uid}`} className="text-slate-700">
                        {player.displayName}: {voteTally[player.uid] ?? 0}
                      </p>
                    ))}
                  </div>

                  {isHost ? (
                    <button
                      type="button"
                      onClick={() => void handleBackToLobby()}
                      className="noir-btn mt-3 w-full px-4 py-2 text-sm"
                    >
                      Open New Case
                    </button>
                  ) : (
                    <p className="mt-3 text-sm text-slate-700">Awaiting host to reopen lobby.</p>
                  )}
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>

          <aside className="noir-panel p-3 sm:p-4">
            <div className="noir-divider pb-2">
              <p className="noir-label">Classified Intel</p>
              <h2 className="mt-1 text-xl font-bold uppercase text-slate-900">Your Brief</h2>
            </div>

            {room.status !== "lobby" ? (
              <div className="mt-3 rounded-2xl border-3 border-[#1b2235] bg-white p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">Target Subject</p>
                <p className="mt-1 text-2xl font-bold uppercase text-[#ff4b8b]">{mySecretWord ?? "Waiting"}</p>
              </div>
            ) : (
              <div className="mt-3 rounded-2xl border-3 border-[#1b2235]/50 bg-[#fafaf8] p-3 text-sm text-slate-700">
                Secret words are assigned once the host starts the investigation.
              </div>
            )}

            {error ? <p className="mt-3 rounded-2xl border-3 border-[#1b2235] bg-[#ffe9f2] p-3 text-sm font-semibold text-[#a31f4b]">{error}</p> : null}
          </aside>
        </section>
      </section>
    </main>
  );
}
