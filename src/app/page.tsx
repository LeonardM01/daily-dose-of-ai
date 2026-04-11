import { BriefingDashboard } from "~/app/_components/briefing-dashboard";

export default async function Home() {
  return (
    <main className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
      <BriefingDashboard />
    </main>
  );
}
