import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="border-b border-neutral-200 bg-white/80 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/80">
      <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
        <Link href="/" className="font-semibold text-violet-700 dark:text-violet-400">
          Daily Dose of AI
        </Link>
        <nav className="flex items-center gap-5 text-sm">
          <Link
            href="/trending"
            className="text-neutral-600 hover:text-violet-700 dark:text-neutral-300 dark:hover:text-violet-400"
          >
            Trending
          </Link>
          <span className="hidden text-neutral-500 md:inline">
            Daily AI and tech news, ready to listen
          </span>
        </nav>
      </div>
    </header>
  );
}
