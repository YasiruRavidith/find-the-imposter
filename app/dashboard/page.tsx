"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { get, ref, set } from "firebase/database";
import { auth, db } from "@/lib/firebase";
import { avatarImagePath, generateRoomCode, normalizeRoomCode, resolveCountry } from "@/lib/game";
import type { Room, RoomPlayer, UserProfile } from "@/lib/types";

export default function DashboardPage() {
  const router = useRouter();

  const [authUser, setAuthUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [joinCodeInput, setJoinCodeInput] = useState("");
  const [topDetectives, setTopDetectives] = useState<UserProfile[]>([]);
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

      const usersSnap = await get(ref(db, "users"));
      if (usersSnap.exists()) {
        const users = Object.values(usersSnap.val() as Record<string, UserProfile>);
        users.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
        setTopDetectives(users.slice(0, 10));
      }
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
        country: resolveCountry(profile.country),
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
        country: resolveCountry(profile.country),
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
    <main className="noir-shell">
      <div className="noir-frame max-w-6xl p-4 sm:p-6">
        <header className="noir-divider pb-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-lg">🔺</span>
              <p className="text-sm font-black uppercase tracking-[0.05em] text-slate-900">Imposter Word</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => router.push("/profile")}
                className="flex h-10 w-10 items-center justify-center rounded-full border-3 border-[#1b2235] bg-white text-lg shadow-[0_4px_0_rgba(27,34,53,0.18)]"
                aria-label="Profile settings"
              >
                ⚙️
              </button>
              <button
                type="button"
                onClick={() => router.push("/leaderboard")}
                className="flex h-10 w-10 items-center justify-center rounded-full border-3 border-[#1b2235] bg-[#19b8f2] text-lg shadow-[0_4px_0_rgba(27,34,53,0.18)]"
                aria-label="Open leaderboard"
              >
                🙂
              </button>
            </div>
          </div>
          <div className="mt-4 flex items-start justify-between gap-4">
            <div>
              <h1 className="text-4xl font-black leading-tight text-slate-900 sm:text-6xl">
                Ready to play,
                <span className="ml-2 text-[#ff4b8b]">{profile?.displayName ?? "Detective"}</span>?
              </h1>
              <p className="mt-2 max-w-lg text-base font-semibold text-slate-700">
                Create a new game room or enter a code to join your friends.
              </p>
            </div>
            {profile ? (
              <div className="hidden items-center gap-2 rounded-full border-3 border-[#1b2235] bg-white px-3 py-1.5 text-xs font-bold text-slate-700 md:flex">
                <Image
                  src={avatarImagePath(profile.avatar)}
                  alt={profile.displayName}
                  width={26}
                  height={26}
                  className="h-6 w-6 rounded-full border-2 border-[#1b2235] object-cover"
                />
                <span>{resolveCountry(profile.country)}</span>
                <span>|</span>
                <span>{profile.score} pts</span>
              </div>
            ) : null}
          </div>
        </header>

        <section className="mt-6 grid gap-4 lg:grid-cols-[1.1fr_0.85fr]">
          <div className="space-y-4">
            <button
              type="button"
              onClick={createRoom}
              disabled={busy || !authUser || !profile}
              className="noir-btn w-full px-5 py-3 text-xl"
            >
              {busy ? "Opening..." : "✚ Create Game"}
            </button>
            <p className="text-center text-xs font-semibold text-slate-500">Host a new game and invite others</p>

            <div className="flex items-center gap-3 py-1">
              <span className="h-px flex-1 bg-[#1b2235]/20" />
              <span className="text-xs font-black uppercase tracking-[0.12em] text-slate-400">OR</span>
              <span className="h-px flex-1 bg-[#1b2235]/20" />
            </div>

            <div className="noir-panel bg-[linear-gradient(120deg,#ffffff_0%,#e6f7ff_100%)] p-4 sm:p-5">
              <p className="text-sm font-black text-slate-900">🧑‍💼 Join a Room</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
                <input
                  value={joinCodeInput}
                  onChange={(event) => setJoinCodeInput(event.target.value)}
                  placeholder="ENTER 6-LETTER CODE"
                  maxLength={6}
                  className="noir-input font-mono text-sm tracking-[0.12em] uppercase"
                />
                <button
                  type="button"
                  onClick={joinRoom}
                  disabled={busy || normalizedJoinCode.length !== 6 || !authUser || !profile}
                  className="noir-btn-ghost px-7 py-2 text-sm"
                >
                  Join →
                </button>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => router.push("/profile")}
                className="noir-btn-ghost w-full px-4 py-2 text-xs"
              >
                Profile Settings
              </button>
              <button
                type="button"
                onClick={() => signOut(auth)}
                className="w-full rounded-full border-3 border-[#1b2235] bg-white px-4 py-2 text-xs font-extrabold uppercase tracking-[0.08em] text-[#d22f67] transition hover:bg-[#fff0f6]"
              >
                Sign Out
              </button>
            </div>
          </div>

          <aside className="noir-panel overflow-hidden p-0">
            <div className="bg-[#1b2235] px-4 py-3">
              <p className="text-sm font-black uppercase tracking-[0.06em] text-white">🏆 Global Top 10</p>
            </div>
            <div className="divide-y-2 divide-[#1b2235]/20 bg-[#fffef7]">
              {topDetectives.length === 0 ? (
                <p className="px-4 py-6 text-sm font-semibold text-slate-500">Loading standings...</p>
              ) : (
                topDetectives.map((entry, index) => (
                  <div key={entry.uid} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-[#1b2235] bg-white text-xs font-black text-slate-900">
                        {index + 1}
                      </span>
                      <Image
                        src={avatarImagePath(entry.avatar)}
                        alt={entry.displayName}
                        width={26}
                        height={26}
                        className="h-6 w-6 rounded-full border-2 border-[#1b2235] object-cover"
                      />
                      <span className="text-sm font-bold text-slate-900">{entry.displayName}</span>
                    </div>
                    <span className={`text-sm font-black ${index === 0 ? "text-[#ff4b8b]" : "text-slate-800"}`}>{entry.score ?? 0}</span>
                  </div>
                ))
              )}
            </div>
            <button
              type="button"
              onClick={() => router.push("/leaderboard")}
              className="w-full border-t-3 border-[#1b2235] bg-white px-4 py-3 text-xs font-black uppercase tracking-[0.08em] text-slate-700"
            >
              View Full Standings
            </button>
          </aside>
        </section>

        {error ? <p className="mt-4 border border-rose-800/40 bg-rose-100 px-4 py-3 text-sm font-semibold text-rose-900">{error}</p> : null}
      </div>
    </main>
  );
}
