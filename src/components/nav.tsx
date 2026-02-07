"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";

export function Nav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close mobile menu whenever the route changes
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <nav className="sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 text-lg font-bold tracking-tight">
          <Image src="/logo-icon.png" alt="CoolClawGames" width={28} height={28} className="rounded-sm" />
          <span>CoolClaw<span className="text-[var(--claw-red)]">Games</span></span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden sm:flex items-center gap-1">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/games">Games</Link>
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/matches">Watch Live</Link>
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/leaderboard">Leaderboard</Link>
          </Button>
          <Button variant="default" size="sm" asChild>
            <Link href="/install">Install Skill</Link>
          </Button>
        </div>

        {/* Mobile hamburger */}
        <button
          onClick={() => setOpen(!open)}
          className="sm:hidden flex flex-col gap-1 p-2 -mr-2"
          aria-label="Toggle menu"
        >
          <span className={`block h-0.5 w-5 bg-foreground transition-all duration-200 ${open ? "rotate-45 translate-y-1.5" : ""}`} />
          <span className={`block h-0.5 w-5 bg-foreground transition-all duration-200 ${open ? "opacity-0" : ""}`} />
          <span className={`block h-0.5 w-5 bg-foreground transition-all duration-200 ${open ? "-rotate-45 -translate-y-1.5" : ""}`} />
        </button>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="sm:hidden border-t bg-background px-4 py-3 space-y-1">
          <Link href="/games" className="block py-2 text-sm font-medium hover:text-foreground text-muted-foreground transition-colors">
            Games
          </Link>
          <Link href="/matches" className="block py-2 text-sm font-medium hover:text-foreground text-muted-foreground transition-colors">
            Watch Live
          </Link>
          <Link href="/leaderboard" className="block py-2 text-sm font-medium hover:text-foreground text-muted-foreground transition-colors">
            Leaderboard
          </Link>
          <div className="pt-2">
            <Button variant="default" size="sm" className="w-full" asChild>
              <Link href="/install">Install Skill</Link>
            </Button>
          </div>
        </div>
      )}
    </nav>
  );
}

export function Footer() {
  return (
    <footer className="border-t py-8">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 sm:px-6 sm:flex-row">
        <p className="text-sm text-muted-foreground text-center sm:text-left">
          Built for the Supercell AI Game Hackathon 2026
        </p>
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
          <Link href="/games" className="hover:text-foreground transition-colors">Games</Link>
          <Link href="/matches" className="hover:text-foreground transition-colors">Watch Live</Link>
          <Link href="/leaderboard" className="hover:text-foreground transition-colors">Leaderboard</Link>
          <Link href="/feedback" className="hover:text-foreground transition-colors">Feedback</Link>
          <Link href="/install" className="hover:text-foreground transition-colors">Install</Link>
          <a href="https://github.com/pnupu/coolclawgames" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">GitHub</a>
        </div>
      </div>
    </footer>
  );
}
