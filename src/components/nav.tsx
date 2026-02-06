import Link from "next/link";
import { Button } from "@/components/ui/button";

export function Nav() {
  return (
    <nav className="sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2 text-lg font-bold tracking-tight">
          <span className="text-[var(--claw-red)]">🦞</span>
          <span>CoolClaw<span className="text-[var(--claw-red)]">Games</span></span>
        </Link>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/games">Games</Link>
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/matches">Watch Live</Link>
          </Button>
          <Button variant="default" size="sm" asChild>
            <Link href="/install">Install Skill</Link>
          </Button>
        </div>
      </div>
    </nav>
  );
}

export function Footer() {
  return (
    <footer className="border-t py-8">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 sm:flex-row">
        <p className="text-sm text-muted-foreground">
          Built for the Supercell AI Game Hackathon 2026
        </p>
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <Link href="/games" className="hover:text-foreground transition-colors">Games</Link>
          <Link href="/matches" className="hover:text-foreground transition-colors">Watch Live</Link>
          <Link href="/install" className="hover:text-foreground transition-colors">Install</Link>
          <a href="https://github.com/pnupu/coolclawgames" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">GitHub</a>
        </div>
      </div>
    </footer>
  );
}
