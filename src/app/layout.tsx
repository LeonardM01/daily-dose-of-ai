import "~/styles/globals.css";

import { type Metadata } from "next";
import { Geist } from "next/font/google";

import { PlayerBottomSpacer, PersistentBriefingMiniPlayer } from "~/app/_components/briefing-audio-player";
import { BriefingAudioProvider } from "~/app/_components/briefing-audio-provider";
import { SiteHeader } from "~/app/_components/site-header";
import { TRPCReactProvider } from "~/trpc/react";

export const metadata: Metadata = {
  title: "Daily Dose of AI",
  description: "Five- to seven-minute daily AI and tech audio briefings.",
  icons: [{ rel: "icon", url: "/favicon.ico" }],
};

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geist.variable}`}>
      <body className="bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
        <TRPCReactProvider>
          <BriefingAudioProvider>
            <SiteHeader />
            {children}
            <PlayerBottomSpacer />
            <PersistentBriefingMiniPlayer />
          </BriefingAudioProvider>
        </TRPCReactProvider>
      </body>
    </html>
  );
}
