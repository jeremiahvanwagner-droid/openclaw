"use client";

import { useEffect, useState } from "react";

export function ConnectionStatus() {
  const [status, setStatus] = useState<"checking" | "connected" | "disconnected">("checking");

  useEffect(() => {
    async function check() {
      try {
        const response = await fetch("/api/system", { cache: "no-store" });
        if (!response.ok) {
          setStatus("disconnected");
          return;
        }

        const data = (await response.json()) as { connected?: boolean };
        setStatus(data.connected ? "connected" : "disconnected");
      } catch {
        setStatus("disconnected");
      }
    }

    check();
    const interval = setInterval(check, 60000);
    return () => clearInterval(interval);
  }, []);

  const color = status === "connected" ? "bg-green-500" : status === "disconnected" ? "bg-red-500" : "bg-yellow-500";
  const label = status === "connected" ? "Connected" : status === "disconnected" ? "Disconnected" : "Checking...";

  return (
    <>
      <div className={`w-2 h-2 ${color} rounded-full ${status === "connected" ? "animate-pulse" : ""}`}></div>
      <span className="text-slate-400">{label}</span>
    </>
  );
}
