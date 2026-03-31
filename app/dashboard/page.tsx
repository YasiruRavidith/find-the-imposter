"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { get, ref, set } from "firebase/database";
import { auth, db } from "@/lib/firebase";
import { generateRoomCode, normalizeRoomCode } from "@/lib/game";
import type { Room, RoomPlayer, UserProfile } from "@/lib/types";

export default function DashboardPage() {
  const router = useRouter();

  const [authUser, setAuthUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [joinCodeInput, setJoinCodeInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (nextUser) => {
      if (!nextUser) {
        router.replace("/");
        return;
      }

      setAuthUser(nextUser);
      const profileSnap = await get(ref(db, `users/${nextUser.uid}`));
      if (!profileSnap.exists()) {
        router.replace("/");
        return;
      }

      setProfile(profileSnap.val() as UserProfile);
    });

    return () => unsubscribe();
  }, [router]);

  const normalizedJoinCode = useMemo(() => normalizeRoomCode(joinCodeInput), [joinCodeInput]);

  async function createRoom() {
    if (!authUser || !profile) {
      return;
    }

    setBusy(true);
    setError("");

    try {
      let roomId = generateRoomCode();
      let guard = 0;
      while ((await get(ref(db, `rooms/${roomId}`))).exists() && guard < 5) {
        roomId = generateRoomCode();
        guard += 1;
      }

      const player: RoomPlayer = {
        uid: authUser.uid,
        displayName: profile.displayName,
        country: profile.country,
        avatar: profile.avatar,
        photoURL: profile.photoURL,
        score: profile.score ?? 0,
        joinedAt: Date.now(),
        isHost: true,
      };

      const room: Room = {
        roomId,
        hostUid: authUser.uid,
        status: "lobby",
        createdAt: Date.now(),
        players: {
          [authUser.uid]: player,
        },
        round: null,
      };

      await set(ref(db, `rooms/${roomId}`), room);
      router.push(`/room/${roomId}`);
    } catch {
      setError("Could not create room. Verify database permissions and internet connection.");
    } finally {
      setBusy(false);
    }
  }

  async function joinRoom() {
    if (!authUser || !profile || normalizedJoinCode.length !== 6) {
      return;
    }

    setBusy(true);
    setError("");

    try {
      const roomRef = ref(db, `rooms/${normalizedJoinCode}`);
      const roomSnap = await get(roomRef);

      if (!roomSnap.exists()) {
        setError("Room not found. Check the 6-letter code.");
        return;
      }

      const existingRoom = roomSnap.val() as Room;
      const existingPlayer = existingRoom.players?.[authUser.uid];

      const player: RoomPlayer = {
        uid: authUser.uid,
        displayName: profile.displayName,
        country: profile.country,
        avatar: profile.avatar,
        photoURL: profile.photoURL,
        score: existingPlayer?.score ?? profile.score ?? 0,
        joinedAt: existingPlayer?.joinedAt ?? Date.now(),
        isHost: existingPlayer?.isHost ?? false,
      };

      await set(ref(db, `rooms/${normalizedJoinCode}/players/${authUser.uid}`), player);
      router.push(`/room/${normalizedJoinCode}`);
    } catch {
      setError("Could not join room. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_right,_#dcfce7_0%,_#f6f7d7_40%,_#ffe5d2_100%)] px-4 py-8 sm:px-8">
      <div className="mx-auto w-full max-w-3xl space-y-5">
        <header className="rounded-3xl border border-black/10 bg-white/85 p-6 shadow-xl backdrop-blur">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-600">Dashboard</p>
          <h1 className="mt-2 text-4xl font-black text-zinc-900">Room Control</h1>
          {profile ? (
            <p className="mt-2 text-sm text-zinc-700">
              {profile.displayName} | {profile.avatar} | {profile.country} | Score {profile.score}
            </p>
          ) : (
            <p className="mt-2 text-sm text-zinc-700">Loading profile...</p>
          )}
        </header>

        <section className="grid gap-4 rounded-3xl border border-black/10 bg-white/85 p-6 shadow-xl backdrop-blur sm:grid-cols-2">
          <div className="space-y-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
            <h2 className="text-2xl font-black text-zinc-900">Create Room</h2>
            <p className="text-sm text-zinc-700">Generate a 6-letter room code and invite friends over the internet.</p>
            <button
              type="button"
              onClick={createRoom}
              disabled={busy || !authUser || !profile}
              className="w-full rounded-xl bg-emerald-600 px-4 py-2 font-bold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "Please wait..." : "Create Room"}
            </button>
          </div>

          <div className="space-y-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
            <h2 className="text-2xl font-black text-zinc-900">Join Room</h2>
            <label className="block space-y-1">
              <span className="text-sm font-semibold text-zinc-800">Room code</span>
              <input
                value={joinCodeInput}
                onChange={(event) => setJoinCodeInput(event.target.value)}
                placeholder="AB12CD"
                maxLength={6}
                className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 font-mono tracking-[0.2em] uppercase outline-none ring-emerald-300 transition focus:ring-2"
              />
            </label>
            <button
              type="button"
              onClick={joinRoom}
              disabled={busy || normalizedJoinCode.length !== 6 || !authUser || !profile}
              className="w-full rounded-xl bg-zinc-900 px-4 py-2 font-bold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Join Room
            </button>
          </div>
        </section>

        <section className="flex flex-col gap-3 rounded-3xl border border-black/10 bg-white/85 p-5 shadow-xl backdrop-blur sm:flex-row">
          <button
            type="button"
            onClick={() => router.push("/leaderboard")}
            className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-2 font-semibold text-zinc-800 transition hover:bg-zinc-100"
          >
            Open Leaderboard
          </button>
          <button
            type="button"
            onClick={() => signOut(auth)}
            className="w-full rounded-xl border border-rose-300 bg-rose-50 px-4 py-2 font-semibold text-rose-800 transition hover:bg-rose-100"
          >
            Sign out
          </button>
        </section>

        {error ? <p className="rounded-2xl bg-rose-100 px-4 py-3 text-sm font-semibold text-rose-800">{error}</p> : null}
      </div>
    </main>
  );
}
