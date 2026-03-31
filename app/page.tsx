"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { signInWithPopup, onAuthStateChanged, type User, signOut } from "firebase/auth";
import { signInWithRedirect } from "firebase/auth";
import { get, ref, set } from "firebase/database";
import { auth, db, googleProvider } from "@/lib/firebase";
import { avatarImagePath, AVATARS, COUNTRIES, resolveAvatarFile, resolveCountry } from "@/lib/game";
import type { UserProfile } from "@/lib/types";

export default function Home() {
  const router = useRouter();

  const [authLoading, setAuthLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [error, setError] = useState("");

  const [displayName, setDisplayName] = useState("");
  const [country, setCountry] = useState(COUNTRIES[0]);
  const [avatar, setAvatar] = useState(AVATARS[0]);

  const trimmedName = useMemo(() => displayName.trim(), [displayName]);
  const nameTooLong = trimmedName.length > 12;
  const profileReady = useMemo(() => trimmedName.length >= 2 && !nameTooLong, [nameTooLong, trimmedName]);
  const currentAvatarIndex = useMemo(() => {
    const index = AVATARS.indexOf(avatar);
    return index >= 0 ? index : 0;
  }, [avatar]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (nextUser) => {
      setAuthUser(nextUser);
      setError("");

      if (!nextUser) {
        setAuthLoading(false);
        return;
      }

      const userRef = ref(db, `users/${nextUser.uid}`);
      const snapshot = await get(userRef);

      if (snapshot.exists()) {
        const profile = snapshot.val() as Partial<UserProfile>;
        if (profile.country && profile.avatar && profile.displayName) {
          router.replace("/dashboard");
          return;
        }
      }

      setDisplayName((nextUser.displayName ?? "").slice(0, 12));
      setAuthLoading(false);
    });

    return () => unsubscribe();
  }, [router]);

  async function handleGoogleSignIn() {
    setError("");
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (caughtError) {
      const firebaseCode =
        typeof caughtError === "object" && caughtError && "code" in caughtError
          ? String((caughtError as { code?: unknown }).code)
          : "unknown";

      if (firebaseCode === "auth/popup-blocked" || firebaseCode === "auth/cancelled-popup-request") {
        try {
          await signInWithRedirect(auth, googleProvider);
          return;
        } catch (redirectError) {
          const redirectCode =
            typeof redirectError === "object" && redirectError && "code" in redirectError
              ? String((redirectError as { code?: unknown }).code)
              : "unknown";
          setError(`Google sign-in failed (${redirectCode}). Check Firebase auth settings and authorized domains.`);
          return;
        }
      }

      setError(`Google sign-in failed (${firebaseCode}). Check Firebase auth settings and authorized domains.`);
    }
  }

  async function handleSaveProfile() {
    if (!authUser || !profileReady) {
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const profile: UserProfile = {
        uid: authUser.uid,
        displayName: trimmedName,
        photoURL: authUser.photoURL ?? "",
        country: resolveCountry(country),
        avatar: resolveAvatarFile(avatar),
        score: 0,
        createdAt: Date.now(),
      };

      await set(ref(db, `users/${authUser.uid}`), profile);
      router.replace("/dashboard");
    } catch {
      setError("Could not save profile. Check Firebase Realtime Database rules.");
    } finally {
      setSubmitting(false);
    }
  }

  function selectPreviousAvatar() {
    const nextIndex = (currentAvatarIndex - 1 + AVATARS.length) % AVATARS.length;
    setAvatar(AVATARS[nextIndex]);
  }

  function selectNextAvatar() {
    const nextIndex = (currentAvatarIndex + 1) % AVATARS.length;
    setAvatar(AVATARS[nextIndex]);
  }

  return (
    <main className="noir-shell">
      <section className="noir-frame max-w-4xl p-4 sm:p-8">
        <div className="noir-divider pb-4 sm:pb-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="noir-label">The Agency</p>
            <p className="noir-screen-id">Screen ID: N-001 Intake</p>
          </div>
          <h1 className="noir-title mt-2 text-4xl font-bold sm:text-6xl">Find The Imposter</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600 sm:text-base">
            Authenticate, assemble your detective profile, and enter live case rooms with players over the internet.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="noir-chip">Classic Noir</span>
            <span className="noir-chip">Realtime Multiplayer</span>
          </div>
        </div>

        {authLoading ? (
          <div className="noir-panel-muted mt-6 p-4 text-sm text-slate-700">Verifying credentials...</div>
        ) : !authUser ? (
          <div className="mt-6 space-y-4">
            <button
              type="button"
              onClick={handleGoogleSignIn}
              className="noir-btn w-full px-5 py-3 text-sm sm:text-base"
            >
              Authenticate Via Google
            </button>
            {error ? <p className="text-sm font-semibold text-red-800">{error}</p> : null}
          </div>
        ) : (
          <div className="mx-auto mt-6 w-full max-w-5xl">
            <div className="noir-panel p-4 sm:p-8">
              <div className="mb-6 text-center sm:mb-8">
                <h2 className="text-3xl font-black text-slate-900 sm:text-5xl">Create Profile</h2>
                <p className="mt-1 text-sm font-semibold text-slate-500 sm:text-base">Get ready to jump in!</p>
              </div>

              <div className="grid gap-6 md:grid-cols-[0.95fr_1px_1.25fr] md:items-center md:gap-8">
                <div className="flex flex-col items-center justify-center">
                  <div className="flex items-center gap-4 sm:gap-6">
                    <button
                      type="button"
                      onClick={selectPreviousAvatar}
                      className="h-12 w-12 rounded-full border-3 border-[#1b2235] bg-white text-3xl font-black leading-none text-[#1b2235] shadow-[0_4px_0_rgba(27,34,53,0.2)]"
                      aria-label="Previous avatar"
                    >
                      ‹
                    </button>

                    <div className="h-32 w-32 overflow-hidden rounded-full border-4 border-[#1b2235] bg-white shadow-[0_6px_0_rgba(27,34,53,0.22)] sm:h-40 sm:w-40">
                      <div className="h-full w-full overflow-hidden rounded-full">
                        <Image
                          src={avatarImagePath(avatar)}
                          alt={avatar.replace(".png", "")}
                          width={600}
                          height={600}
                          className="h-full w-full scale-[1.3] object-cover"
                        />
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={selectNextAvatar}
                      className="h-12 w-12 rounded-full border-3 border-[#1b2235] bg-white text-3xl font-black leading-none text-[#1b2235] shadow-[0_4px_0_rgba(27,34,53,0.2)]"
                      aria-label="Next avatar"
                    >
                      ›
                    </button>
                  </div>

                  <p className="mt-4 text-xs font-bold text-slate-400">Tap arrows to swap</p>
                  <p className="mt-1 text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
                    {currentAvatarIndex + 1} / {AVATARS.length}
                  </p>
                </div>

                <div className="mx-auto hidden h-full min-h-55 w-px bg-[#1b2235] md:block" />

                <div>
                  <label className="block">
                    <input
                      value={displayName}
                      onChange={(event) => setDisplayName(event.target.value)}
                      maxLength={12}
                      className={`noir-input bg-[#f4f4f7] text-center text-xl font-black uppercase tracking-[0.03em] placeholder:font-extrabold placeholder:text-slate-400 sm:text-2xl ${nameTooLong ? "border-[#ff4b8b] text-[#a21f4a]" : ""}`}
                      placeholder="ENTER USERNAME"
                    />
                  </label>

                  <label className="mt-4 block">
                    <div className="relative">
                      
                      <select
                        value={country}
                        onChange={(event) => setCountry(event.target.value)}
                        className="noir-input bg-white pl-12 text-lg font-bold text-slate-900 sm:text-xl"
                      >
                        {COUNTRIES.map((item) => (
                          <option key={item} value={item}>
                            {item}
                          </option>
                        ))}
                      </select>
                    </div>
                  </label>

                  {nameTooLong ? (
                    <div className="mt-4 rounded-full border-2 border-[#ff4b8b] bg-[#fff6fa] px-4 py-3 text-center">
                      <p className="text-lg font-black uppercase tracking-[0.02em] text-[#ff4b8b] sm:text-xl">{trimmedName}</p>
                      <p className="mt-1 text-xs font-bold text-[#ff4b8b]">Username must be under 12 characters!</p>
                    </div>
                  ) : (
                    <p className="mt-3 text-right text-xs font-bold text-slate-400">{trimmedName.length}/12</p>
                  )}

                  <div className="mt-6 grid gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={handleSaveProfile}
                      disabled={!profileReady || submitting}
                      className="noir-btn bg-[linear-gradient(180deg,#25c6f7_0%,#13aae0_100%)] px-4 py-3 text-sm"
                    >
                      {submitting ? "Saving..." : "Save Profile →"}
                    </button>
                    <button
                      type="button"
                      onClick={() => signOut(auth)}
                      className="noir-btn-ghost px-4 py-3 text-sm uppercase tracking-[0.08em] text-slate-700"
                    >
                      Sign Out
                    </button>
                  </div>

                  <p className="mt-4 text-xs text-slate-500">
                    Signed in as <span className="font-bold text-slate-900">{authUser.email ?? authUser.displayName}</span>
                  </p>
                  {error ? <p className="mt-2 text-sm font-semibold text-red-800">{error}</p> : null}
                </div>
              </div>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
