"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { get, ref, set } from "firebase/database";
import { auth, db } from "@/lib/firebase";
import { AVATARS, avatarImagePath, generateRoomCode, normalizeRoomCode, resolveCountry } from "@/lib/game";
import type { Room, RoomPlayer, UserProfile } from "@/lib/types";

const SOLO_BOT_NAMES = ["Agent Fox", "Cipher Red", "Ghost 09"];

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
        mode: "multiplayer",
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

  async function createSoloRoom() {
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

      const hostPlayer: RoomPlayer = {
        uid: authUser.uid,
        displayName: profile.displayName,
        country: resolveCountry(profile.country),
        avatar: profile.avatar,
        photoURL: profile.photoURL,
        score: profile.score ?? 0,
        joinedAt: Date.now(),
        isHost: true,
        isBot: false,
      };

      const botPlayers: Record<string, RoomPlayer> = {};
      SOLO_BOT_NAMES.forEach((name, index) => {
        const uid = `bot_${index + 1}`;
        botPlayers[uid] = {
          uid,
          displayName: name,
          country: "🌐 Global Account",
          avatar: AVATARS[(index + 6) % AVATARS.length],
          photoURL: "",
          score: 0,
          joinedAt: Date.now() + index + 1,
          isHost: false,
          isBot: true,
        };
      });

      const room: Room = {
        roomId,
        hostUid: authUser.uid,
        mode: "solo",
        difficulty: "medium",
        status: "lobby",
        createdAt: Date.now(),
        players: {
          [authUser.uid]: hostPlayer,
          ...botPlayers,
        },
        round: null,
      };

      await set(ref(db, `rooms/${roomId}`), room);
      router.push(`/room/${roomId}`);
    } catch {
      setError("Could not create solo room. Verify database permissions and internet connection.");
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

  async function handleSignOut() {
    const confirmed = window.confirm("Are you sure you want to sign out?");
    if (!confirmed) {
      return;
    }

    setBusy(true);
    setError("");

    try {
      await signOut(auth);
    } catch {
      setError("Could not sign out. Please try again.");
      setBusy(false);
    }
  }

  return (
    <main className="noir-shell">
      <div className="mx-auto w-full max-w-6xl px-4 py-4 sm:px-6 sm:py-6">
        <header className="noir-divider pb-5 sm:pb-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-lg">🔺</span>
              <p className="text-sm font-black uppercase tracking-[0.05em] text-slate-900">Imposter Word</p>
            </div>
            <div className="flex items-center">
                {profile ? (
              <div className="hidden items-center gap-3 rounded-full border-3 border-[#1b2235] bg-white px-4 py-2.5 text-sm font-black text-slate-800 shadow-[0_4px_0_rgba(27,34,53,0.18)] md:flex">
                <span className="text-base">🏆</span>
                <span>{resolveCountry(profile.country)}</span>
                <span>|</span>
                <span>{profile.score} PTS</span>
              </div>
            ) : null}
              <button
                type="button"
                onClick={() => router.push("/profile")}
                className="flex items-center gap-3 rounded-full px-2.5 py-1.5 text-sm font-extrabold uppercase tracking-[0.07em] text-slate-900 transition hover:-translate-y-0.5"
                aria-label="Profile settings"
              >
                {profile ? (
                  <div className="h-13 w-13 overflow-hidden rounded-full border-3 border-[#1b2235] bg-white">
                    <Image
                      src={avatarImagePath(profile.avatar)}
                      alt={profile.displayName}
                      width={44}
                      height={44}
                      className="h-full w-full scale-[1.3] object-cover"
                    />
                  </div>
                ) : (
                  <span className="flex h-13 w-13 items-center justify-center rounded-full border-3 border-[#1b2235] bg-[#eef7ff] text-xl">🙂</span>
                )}
                
              </button>
            </div>
          </div>
          <div className="mt-7 flex items-start justify-between gap-4 sm:mt-8">
            <div>
              <h1 className="text-[2.1rem] font-black leading-none text-slate-900 sm:text-[3.2rem]">
                Ready to play,
                <span className="ml-2 text-[#ff4b8b] underline decoration-[#f9c52f] decoration-[3px] underline-offset-[5px]">
                  {profile?.displayName ?? "Detective"}
                </span>
                ?
              </h1>
              <p className="mt-2.5 max-w-120 text-[0.98rem] font-semibold leading-snug text-slate-800 sm:text-[1.15rem]">
                Create a new game room or enter a code to join your friends.
              </p>
            </div>
            
          </div>
        </header>

        <section className="mt-9 grid items-start gap-8 lg:mt-10 lg:grid-cols-[minmax(540px,1fr)_370px] lg:gap-10">
          <div className="max-w-140 space-y-6">
            <button
              type="button"
              onClick={createRoom}
              disabled={busy || !authUser || !profile}
              className="noir-btn h-16 w-full px-6 text-xl leading-none sm:h-19.5 sm:px-7 sm:text-[2rem]"
            >
              {busy ? "Opening..." : "✚ Create Game"}
            </button>
            <button
              type="button"
              onClick={createSoloRoom}
              disabled={busy || !authUser || !profile}
              className="noir-btn-ghost h-14 w-full px-6 text-lg leading-none sm:h-16 sm:px-7 sm:text-xl"
            >
              {busy ? "Preparing..." : "Play Solo (vs AI)"}
            </button>
            <p className="text-center text-sm font-semibold text-slate-500">Host a new game and invite others</p>

            <div className="flex items-center gap-3 py-2">
              <span className="h-px flex-1 bg-[#1b2235]/20" />
              <span className="text-sm font-black uppercase tracking-[0.12em] text-slate-400">OR</span>
              <span className="h-px flex-1 bg-[#1b2235]/20" />
            </div>

            <div className="noir-panel bg-[linear-gradient(120deg,#ffffff_0%,#e6f7ff_100%)] px-5 py-5 sm:px-6 sm:py-6">
              <p className="text-xl font-black text-slate-900 sm:text-2xl">🧑‍💼 Join a Room</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
                <input
                  value={joinCodeInput}
                  onChange={(event) => setJoinCodeInput(event.target.value)}
                  placeholder="ENTER 6-LETTER CODE"
                  maxLength={6}
                  className="noir-input h-14.5 font-mono text-sm tracking-widest uppercase"
                />
                <button
                  type="button"
                  onClick={joinRoom}
                  disabled={busy || normalizedJoinCode.length !== 6 || !authUser || !profile}
                  className="noir-btn-ghost h-14.5 px-9 text-xl"
                >
                  Join →
                </button>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => router.push("/profile")}
                className="noir-btn-ghost w-full px-4 py-2 text-xs  "
              >
                Profile Settings
              </button>
              <button
                type="button"
                onClick={handleSignOut}
                className="w-full rounded-full border-3 border-[#1b2235] bg-white px-4 py-2 text-xs font-extrabold uppercase tracking-[0.08em] text-[#d22f67] transition hover:bg-[#fff0f6] "
              >
                Sign Out
              </button>
            </div>
          </div>

          <aside className="noir-panel self-start overflow-hidden p-0 lg:ml-auto lg:w-90">
            <div className="bg-[#1b2235] px-5 py-4">
              <p className="text-[1.75rem] font-black uppercase leading-none tracking-[0.02em] text-white">🏆 Global Top 10</p>
            </div>
            <div className="divide-y-2 divide-[#1b2235]/20 bg-[#fffef7]">
              {topDetectives.length === 0 ? (
                <p className="px-4 py-6 text-sm font-semibold text-slate-500">Loading standings...</p>
              ) : (
                topDetectives.map((entry, index) => (
                  <div key={entry.uid} className="flex items-center justify-between gap-3 px-5 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-[#1b2235] bg-white text-sm font-black text-slate-900">
                        {index + 1}
                      </span>
                      <div className="h-8 w-8 overflow-hidden rounded-full border-2 border-[#1b2235] bg-white">
                        <Image
                          src={avatarImagePath(entry.avatar)}
                          alt={entry.displayName}
                          width={30}
                          height={30}
                          className="h-full w-full scale-[1.3] object-cover"
                        />
                      </div>
                      <span className="text-[1.08rem] font-bold text-slate-900">{entry.displayName}</span>
                    </div>
                    <span className={`text-[1.12rem] font-black ${index === 0 ? "text-[#ff4b8b]" : "text-slate-800"}`}>{entry.score ?? 0}</span>
                  </div>
                ))
              )}
            </div>
            <button
              type="button"
              onClick={() => router.push("/leaderboard")}
              className="w-full border-t-3 border-[#1b2235] bg-white px-4 py-4 text-sm font-black uppercase tracking-[0.08em] text-slate-700"
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
