import { TrendingDashboard } from "~/app/_components/trending-dashboard";

export const metadata = {
  title: "Trending — Daily Dose of AI",
  description:
    "Daily snapshot of what's trending in tech on Hacker News, Reddit, Product Hunt, and GitHub.",
};

export default function TrendingPage() {
  return (
    <main className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
      <TrendingDashboard />
    </main>
  );
}
