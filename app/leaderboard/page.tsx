"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { onValue, ref } from "firebase/database";
import { auth, db } from "@/lib/firebase";
import { avatarImagePath, resolveCountry } from "@/lib/game";
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
    <main className="noir-shell">
      <section className="noir-frame max-w-5xl p-4 sm:p-6">
        <div className="noir-divider flex flex-wrap items-center justify-between gap-3 pb-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="noir-label">Global Agency Roster</p>
              <span className="noir-screen-id">Screen ID: N-004 Roster</span>
            </div>
            <h1 className="noir-title mt-1 text-3xl font-bold sm:text-5xl">Top Detectives</h1>
          </div>
          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            className="noir-btn-ghost px-4 py-2 text-sm uppercase tracking-[0.08em]"
          >
            Return To Briefing
          </button>
        </div>

        <div className="mt-5 overflow-x-auto noir-panel">
          <table className="min-w-160 w-full text-left text-sm">
            <thead className="bg-[#ffe9f2] text-slate-800">
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
                  <td colSpan={5} className="px-4 py-5 text-slate-600">
                    No scores yet.
                  </td>
                </tr>
              ) : (
                sortedUsers.map((user, index) => (
                  <tr key={user.uid} className="border-t border-[#1b2235]/25 text-slate-800 odd:bg-white even:bg-[#f1f8ff]">
                    <td className="px-4 py-3 font-bold">{index + 1}</td>
                    <td className="px-4 py-3">{user.displayName}</td>
                    <td className="px-4 py-3">
                      <div className="h-8 w-8 overflow-hidden rounded-full border-2 border-[#1b2235] bg-white">
                        <Image
                          src={avatarImagePath(user.avatar)}
                          alt={user.displayName}
                          width={32}
                          height={32}
                          className="h-full w-full scale-[1.3] object-cover"
                        />
                      </div>
                    </td>
                    <td className="px-4 py-3">{resolveCountry(user.country)}</td>
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
