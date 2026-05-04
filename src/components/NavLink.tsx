"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
  return (
    <Link
      href={href}
      className={`relative px-3 py-1.5 rounded-md text-sm transition ${active ? "text-ink font-medium" : "text-ink-3 hover:text-ink hover:bg-bg"}`}
    >
      {children}
      {active && <span className="absolute left-3 right-3 -bottom-[15px] h-[2px] bg-accent rounded-full" />}
    </Link>
  );
}
