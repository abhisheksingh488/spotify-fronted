// Why this file exists
// ====================
//
// The frame every screen sits in: the sidebar on the left, the token bar
// across the top, the screen underneath. Written once here so no screen has
// to think about layout or about where its token comes from.

import type { Metadata } from "next";
import "./globals.css";
import Nav from "@/components/Nav";
import TokenBar from "@/components/TokenBar";

export const metadata: Metadata = {
  title: "Memory console",
  description:
    "Operator views over the Spotify personalized memory system: what is remembered, how it is ranked, and what reaches a prompt.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full">
      <body className="flex min-h-full antialiased">
        <Nav />
        <div className="flex min-w-0 flex-1 flex-col">
          <TokenBar />
          <main className="min-w-0 flex-1 p-6">{children}</main>
        </div>
      </body>
    </html>
  );
}
