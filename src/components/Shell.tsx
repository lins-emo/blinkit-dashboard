import Link from "next/link";
import LogoutButton from "./LogoutButton";
import NavLink from "./NavLink";

export default function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-bg">
      <header className="border-b border-line bg-surface/85 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-[1400px] mx-auto px-6 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="h-7 w-7 rounded-md bg-accent flex items-center justify-center transition group-hover:brightness-95">
              <span className="text-accent-ink font-bold text-sm">b</span>
            </div>
            <div className="leading-tight">
              <div className="text-sm font-semibold text-ink">Blinkit Fleet</div>
              <div className="text-[10px] text-ink-3 uppercase tracking-wider">Emo · ops</div>
            </div>
          </Link>
          <nav className="flex items-center gap-0.5 text-sm">
            <NavLink href="/">Overview</NavLink>
            <NavLink href="/riders">Riders</NavLink>
            <LogoutButton />
          </nav>
        </div>
      </header>
      <main className="max-w-[1400px] mx-auto px-6 py-6">{children}</main>
    </div>
  );
}
