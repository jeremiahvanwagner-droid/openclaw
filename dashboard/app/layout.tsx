import "./globals.css";
import type { Metadata } from "next";
import { ConnectionStatus } from "./connection-status";

export const metadata: Metadata = {
  title: "OpenClaw Agent Dashboard",
  description: "Monitor the OpenClaw 10-business GHL portfolio for Truth J Blue LLC",
};

function Nav() {
  return (
    <nav className="bg-slate-900 border-b border-slate-700/50 px-6 py-4">
      <div className="flex items-center justify-between max-w-7xl mx-auto">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🦀</span>
          <span className="font-bold text-xl text-white">OpenClaw</span>
          <span className="text-slate-400 text-sm ml-2">Agent Network</span>
        </div>
        <div className="flex items-center gap-6 text-sm">
          <a href="/" className="text-white hover:text-claw-400 transition">Dashboard</a>
          <a href="/agents" className="text-slate-400 hover:text-white transition">Agents</a>
          <a href="/events" className="text-slate-400 hover:text-white transition">Events</a>
          <a href="/costs" className="text-slate-400 hover:text-white transition">Costs</a>
          <a href="/scope-governor" className="text-slate-400 hover:text-white transition">Scope</a>
          <a href="/integrations" className="text-slate-400 hover:text-white transition">Integrations</a>
          <a href="/compliance" className="text-slate-400 hover:text-white transition">Compliance</a>
          <a href="/revenue-ops" className="text-slate-400 hover:text-white transition">Revenue</a>
          <a href="/journey" className="text-slate-400 hover:text-white transition">Journey</a>
          <a href="/command-center" className="text-slate-400 hover:text-white transition">Command</a>
          <a href="/ghl-builder" className="text-slate-400 hover:text-white transition">GHL Build</a>
          <a href="/experiments" className="text-slate-400 hover:text-white transition">Experiments</a>
          <a href="/campaigns" className="text-slate-400 hover:text-white transition">Campaigns</a>
          <a href="/offers" className="text-slate-400 hover:text-white transition">Offers</a>
          <div className="flex items-center gap-2 ml-4 pl-4 border-l border-slate-700">
            <ConnectionStatus />
          </div>
        </div>
      </div>
    </nav>
  );
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <Nav />
        <main className="max-w-7xl mx-auto px-6 py-8">
          {children}
        </main>
      </body>
    </html>
  );
}
