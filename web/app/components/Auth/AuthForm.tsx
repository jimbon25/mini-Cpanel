import React from "react";

interface AuthFormProps {
  username: string;
  setUsername: (val: string) => void;
  password: string;
  setPassword: (val: string) => void;
  loading: boolean;
  error: string;
  handleLogin: (e: React.FormEvent) => void;
}

export default function AuthForm({
  username,
  setUsername,
  password,
  setPassword,
  loading,
  error,
  handleLogin,
}: AuthFormProps) {
  return (
    <main className="flex-1 flex flex-col items-center justify-center p-8 font-sans">
      <div className="w-full max-w-sm">
        <div className="mb-10 text-center md:text-left">
          <h1 className="text-2xl font-extrabold tracking-tighter text-foreground">
            mini<span className="text-cobalt font-light font-mono">.cpanel</span>
          </h1>
          <p className="text-xs text-neutral-500 tracking-widest uppercase mt-1 font-mono">
            ADMIN ORCHESTRATION PANEL
          </p>
        </div>

        <form onSubmit={handleLogin} className="flex flex-col gap-6" data-testid="login-form">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-neutral-400 font-mono tracking-wider uppercase">
              Username
            </label>
            <input
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="underline-input text-xs py-1.5 text-foreground"
              placeholder="Enter admin username"
              data-testid="username-input"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-neutral-400 font-mono tracking-wider uppercase">
              Password
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="underline-input text-xs py-1.5 text-foreground"
              placeholder="Enter security key"
              data-testid="password-input"
            />
          </div>

          {error && (
            <div className="text-xs text-red-500 font-mono border-l-2 border-red-500 pl-3 py-1 my-2">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="border border-neutral-200 dark:border-neutral-800 rounded-lg py-2 text-xs bg-transparent hover:bg-cobalt hover:text-white hover:border-cobalt transition-all font-mono tracking-wider disabled:opacity-50"
            data-testid="submit-button"
          >
            {loading ? "AUTHENTICATING..." : "ENTER CONSOLE"}
          </button>
        </form>
      </div>
    </main>
  );
}
