"use client";

import { useEffect, useState } from "react";
import { supabase } from "./supabase";

export function ConnectionStatus() {
  const [status, setStatus] = useState<"checking" | "connected" | "disconnected">("checking");

  useEffect(() => {
    async function check() {
      if (!supabase) {
        setStatus("disconnected");
        return;
      }
      const { error } = await supabase.from("agents").select("agent_id", { count: "exact", head: true });
      setStatus(error ? "disconnected" : "connected");
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
