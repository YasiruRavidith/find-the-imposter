"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { get, ref, remove, update } from "firebase/database";
import { auth, db } from "@/lib/firebase";
import { avatarImagePath, AVATARS, COUNTRIES, resolveAvatarFile, resolveCountry } from "@/lib/game";
import type { UserProfile } from "@/lib/types";

function getGoogleName(user: User): string {
  if (user.displayName && user.displayName.trim().length > 0) {
    return user.displayName.trim();
  }

  const email = user.email ?? "";
  const beforeAt = email.split("@")[0]?.trim();
  return beforeAt && beforeAt.length > 0 ? beforeAt : user.uid;
}

export default function ProfilePage() {
  const router = useRouter();

  const [authUser, setAuthUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [displayName, setDisplayName] = useState("");
  const [country, setCountry] = useState(COUNTRIES[0]);
  const [avatar, setAvatar] = useState(AVATARS[0]);
  const [score, setScore] = useState(0);
  const [createdAt, setCreatedAt] = useState(Date.now());

  const [deleteConfirmInput, setDeleteConfirmInput] = useState("");

  const trimmedName = useMemo(() => displayName.trim(), [displayName]);
  const nameTooLong = trimmedName.length > 12;
  const profileReady = trimmedName.length >= 2 && !nameTooLong;
  const currentAvatarIndex = useMemo(() => {
    const index = AVATARS.indexOf(avatar);
    return index >= 0 ? index : 0;
  }, [avatar]);

  const googleName = useMemo(() => (authUser ? getGoogleName(authUser) : ""), [authUser]);
  const deleteAllowed = useMemo(
    () => deleteConfirmInput.trim().toLowerCase() === googleName.trim().toLowerCase(),
    [deleteConfirmInput, googleName],
  );

  function selectPreviousAvatar() {
    const nextIndex = (currentAvatarIndex - 1 + AVATARS.length) % AVATARS.length;
    setAvatar(AVATARS[nextIndex]);
  }

  function selectNextAvatar() {
    const nextIndex = (currentAvatarIndex + 1) % AVATARS.length;
    setAvatar(AVATARS[nextIndex]);
  }

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

      const profile = profileSnap.val() as UserProfile;
      setDisplayName(profile.displayName ?? "");
      setCountry(resolveCountry(profile.country));
      setAvatar(resolveAvatarFile(profile.avatar));
      setScore(profile.score ?? 0);
      setCreatedAt(profile.createdAt ?? Date.now());
      setLoading(false);
    });

    return () => unsubscribe();
  }, [router]);

  async function handleSaveProfile() {
    if (!authUser || !profileReady) {
      return;
    }

    setBusy(true);
    setError("");
    setSuccess("");

    try {
      await update(ref(db, `users/${authUser.uid}`), {
        displayName: trimmedName,
        country: resolveCountry(country),
        avatar: resolveAvatarFile(avatar),
      });
      setSuccess("Profile updated successfully.");
    } catch {
      setError("Could not update profile. Check database permissions.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteProfile() {
    if (!authUser || !deleteAllowed) {
      return;
    }

    setBusy(true);
    setError("");

    try {
      await remove(ref(db, `users/${authUser.uid}`));
      await signOut(auth);
      router.replace("/");
    } catch {
      setError("Could not delete profile. Please try again.");
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <main className="noir-shell">
        <section className="noir-frame max-w-4xl p-6">
          <p className="text-sm font-semibold uppercase tracking-[0.08em] text-slate-700">Loading profile...</p>
        </section>
      </main>
    );
  }

  return (
    <main className="noir-shell">
      <section className="noir-frame max-w-5xl space-y-5 p-4 sm:p-6">
        <header className="noir-divider pb-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="noir-label">Agent Configuration</p>
            <p className="noir-screen-id">Screen ID: N-005 Profile</p>
          </div>
          <h1 className="noir-title mt-1 text-3xl font-bold sm:text-5xl">Profile Settings</h1>
          <p className="mt-2 text-sm text-slate-700">
            Edit your in-game profile details and avatar. Deleting profile requires your Google username.
          </p>
        </header>

        <section className="grid gap-4 lg:grid-cols-[1.05fr_1fr]">
          <div className="noir-panel p-4 sm:p-5">
            <p className="noir-label">Identity</p>
            <p className="mt-2 text-sm text-slate-700">
              Google username: <span className="font-bold text-slate-900">{googleName}</span>
            </p>
            <p className="mt-1 text-sm text-slate-700">Current score: {score}</p>
            <p className="text-xs text-slate-500">Profile created: {new Date(createdAt).toLocaleDateString()}</p>

            <label className="mt-4 block space-y-1">
              <span className="text-xs font-bold uppercase tracking-[0.08em] text-slate-700">In-game name</span>
              <input
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                maxLength={12}
                className={`noir-input ${nameTooLong ? "border-[#d63672] text-[#a21f4a]" : ""}`}
                placeholder="Detective alias"
              />
              <div className="mt-1 flex items-center justify-between">
                <span className="text-[11px] font-semibold text-slate-500">2-12 characters</span>
                <span className="text-[11px] font-bold text-slate-500">{trimmedName.length}/12</span>
              </div>
              {nameTooLong ? (
                <p className="mt-1 text-xs font-bold text-[#d22f67]">Username must be 12 characters or fewer.</p>
              ) : null}
            </label>

            <label className="mt-3 block space-y-1">
              <span className="text-xs font-bold uppercase tracking-[0.08em] text-slate-700">Country</span>
              <select value={country} onChange={(event) => setCountry(event.target.value)} className="noir-input">
                {COUNTRIES.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>

            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={handleSaveProfile}
                disabled={!profileReady || busy}
                className="noir-btn px-4 py-2.5 text-xs sm:text-sm"
              >
                {busy ? "Saving..." : "Save Profile"}
              </button>
              <button
                type="button"
                onClick={() => router.push("/dashboard")}
                className="noir-btn-ghost px-4 py-2.5 text-xs"
              >
                Back To Dashboard
              </button>
            </div>

            {success ? <p className="mt-3 text-sm font-semibold text-[#166b41]">{success}</p> : null}
            {error ? <p className="mt-3 text-sm font-semibold text-[#a21f4a]">{error}</p> : null}
          </div>

          <div className="noir-panel p-4 sm:p-5">
            <p className="noir-label">Avatar Selection</p>
            <div className="mt-3 rounded-2xl border-3 border-[#1b2235] bg-[linear-gradient(180deg,#ffffff_0%,#eff8ff_100%)] p-4">
              <div className="flex items-center justify-center gap-4 sm:gap-5">
                <button
                  type="button"
                  onClick={selectPreviousAvatar}
                  className="flex h-11 w-11 items-center justify-center rounded-full border-3 border-[#1b2235] bg-white text-3xl font-black text-[#1b2235] shadow-[0_4px_0_rgba(27,34,53,0.2)]"
                  aria-label="Previous avatar"
                >
                  ‹
                </button>
                <div className="h-34 w-34 overflow-hidden rounded-full border-4 border-[#1b2235] bg-white shadow-[0_6px_0_rgba(27,34,53,0.22)] sm:h-40 sm:w-40">
                  <Image
                    src={avatarImagePath(avatar)}
                    alt={avatar.replace(".png", "")}
                    width={600}
                    height={600}
                    className="h-full w-full scale-[1.3] object-cover"
                  />
                </div>
                <button
                  type="button"
                  onClick={selectNextAvatar}
                  className="flex h-11 w-11 items-center justify-center rounded-full border-3 border-[#1b2235] bg-white text-3xl font-black text-[#1b2235] shadow-[0_4px_0_rgba(27,34,53,0.2)]"
                  aria-label="Next avatar"
                >
                  ›
                </button>
              </div>
              <p className="mt-3 text-center text-xs font-bold text-slate-400">Tap arrows to swap</p>
              <p className="mt-1 text-center text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
                {currentAvatarIndex + 1} / {AVATARS.length}
              </p>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
              {AVATARS.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setAvatar(item)}
                  className={`relative rounded-2xl border-3 p-1.5 transition ${
                    item === avatar ? "border-[#1b2235] bg-[#e2f6ff]" : "border-[#1b2235]/45 bg-white hover:bg-[#fff1f7]"
                  }`}
                  aria-label={`Choose avatar ${item.replace(".png", "")}`}
                >
                  <Image
                    src={avatarImagePath(item)}
                    alt={item.replace(".png", "")}
                    width={72}
                    height={72}
                    className="mx-auto h-14 w-14 rounded-full border-2 border-[#1b2235] object-cover sm:h-16 sm:w-16"
                  />
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="noir-panel border-[#d22f67] bg-[#fff2f7] p-4 sm:p-5">
          <p className="text-xs font-extrabold uppercase tracking-widest text-[#b1224f]">Danger Zone</p>
          <p className="mt-2 text-sm text-[#7f1f40]">
            Delete your profile permanently. To confirm, type your Google username exactly:
            <span className="ml-1 font-bold">{googleName}</span>
          </p>
          <input
            value={deleteConfirmInput}
            onChange={(event) => setDeleteConfirmInput(event.target.value)}
            className="noir-input mt-3"
            placeholder="Type your Google username"
          />
          <button
            type="button"
            onClick={handleDeleteProfile}
            disabled={!deleteAllowed || busy}
            className="mt-3 w-full rounded-full border-3 border-[#8f173f] bg-[#d22f67] px-4 py-2 text-sm font-extrabold uppercase tracking-[0.08em] text-white transition hover:brightness-95 disabled:opacity-50"
          >
            Delete Profile
          </button>
          <p className="mt-2 text-xs text-[#8f1f42]">This checks your Google account name, not your in-game name.</p>
        </section>
      </section>
    </main>
  );
}
