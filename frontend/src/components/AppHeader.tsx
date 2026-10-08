import type { ReactNode } from "react";
import { Link } from "react-router";

import { HeaderControls } from "./HeaderControls";

function CrystalMark() {
  return (
    <svg viewBox="0 0 32 32" className="size-6 shrink-0 text-accent" aria-hidden="true">
      <path
        d="M16 3.5 26 9.5v13L16 28.5 6 22.5v-13z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M16 3.5v25M6 9.5 16 15.5 26 9.5M6 22.5 16 16.5l10 6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
        opacity=".7"
      />
    </svg>
  );
}

export function AppHeader({ actions }: { actions?: ReactNode }) {
  return (
    <header className="sticky top-0 z-10 transform-gpu border-b border-border/60 bg-background/80 backdrop-blur">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <Link
          to="/"
          className="flex min-w-0 items-center gap-2 rounded-lg text-lg font-semibold tracking-tight focus-visible:ring-2 focus-visible:ring-accent"
        >
          <CrystalMark />
          <span className="font-display truncate text-xl">halite</span>
        </Link>
        <div className="flex shrink-0 items-center gap-1.5">
          <HeaderControls />
          {actions}
        </div>
      </div>
    </header>
  );
}
