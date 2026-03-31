"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { signInWithPopup, onAuthStateChanged, type User, signOut } from "firebase/auth";
import { signInWithRedirect } from "firebase/auth";
import { get, ref, set } from "firebase/database";
import { auth, db, googleProvider } from "@/lib/firebase";
import { AVATARS, COUNTRIES } from "@/lib/game";
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

  const profileReady = useMemo(() => displayName.trim().length >= 2, [displayName]);

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

      setDisplayName(nextUser.displayName ?? "");
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
        displayName: displayName.trim(),
        photoURL: authUser.photoURL ?? "",
        country,
        avatar,
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

  return (
    <main className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_20%_10%,#ffd7a8_0%,#f7f0dd_45%,#d4efe6_100%)] px-4 py-8 sm:px-8">
      <div className="pointer-events-none absolute -left-10 top-16 h-52 w-52 rounded-full bg-amber-300/40 blur-3xl" />
      <div className="pointer-events-none absolute -right-10 bottom-8 h-64 w-64 rounded-full bg-emerald-300/40 blur-3xl" />

      <section className="mx-auto w-full max-w-xl rounded-3xl border border-black/10 bg-white/80 p-6 shadow-2xl backdrop-blur sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-black/60">Internet Multiplayer</p>
        <h1 className="mt-2 text-4xl font-black text-zinc-900">Find the Imposter</h1>
        <p className="mt-3 text-sm text-zinc-700">
          Sign in, set your character profile, then create or join rooms with friends over the internet.
        </p>

        {authLoading ? (
          <div className="mt-6 rounded-2xl bg-zinc-100 px-4 py-5 text-sm text-zinc-700">Checking session...</div>
        ) : !authUser ? (
          <div className="mt-6 space-y-4">
            <button
              type="button"
              onClick={handleGoogleSignIn}
              className="w-full rounded-2xl bg-zinc-900 px-5 py-3 text-lg font-bold text-white transition hover:bg-zinc-800"
            >
              Continue with Google
            </button>
            {error ? <p className="text-sm font-medium text-red-700">{error}</p> : null}
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
              Signed in as <span className="font-bold">{authUser.email ?? authUser.displayName}</span>
            </div>

            <label className="block space-y-1">
              <span className="text-sm font-semibold text-zinc-800">Display name</span>
              <input
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                maxLength={20}
                className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 outline-none ring-emerald-300 transition focus:ring-2"
                placeholder="Your nickname"
              />
            </label>

            <label className="block space-y-1">
              <span className="text-sm font-semibold text-zinc-800">Country</span>
              <select
                value={country}
                onChange={(event) => setCountry(event.target.value)}
                className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 outline-none ring-emerald-300 transition focus:ring-2"
              >
                {COUNTRIES.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>

            <div className="space-y-2">
              <p className="text-sm font-semibold text-zinc-800">Character</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {AVATARS.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setAvatar(item)}
                    className={`rounded-xl border px-3 py-2 text-left text-sm font-semibold transition ${
                      item === avatar
                        ? "border-emerald-600 bg-emerald-100 text-emerald-900"
                        : "border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-100"
                    }`}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={handleSaveProfile}
              disabled={!profileReady || submitting}
              className="w-full rounded-2xl bg-emerald-600 px-5 py-3 text-lg font-bold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? "Saving..." : "Save Profile and Continue"}
            </button>

            <button
              type="button"
              onClick={() => signOut(auth)}
              className="w-full rounded-2xl border border-zinc-300 bg-white px-5 py-3 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-100"
            >
              Sign out
            </button>

            {error ? <p className="text-sm font-medium text-red-700">{error}</p> : null}
          </div>
        )}
      </section>
    </main>
  );
}
