"use client";

import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { get, onValue, ref, remove, set, update } from "firebase/database";
import { auth, db } from "@/lib/firebase";
import { avatarImagePath, resolveCountry, sortPlayers, TURN_MS } from "@/lib/game";
import type { Room, RoomPlayer, RoomRound, UserProfile } from "@/lib/types";

const MAX_PLAYERS = 8;

export default function RoomPage() {
  const params = useParams<{ roomId: string }>();
  const router = useRouter();
  const roomId = (params.roomId ?? "").toUpperCase();

  const [authUser, setAuthUser] = useState<User | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

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

      // Keep this route as lobby-only. Move everyone to gameplay route once host starts.
      if (nextRoom.status !== "lobby") {
        router.replace(`/room/${roomId}/game`);
      }
    });

    return () => unsubscribeRoom();
  }, [roomId, router]);

  useEffect(() => {
    if (!authUser || !room || room.players?.[authUser.uid]) {
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
  const isHost = !!authUser && room?.hostUid === authUser.uid;
  const openSlots = Math.max(0, MAX_PLAYERS - players.length);

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

      router.push(`/room/${roomId}/game`);
    } catch {
      setError("Could not start game. Verify API route, internet connection, and env config.");
    } finally {
      setBusy(false);
    }
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
        <section className="w-full max-w-5xl px-4 py-10 text-center sm:px-6">
          <p className="text-lg font-semibold uppercase text-slate-800">Loading room...</p>
        </section>
      </main>
    );
  }

  if (!room) {
    return (
      <main className="noir-shell">
        <section className="w-full max-w-3xl space-y-4 px-4 py-10 sm:px-6">
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
      <div className="mx-auto w-full max-w-6xl px-4 pb-28 pt-4 sm:px-6 sm:pt-6">
        <header className="noir-divider flex items-center justify-between pb-4">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.06em] text-slate-800">Imposter</p>
          </div>
          <button
            type="button"
            onClick={handleLeaveRoom}
            className="rounded-full border-3 border-[#1b2235] bg-white px-4 py-1.5 text-xs font-black uppercase tracking-[0.08em] text-[#d22f67] transition hover:bg-[#fff0f6]"
          >
            Leave
          </button>
        </header>

        <section className="mt-5 flex justify-center">
          <div className="w-full max-w-85 rounded-[36px] border-3 border-[#1b2235] bg-[#f8c63a] px-6 py-4 text-center shadow-[0_4px_0_rgba(27,34,53,0.2)]">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-[#614200]">Room Code</p>
            <p className="mt-1 text-[2.1rem] font-black uppercase leading-none tracking-[0.2em] text-[#1b2235] sm:text-[2.4rem]">{room.roomId}</p>
          </div>
        </section>

        <section className="mt-8">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h2 className="text-2xl font-black text-[#1b2235]">Players</h2>
            <div className="rounded-full border-3 border-[#1b2235] bg-white px-4 py-1.5 text-sm font-extrabold text-[#1b2235] shadow-[0_2px_0_rgba(27,34,53,0.15)]">
              <span className="text-[#ff4b8b]">{players.length}</span> / {MAX_PLAYERS} Joined
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {players.map((player) => (
              <article key={player.uid} className="text-center">
                <div className="mx-auto h-26 w-26 overflow-hidden rounded-full border-4 border-[#1b2235] bg-white shadow-[0_4px_0_rgba(27,34,53,0.2)] sm:h-30 sm:w-30">
                  <Image
                    src={avatarImagePath(player.avatar)}
                    alt={player.displayName}
                    width={260}
                    height={260}
                    className="h-full w-full scale-[1.3] object-cover"
                  />
                </div>
                <p className="mx-auto mt-3 w-full max-w-36.25 rounded-full border-3 border-[#1b2235] bg-white px-2 py-1.5 text-sm font-black text-[#1b2235] shadow-[0_2px_0_rgba(27,34,53,0.14)]">
                  {player.displayName}
                </p>
              </article>
            ))}

            {Array.from({ length: openSlots }).map((_, index) => (
              <article key={`slot-${index}`} className="text-center opacity-60">
                <div className="mx-auto flex h-26 w-26 items-center justify-center rounded-full border-3 border-dashed border-[#9ca3af] bg-white text-2xl text-[#9ca3af] sm:h-30 sm:w-30">
                  +
                </div>
                <p className="mx-auto mt-3 w-full max-w-36.25 rounded-full border-2 border-dashed border-[#9ca3af] bg-white px-2 py-1.5 text-xs font-bold uppercase tracking-[0.08em] text-[#9ca3af]">
                  Waiting
                </p>
              </article>
            ))}
          </div>
        </section>

        {error ? (
          <p className="mt-5 rounded-2xl border-3 border-[#1b2235] bg-[#ffe9f2] p-3 text-sm font-semibold text-[#a31f4b]">
            {error}
          </p>
        ) : null}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t-3 border-[#1b2235] bg-white/95 px-4 py-3 backdrop-blur-sm sm:px-6">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3">
          <p className="text-sm font-bold text-[#1b2235]">
            {isHost ? "You are host. Start when everyone joins." : "Waiting for host to start..."}
          </p>

          {isHost ? (
            <button
              type="button"
              onClick={() => void handleStartGame()}
              disabled={busy || players.length < 3}
              className="noir-btn min-w-42.5 px-7 py-3 text-base disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "Starting..." : "Start Game"}
            </button>
          ) : (
            <button
              type="button"
              disabled
              className="min-w-42.5 rounded-full border-3 border-[#1b2235] bg-[#f3f4f6] px-7 py-3 text-base font-black uppercase tracking-[0.08em] text-[#6b7280]"
            >
              Waiting
            </button>
          )}
        </div>
      </div>
    </main>
  );
}
