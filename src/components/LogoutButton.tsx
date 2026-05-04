"use client";
import { useRouter } from "next/navigation";

export default function LogoutButton() {
  const router = useRouter();
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }
  return (
    <button onClick={logout} className="ml-2 px-3 py-1.5 rounded-md text-ink-3 hover:text-ink text-sm">
      Sign out
    </button>
  );
}
