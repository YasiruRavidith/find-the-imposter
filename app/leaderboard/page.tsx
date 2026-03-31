"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { onValue, ref } from "firebase/database";
import { auth, db } from "@/lib/firebase";
import type { UserProfile } from "@/lib/types";

export default function LeaderboardPage() {
  const router = useRouter();
  const [users, setUsers] = useState<UserProfile[]>([]);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (nextUser) => {
      if (!nextUser) {
        router.replace("/");
      }
    });

    const usersRef = ref(db, "users");
    const unsubscribeUsers = onValue(usersRef, (snapshot) => {
      if (!snapshot.exists()) {
        setUsers([]);
        return;
      }

      const value = snapshot.val() as Record<string, UserProfile>;
      setUsers(Object.values(value));
    });

    return () => {
      unsubscribeAuth();
      unsubscribeUsers();
    };
  }, [router]);

  const sortedUsers = useMemo(
    () => [...users].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, 50),
    [users],
  );

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_15%_20%,_#d1fae5_0%,_#f4f4cf_45%,_#fee2e2_100%)] px-4 py-8 sm:px-8">
      <section className="mx-auto w-full max-w-3xl rounded-3xl border border-black/10 bg-white/85 p-6 shadow-xl backdrop-blur sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-zinc-600">Global</p>
            <h1 className="mt-1 text-4xl font-black text-zinc-900">Leaderboard</h1>
          </div>
          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            className="rounded-xl border border-zinc-300 bg-white px-4 py-2 font-semibold text-zinc-800 transition hover:bg-zinc-100"
          >
            Back to Dashboard
          </button>
        </div>

        <div className="mt-6 overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-50">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-100 text-zinc-700">
              <tr>
                <th className="px-4 py-3 font-bold">#</th>
                <th className="px-4 py-3 font-bold">Player</th>
                <th className="px-4 py-3 font-bold">Avatar</th>
                <th className="px-4 py-3 font-bold">Country</th>
                <th className="px-4 py-3 font-bold">Score</th>
              </tr>
            </thead>
            <tbody>
              {sortedUsers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-5 text-zinc-600">
                    No scores yet.
                  </td>
                </tr>
              ) : (
                sortedUsers.map((user, index) => (
                  <tr key={user.uid} className="border-t border-zinc-200 text-zinc-800">
                    <td className="px-4 py-3 font-bold">{index + 1}</td>
                    <td className="px-4 py-3">{user.displayName}</td>
                    <td className="px-4 py-3">{user.avatar}</td>
                    <td className="px-4 py-3">{user.country}</td>
                    <td className="px-4 py-3 font-bold">{user.score ?? 0}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
