import { Icon } from "~/app/_components/icon";

export function SiteFooter() {
  return (
    <footer className="border-t border-neutral-200 bg-white/60 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/60">
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-4 px-4 py-8 sm:flex-row sm:justify-between">
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          &copy; {new Date().getFullYear()} Leonard Martinis. All rights
          reserved.
        </p>

        <nav className="flex items-center gap-5">
          <a
            href="https://github.com/LeonardM01"
            target="_blank"
            rel="noopener noreferrer"
            className="text-neutral-500 transition hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
            aria-label="GitHub"
          >
            <Icon name="github" className="h-5 w-5" />
          </a>
          <a
            href="https://www.linkedin.com/in/leonard-martinis/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-neutral-500 transition hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
            aria-label="LinkedIn"
          >
            <Icon name="linkedin" className="h-5 w-5" />
          </a>
          <a
            href="https://leonardmartinis.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium text-neutral-500 transition hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
          >
            Blog
          </a>
        </nav>
      </div>
    </footer>
  );
}
