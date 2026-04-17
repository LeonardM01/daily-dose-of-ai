"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Icon } from "~/app/_components/icon";

export function SiteHeader() {
  const pathname = usePathname();
  const isBriefings = pathname === "/";
  const isTrending = pathname.startsWith("/trending");

  const pillBase =
    "inline-flex items-center justify-center gap-2 rounded-full px-3 py-2 text-sm font-medium transition-colors sm:px-3.5";
  const pillActive =
    "bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300";
  const pillInactive =
    "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800";

  return (
    <header className="sticky top-0 z-40 border-b border-neutral-200/90 bg-white/85 backdrop-blur-md dark:border-neutral-800/90 dark:bg-neutral-950/85">
      <div className="mx-auto flex h-14 max-w-3xl items-center justify-between gap-3 px-4">
        <Link
          href="/"
          className="flex min-w-0 items-center gap-2.5 rounded-lg outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-500"
        >
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-violet-600 to-fuchsia-600 text-sm font-bold text-white shadow-sm ring-1 ring-violet-600/30"
            aria-hidden
          >
            D
          </span>
          <span className="hidden truncate font-semibold tracking-tight text-neutral-900 dark:text-neutral-100 sm:inline">
            Daily Dose of AI
          </span>
        </Link>

        <nav className="flex shrink-0 items-center gap-1.5 sm:gap-2" aria-label="Main">
          <Link
            href="/"
            className={`${pillBase} ${isBriefings ? pillActive : pillInactive}`}
            aria-current={isBriefings ? "page" : undefined}
          >
            <Icon name="play" className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline">Briefings</span>
          </Link>
          <Link
            href="/trending"
            className={`${pillBase} ${isTrending ? pillActive : pillInactive}`}
            aria-current={isTrending ? "page" : undefined}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- tiny local SVGs; user preference for <img>. */}
            <img
              src={
                isTrending
                  ? "/icons/trending-active.svg"
                  : "/icons/trending.svg"
              }
              alt=""
              width={16}
              height={16}
              className="h-4 w-4 shrink-0"
              aria-hidden
            />
            <span className="hidden sm:inline">Trending</span>
          </Link>
        </nav>
      </div>
    </header>
  );
}
