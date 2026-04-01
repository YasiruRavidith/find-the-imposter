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

const MAX_CLUE_ROUNDS = 3;

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

export default function RoomGamePage() {
  const params = useParams<{ roomId: string }>();
  const router = useRouter();
  const roomId = (params.roomId ?? "").toUpperCase();

  const [authUser, setAuthUser] = useState<User | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [clueInput, setClueInput] = useState("");
  const [now, setNow] = useState(0);

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

      const nextRoom = snapshot.val() as Room;
      setRoom(nextRoom);
      setLoading(false);

      if (nextRoom.status === "lobby") {
        router.replace(`/room/${roomId}`);
      }
    });

    return () => unsubscribeRoom();
  }, [roomId, router]);

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
  const turnOrder = room?.round?.turnOrder ?? [];
  const totalTurnCount = turnOrder.length * MAX_CLUE_ROUNDS;
  const safeActiveTurnIndex = room?.round ? Math.min(room.round.activeTurnIndex ?? 0, Math.max(0, totalTurnCount - 1)) : 0;
  const activeTurnUid = turnOrder.length > 0 ? turnOrder[safeActiveTurnIndex % turnOrder.length] : null;
  const currentRoundNumber = turnOrder.length > 0 ? Math.floor(safeActiveTurnIndex / turnOrder.length) + 1 : 1;
  const isMyTurn = !!authUser && activeTurnUid === authUser.uid;
  const isImposter = !!authUser && room?.round?.imposterUid === authUser.uid;
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

  const submittedCount = useMemo(() => Object.keys(room?.round?.submissions ?? {}).length, [room?.round?.submissions]);
  const integrityScore = totalTurnCount > 0 ? Math.min(100, Math.round((submittedCount / totalTurnCount) * 100)) : 0;
  const turnProgress =
    room?.status !== "playing"
      ? 0
      : isMyTurn
        ? Math.max(0, Math.min(100, Math.round((secondsLeft / TURN_SECONDS) * 100)))
        : 100;

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
        const nextTurnOrder = round.turnOrder ?? [];
        const totalTurns = nextTurnOrder.length * MAX_CLUE_ROUNDS;
        const activeIndex = Math.min(round.activeTurnIndex ?? 0, Math.max(0, totalTurns - 1));
        const activeUid = nextTurnOrder.length > 0 ? nextTurnOrder[activeIndex % nextTurnOrder.length] : undefined;
        const roundNumber = nextTurnOrder.length > 0 ? Math.floor(activeIndex / nextTurnOrder.length) + 1 : 1;

        if (!activeUid) {
          return currentRoom;
        }

        if (!autoSubmitted && activeUid !== authUser.uid) {
          return currentRoom;
        }

        round.submissions = round.submissions ?? {};
        const submissionKey = `${roundNumber}-${activeUid}`;
        if (round.submissions[submissionKey]) {
          return currentRoom;
        }

        const submission: TurnSubmission = {
          uid: activeUid,
          clue,
          autoSubmitted,
          submittedAt: Date.now(),
        };

        round.submissions[submissionKey] = submission;

        if (activeIndex + 1 >= totalTurns) {
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

    router.push(`/room/${roomId}`);
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
        <section className="max-w-3xl p-6 text-center">
          <p className="text-lg font-semibold uppercase text-slate-800">Loading case file...</p>
        </section>
      </main>
    );
  }

  if (!room) {
    return (
      <main className="noir-shell">
        <section className="max-w-3xl space-y-4 p-6">
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
    <main className="noir-shell relative overflow-hidden">
      <span className="pointer-events-none absolute left-6 top-20 text-5xl text-[#c9c9cc]">?</span>
      <span className="pointer-events-none absolute right-8 top-36 h-10 w-10 rounded-full border-2 border-[#b4b4b9] bg-[#fde8ad]" />
      <span className="pointer-events-none absolute bottom-18 left-8 h-14 w-14 rounded-full border-2 border-[#a7b5c7] bg-[#bce8f7]" />
      <span className="pointer-events-none absolute bottom-10 right-8 text-5xl text-[#c9c9cc]">◉</span>

      <div className="mx-auto w-full max-w-4xl px-4 pb-8 pt-4 sm:px-6 sm:pt-6">
        <header className="mb-6 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.08em] text-[#1b2235] sm:text-sm">
            <span className="h-3 w-3 rounded-full bg-[#ff4b8b]" />
            Imposter Word
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => router.push(`/room/${roomId}`)}
              className="h-10 rounded-full border-3 border-[#1b2235] bg-white px-4 text-xs font-black uppercase tracking-[0.08em] text-[#1b2235]"
            >
              Lobby
            </button>
            <button
              type="button"
              onClick={handleLeaveRoom}
              className="h-10 rounded-full border-3 border-[#1b2235] bg-[#ffd84a] px-4 text-xs font-black uppercase tracking-[0.08em] text-[#1b2235]"
            >
              Leave
            </button>
          </div>
        </header>

        <AnimatePresence mode="wait">
          {room.status === "playing" ? (
            <motion.section
              key="playing"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="space-y-8"
            >
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-black uppercase tracking-[0.08em] text-[#1b2235]">Hurry Up!</p>
                  <p className="rounded-full border-3 border-[#1b2235] bg-[#ffc93b] px-3 py-1 text-2xl font-black text-[#1b2235]">
                    {isMyTurn ? secondsLeft.toString().padStart(2, "0") : "--"}
                  </p>
                </div>
                <div className="h-7 rounded-full border-3 border-[#1b2235] bg-white p-1">
                  <div
                    className={`h-full rounded-full ${isMyTurn ? "bg-[#1eb8ea]" : "bg-[#d2d8e6]"} transition-all`}
                    style={{ width: `${turnProgress}%` }}
                  />
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-[minmax(0,1.75fr)_minmax(260px,0.75fr)]">
                <section className="rounded-3xl border-3 border-[#1b2235] bg-[#f9f9fa] p-4 shadow-[0_6px_0_rgba(27,34,53,0.16)] sm:p-5">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-sm font-black uppercase tracking-[0.08em] text-[#ff4b8b]">Investigation Log</p>
                    <p className="text-xs font-black uppercase tracking-[0.08em] text-[#1b2235]">Integrity {integrityScore}%</p>
                  </div>
                  <div className="max-h-105 min-h-70 space-y-2 overflow-y-auto rounded-2xl border-2 border-[#1b2235]/15 bg-white/80 p-3">
                    {submissions.length === 0 ? <p className="text-sm font-semibold text-slate-500">No clues yet. Investigation begins now.</p> : null}
                    {submissions.map((entry) => {
                      const mine = entry.uid === authUser?.uid;
                      return (
                        <article
                          key={`${entry.uid}-${entry.submittedAt}`}
                          className={`max-w-[92%] rounded-xl border-3 border-[#1b2235] px-3 py-2 text-sm shadow-[0_4px_0_rgba(27,34,53,0.16)] sm:text-base ${
                            mine ? "ml-auto bg-[#ff72a7] text-[#22263b]" : "bg-white text-[#1f2537]"
                          }`}
                        >
                          <p className={`text-[10px] font-black uppercase tracking-widest ${mine ? "text-[#4a1730]" : "text-slate-500"}`}>
                            {(mine ? "You" : playersByUid.get(entry.uid)?.displayName ?? "Unknown")} #{new Date(entry.submittedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </p>
                          <p className="mt-1 font-semibold">
                            {entry.clue}
                            {entry.autoSubmitted ? " (auto)" : ""}
                          </p>
                        </article>
                      );
                    })}
                  </div>

                  <div className="mt-3">
                    {isMyTurn ? (
                      <div>
                        <div className="flex items-center rounded-full border-3 border-[#1b2235] bg-white pr-1 shadow-[0_6px_0_rgba(27,34,53,0.2)]">
                          <input
                            value={clueInput}
                            onChange={(event) => setClueInput(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                void submitTurn(false);
                              }
                            }}
                            maxLength={32}
                            placeholder="ENTER YOUR HINT..."
                            className="h-16 flex-1 bg-transparent px-6 text-xl font-black uppercase tracking-[0.04em] text-[#1b2235] outline-none placeholder:text-[#a3abc0] sm:text-2xl"
                          />
                          <button
                            type="button"
                            onClick={() => void submitTurn(false)}
                            className="h-13 w-13 rounded-full border-3 border-[#1b2235] bg-[#ff4b8b] text-3xl font-black text-white"
                            aria-label="Submit clue"
                          >
                            →
                          </button>
                        </div>
                        <p className="mt-2 text-xs font-semibold text-[#99a1ba]">1 word only. No variations of the secret word.</p>
                      </div>
                    ) : (
                      <p className="rounded-2xl border-3 border-[#1b2235] bg-white px-4 py-4 text-center text-sm font-bold text-slate-700">
                        Waiting for {playersByUid.get(activeTurnUid ?? "")?.displayName ?? "the active player"} to submit a clue.
                      </p>
                    )}
                  </div>
                </section>

                <aside className="space-y-3 rounded-3xl border-3 border-[#1b2235] bg-[#f9f9fa] p-4 shadow-[0_6px_0_rgba(27,34,53,0.16)] sm:p-5">
                  <p className="text-xs font-black uppercase tracking-[0.08em] text-[#64748b]">
                    Round {Math.min(MAX_CLUE_ROUNDS, currentRoundNumber)} / {MAX_CLUE_ROUNDS}
                  </p>
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-[#99a1ba]">Secret Word</p>
                  <div className="inline-flex rotate-[-1.5deg] rounded-3xl border-3 border-[#1b2235] bg-white px-6 py-4 shadow-[0_6px_0_rgba(27,34,53,0.2)]">
                    <p className="text-4xl font-black uppercase text-[#101828] sm:text-5xl">{mySecretWord ?? "WAIT"}</p>
                  </div>
                  <p
                    className={`inline-flex rounded-full border-3 px-4 py-1 text-xs font-black uppercase tracking-widest ${
                      isImposter
                        ? "border-[#a31f4b] bg-[#ffd4e4] text-[#7c1438]"
                        : "border-[#169ed1] bg-[#dff5ff] text-[#0d5f82]"
                    }`}
                  >
                    {isImposter ? "You are the Imposter" : "You are Innocent"}
                  </p>
                  <button
                    type="button"
                    onClick={() => void handleReadyToVote()}
                    disabled={!!myReadyState}
                    className="noir-btn-ghost w-full px-4 py-3 text-sm uppercase tracking-[0.08em] disabled:opacity-50"
                  >
                    {myReadyState ? "Ready Confirmed" : "Ready To Guess Imposter"}
                  </button>
                </aside>
              </div>
            </motion.section>
          ) : null}

          {room.status === "voting" ? (
            <motion.section
              key="voting"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="mx-auto w-full max-w-3xl rounded-3xl border-3 border-[#1b2235] bg-[#f7f7f5] p-4 sm:p-5"
            >
              <p className="text-4xl font-black uppercase text-[#1b2235] sm:text-5xl">Who Is Lying?</p>
              <p className="mt-1 text-sm font-semibold text-[#66728e]">Select one suspect and lock your vote.</p>

              <section className="mt-4 rounded-2xl border-2 border-[#1b2235]/30 bg-white p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-black uppercase tracking-[0.08em] text-[#ff4b8b]">Log History</p>
                  <p className="text-xs font-black uppercase tracking-[0.08em] text-[#1b2235]">{submissions.length} clues</p>
                </div>
                <div className="max-h-40 space-y-2 overflow-y-auto">
                  {submissions.length === 0 ? <p className="text-sm font-semibold text-slate-500">No clues submitted.</p> : null}
                  {submissions.map((entry) => (
                    <article key={`vote-log-${entry.uid}-${entry.submittedAt}`} className="rounded-lg border border-[#1b2235]/20 px-3 py-2 text-sm text-slate-800">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                        {playersByUid.get(entry.uid)?.displayName ?? "Unknown"}
                      </p>
                      <p className="font-semibold">{entry.clue}</p>
                    </article>
                  ))}
                </div>
              </section>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {players.map((player) => (
                  <button
                    key={player.uid}
                    type="button"
                    onClick={() => void handleVote(player.uid)}
                    disabled={!!myVote}
                    className="flex items-center gap-3 rounded-2xl border-3 border-[#1b2235] bg-white px-3 py-3 text-left text-sm font-extrabold uppercase text-slate-900 transition hover:bg-[#fff0f7] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <div className="h-11 w-11 overflow-hidden rounded-full border-3 border-[#1b2235] bg-white">
                      <Image
                        src={avatarImagePath(player.avatar)}
                        alt={player.displayName}
                        width={64}
                        height={64}
                        className="h-full w-full scale-[1.3] object-cover"
                      />
                    </div>
                    {player.displayName}
                  </button>
                ))}
              </div>

              <p className="mt-4 text-sm text-slate-700">Votes: {Object.keys(room.round?.votes ?? {}).length}/{players.length}</p>
              {myVote ? <p className="mt-1 text-sm font-extrabold text-[#169ed1]">Vote locked on {playersByUid.get(myVote)?.displayName ?? "Unknown"}.</p> : null}
            </motion.section>
          ) : null}

          {room.status === "result" ? (
            <motion.section
              key="result"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="mx-auto w-full max-w-3xl rounded-3xl border-3 border-[#1b2235] bg-[#f7f7f5] p-4 sm:p-5"
            >
              <p className="text-4xl font-black uppercase text-[#1b2235] sm:text-5xl">
                {room.round?.result?.imposterCaught ? "Imposter Caught" : "Imposter Escaped"}
              </p>
              <p className="mt-1 text-sm text-slate-700">
                Target: <span className="font-bold">{playersByUid.get(room.round?.imposterUid ?? "")?.displayName ?? "Unknown"}</span>
              </p>

              <div className="mt-4 rounded-2xl border-2 border-[#1b2235]/30 bg-white p-4 text-sm">
                <p className="font-bold uppercase text-slate-900">Vote Tally</p>
                {players.map((player) => (
                  <p key={`tally-${player.uid}`} className="text-slate-700">
                    {player.displayName}: {voteTally[player.uid] ?? 0}
                  </p>
                ))}
              </div>

              {isHost ? (
                <button type="button" onClick={() => void handleBackToLobby()} className="noir-btn mt-4 w-full px-4 py-3 text-sm">
                  Open New Case
                </button>
              ) : (
                <p className="mt-4 text-sm text-slate-700">Awaiting host to reopen lobby.</p>
              )}
            </motion.section>
          ) : null}
        </AnimatePresence>

        {error ? <p className="mx-auto mt-4 w-full max-w-3xl rounded-lg border-3 border-[#1b2235] bg-[#ffe9f2] p-3 text-sm font-semibold text-[#a31f4b]">{error}</p> : null}
      </div>
    </main>
  );
}
