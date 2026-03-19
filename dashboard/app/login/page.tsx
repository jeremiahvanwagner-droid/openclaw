"use client";

import { useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey)
  : null;

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"password" | "magic-link">("magic-link");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    if (!supabase) {
      setError("Supabase is not configured");
      setLoading(false);
      return;
    }

    if (mode === "password") {
      try {
        const response = await fetch("/api/auth/login", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ email, password }),
        });

        const result = await response.json().catch(() => ({}));

        setLoading(false);

        if (!response.ok) {
          setError(result.error ?? "Unable to sign in.");
          return;
        }

        window.location.href = "/";
      } catch {
        setLoading(false);
        setError("Unable to sign in.");
      }
    } else {
      const { error: authError } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      setLoading(false);

      if (authError) {
        setError(authError.message);
      } else {
        setSent(true);
      }
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950">
      <div className="w-full max-w-sm p-8 bg-slate-900 rounded-xl border border-slate-700/50">
        <div className="text-center mb-8">
          <span className="text-4xl">🦀</span>
          <h1 className="text-2xl font-bold text-white mt-3">OpenClaw</h1>
          <p className="text-slate-400 text-sm mt-1">Agent Network Dashboard</p>
        </div>

        {sent ? (
          <div className="text-center">
            <p className="text-green-400 font-medium">Magic link sent!</p>
            <p className="text-slate-400 text-sm mt-2">
              Check your email for a login link.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm text-slate-400 mb-1">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-md text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-claw-500 focus:border-transparent"
              />
            </div>

            {mode === "magic-link" && (
              <p className="text-xs text-slate-500">
                Magic link is the recommended sign-in path for the hosted dashboard.
              </p>
            )}

            {mode === "password" && (
              <div>
                <label htmlFor="password" className="block text-sm text-slate-400 mb-1">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-md text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-claw-500 focus:border-transparent"
                />
              </div>
            )}

            {error && (
              <p className="text-red-400 text-sm">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2 px-4 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-medium rounded-md transition"
            >
              {loading
                ? "Signing in..."
                : mode === "password"
                ? "Sign In"
                : "Send Magic Link"}
            </button>

            <button
              type="button"
              onClick={() => setMode(mode === "password" ? "magic-link" : "password")}
              className="w-full text-sm text-slate-400 hover:text-slate-300 transition"
            >
              {mode === "password"
                ? "Use magic link instead"
                : "Use password instead"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
