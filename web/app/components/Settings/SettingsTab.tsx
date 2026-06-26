import React, { useState, useEffect, useCallback } from "react";
import { apiClient } from "@/app/utils/apiClient";
import { useNotification } from "@/app/context/NotificationContext";

interface NotificationChannel {
  channel_type: string;
  webhook_url: string | null;
  bot_token: string | null;
  chat_id: string | null;
  is_active: boolean;
  alert_rules: string | null;
}

interface SettingsTabProps {
  token: string | null;
  addLog: (msg: string) => void;
}

export default function SettingsTab({ token, addLog }: SettingsTabProps) {
  const { showToast } = useNotification();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Telegram settings states
  const [tgToken, setTgToken] = useState("");
  const [tgChatId, setTgChatId] = useState("");
  const [tgActive, setTgActive] = useState(false);
  const [testingTg, setTestingTg] = useState(false);

  // Discord settings states
  const [dcWebhook, setDcWebhook] = useState("");
  const [dcActive, setDcActive] = useState(false);
  const [testingDc, setTestingDc] = useState(false);

  // Proxy settings states
  const [proxyType, setProxyType] = useState("disabled");
  const [proxyLogPath, setProxyLogPath] = useState("");
  const [savingProxy, setSavingProxy] = useState(false);

  const fetchSettings = useCallback(async () => {
    setError("");
    try {
      // 1. Fetch notifications configurations
      const response = await apiClient.fetch("http://localhost:8080/api/v1/notifications", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("Failed to load settings");
      const data: NotificationChannel[] = await response.json();
      
      // Map data to state
      data.forEach((ch) => {
        if (ch.channel_type === "telegram") {
          setTgToken(ch.bot_token || "");
          setTgChatId(ch.chat_id || "");
          setTgActive(ch.is_active);
        } else if (ch.channel_type === "discord") {
          setDcWebhook(ch.webhook_url || "");
          setDcActive(ch.is_active);
        }
      });

      // 2. Fetch system/proxy settings
      const proxyResponse = await apiClient.fetch("http://localhost:8080/api/v1/system/settings", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (proxyResponse.ok) {
        const proxyData = await proxyResponse.json();
        setProxyType(proxyData.proxy_type || "disabled");
        setProxyLogPath(proxyData.proxy_log_path || "");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load channel configurations";
      setError(msg);
      addLog(`Settings Error: ${msg}`);
    }
  }, [token, addLog]);

  const handleSaveChannel = async (
    type: "telegram" | "discord",
    payload: {
      bot_token?: string;
      chat_id?: string;
      webhook_url?: string;
      is_active: boolean;
    }
  ) => {
    setLoading(true);
    try {
      const response = await apiClient.fetch("http://localhost:8080/api/v1/notifications", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          channel_type: type,
          ...payload,
        }),
      });

      if (!response.ok) throw new Error(`Failed to save ${type} configuration`);
      addLog(`Successfully saved ${type} alert rules.`);
      showToast(`${type.toUpperCase()} settings saved successfully.`, "success");
      fetchSettings();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Save failed";
      showToast(msg, "error");
      addLog(`Settings Error: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  const handleTestChannel = async (type: "telegram" | "discord") => {
    if (type === "telegram") setTestingTg(true);
    else setTestingDc(true);

    addLog(`Sending verification alert testing message to ${type}...`);
    try {
      const response = await apiClient.fetch(`http://localhost:8080/api/v1/notifications/test/${type}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.detail || "Verification alert trigger failed");
      }

      showToast(`Test message successfully sent to ${type}!`, "success");
      addLog(`Verified ${type} alert channel configuration.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Test failed";
      showToast(msg, "error");
      addLog(`Settings Error: ${msg}`);
    } finally {
      if (type === "telegram") setTestingTg(false);
      else setTestingDc(false);
    }
  };

  const handleSaveProxySettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProxy(true);
    addLog("Saving proxy log settings...");
    try {
      const response = await apiClient.fetch("http://localhost:8080/api/v1/system/settings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          proxy_type: proxyType,
          proxy_log_path: proxyLogPath,
        }),
      });

      if (!response.ok) throw new Error("Failed to save proxy log settings");
      addLog("Successfully saved proxy log analyzer settings.");
      showToast("Proxy settings saved successfully.", "success");
      fetchSettings();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Save failed";
      showToast(msg, "error");
      addLog(`Settings Error: ${msg}`);
    } finally {
      setSavingProxy(false);
    }
  };

  useEffect(() => {
    if (token) {
      const timer = setTimeout(() => {
        fetchSettings();
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [token, fetchSettings]);

  return (
    <section className="flex flex-col gap-6">
      {/* Top Banner */}
      <div className="flex justify-between items-center p-4 flat-card bg-neutral-50/50 dark:bg-neutral-900/10">
        <div>
          <h2 className="text-xs text-neutral-400 font-mono tracking-wider uppercase">System Settings & Alerting</h2>
          <p className="text-xs text-neutral-400 font-mono mt-0.5">Configure alerting channels for active background monitors</p>
        </div>
      </div>

      {error && (
        <div className="text-xs text-red-500 font-mono border-l-2 border-red-500 pl-3 py-1">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Telegram Form */}
        <article className="flat-card p-6 flex flex-col justify-between gap-4 border border-border-sem rounded-lg bg-card-sem text-xs">
          <div className="flex flex-col gap-4">
            <div className="flex justify-between items-center border-b border-border-sem pb-2">
              <h3 className="text-xs text-neutral-400 font-mono tracking-wider uppercase">Telegram Alert Channel</h3>
              <div className="flex items-center gap-2 font-mono text-[10px]">
                <label className="text-neutral-500">IS ACTIVE</label>
                <input
                  type="checkbox"
                  checked={tgActive}
                  onChange={(e) => setTgActive(e.target.checked)}
                  className="accent-accent-sem rounded cursor-pointer"
                />
              </div>
            </div>

            <div className="flex flex-col gap-3 font-mono text-xs mt-2">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] text-neutral-400 uppercase font-bold tracking-wider">Bot Token API</label>
                <input
                  type="password"
                  value={tgToken}
                  onChange={(e) => setTgToken(e.target.value)}
                  className="bg-input-sem border border-border-sem rounded-lg p-2.5 text-foreground-sem focus:outline-none focus:border-accent-sem"
                  placeholder="123456789:ABCDefghIJKlmNoPQRsT..."
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] text-neutral-400 uppercase font-bold tracking-wider">Target Chat ID</label>
                <input
                  type="text"
                  value={tgChatId}
                  onChange={(e) => setTgChatId(e.target.value)}
                  className="bg-input-sem border border-border-sem rounded-lg p-2.5 text-foreground-sem focus:outline-none focus:border-accent-sem"
                  placeholder="987654321"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 mt-4 select-none">
            <button
              type="button"
              disabled={loading || !tgToken || !tgChatId}
              onClick={() => handleSaveChannel("telegram", { bot_token: tgToken, chat_id: tgChatId, is_active: tgActive })}
              className="border border-border-sem rounded px-4 py-2 text-xs font-mono bg-transparent hover:bg-accent-sem hover:text-white hover:border-accent-sem disabled:opacity-50 transition-all font-bold cursor-pointer"
            >
              SAVE SETTINGS
            </button>
            <button
              type="button"
              disabled={testingTg || !tgToken || !tgChatId}
              onClick={() => handleTestChannel("telegram")}
              className="border border-border-sem rounded px-4 py-2 text-xs font-mono text-neutral-400 hover:text-foreground-sem hover:border-border-sem disabled:opacity-50 transition-all ml-auto cursor-pointer"
            >
              {testingTg ? "TESTING..." : "TEST"}
            </button>
          </div>
        </article>

        {/* Discord Form */}
        <article className="flat-card p-6 flex flex-col justify-between gap-4 border border-border-sem rounded-lg bg-card-sem text-xs">
          <div className="flex flex-col gap-4">
            <div className="flex justify-between items-center border-b border-border-sem pb-2">
              <h3 className="text-xs text-neutral-400 font-mono tracking-wider uppercase">Discord Webhook Channel</h3>
              <div className="flex items-center gap-2 font-mono text-[10px]">
                <label className="text-neutral-500">IS ACTIVE</label>
                <input
                  type="checkbox"
                  checked={dcActive}
                  onChange={(e) => setDcActive(e.target.checked)}
                  className="accent-accent-sem rounded cursor-pointer"
                />
              </div>
            </div>

            <div className="flex flex-col gap-3 font-mono text-xs mt-2">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] text-neutral-400 uppercase font-bold tracking-wider">Webhook URL</label>
                <input
                  type="url"
                  value={dcWebhook}
                  onChange={(e) => setDcWebhook(e.target.value)}
                  className="bg-input-sem border border-border-sem rounded-lg p-2.5 text-foreground-sem focus:outline-none focus:border-accent-sem"
                  placeholder="https://discord.com/api/webhooks/..."
                />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 mt-4 select-none">
            <button
              type="button"
              disabled={loading || !dcWebhook}
              onClick={() => handleSaveChannel("discord", { webhook_url: dcWebhook, is_active: dcActive })}
              className="border border-border-sem rounded px-4 py-2 text-xs font-mono bg-transparent hover:bg-accent-sem hover:text-white hover:border-accent-sem disabled:opacity-50 transition-all font-bold cursor-pointer"
            >
              SAVE SETTINGS
            </button>
            <button
              type="button"
              disabled={testingDc || !dcWebhook}
              onClick={() => handleTestChannel("discord")}
              className="border border-border-sem rounded px-4 py-2 text-xs font-mono text-neutral-400 hover:text-foreground-sem hover:border-border-sem disabled:opacity-50 transition-all ml-auto cursor-pointer"
            >
              {testingDc ? "TESTING..." : "TEST"}
            </button>
          </div>
        </article>

        {/* Ingress Proxy Log Settings Card */}
        <article className="flat-card p-6 flex flex-col justify-between gap-4 border border-border-sem rounded-lg bg-card-sem text-xs md:col-span-2">
          <div className="flex flex-col gap-4">
            <div className="border-b border-border-sem pb-2">
              <h3 className="text-xs text-neutral-400 font-mono tracking-wider uppercase">Ingress Proxy Log Analyzer</h3>
            </div>

            <form onSubmit={handleSaveProxySettings} className="flex flex-col gap-4 font-mono text-xs mt-2">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] text-neutral-400 uppercase font-bold tracking-wider">Proxy Server Type</label>
                  <select
                    value={proxyType}
                    onChange={(e) => setProxyType(e.target.value)}
                    className="bg-input-sem border border-border-sem rounded-lg p-2.5 text-foreground-sem focus:outline-none focus:border-accent-sem font-mono cursor-pointer"
                  >
                    <option value="disabled">Disabled (Simulated Mock Traffic)</option>
                    <option value="caddy">Caddy Reverse Proxy (Structured JSON Log)</option>
                    <option value="nginx">Nginx / Apache HTTPd (Combined Log Format / CLF)</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] text-neutral-400 uppercase font-bold tracking-wider">Access Log Path</label>
                  <input
                    type="text"
                    value={proxyLogPath}
                    disabled={proxyType === "disabled"}
                    onChange={(e) => setProxyLogPath(e.target.value)}
                    className="bg-input-sem border border-border-sem rounded-lg p-2.5 text-foreground-sem focus:outline-none focus:border-accent-sem disabled:opacity-50"
                    placeholder={proxyType === "nginx" ? "/var/log/nginx/access.log" : proxyType === "caddy" ? "/var/log/caddy/access.log" : "Log analysis disabled"}
                  />
                </div>
              </div>

              <div className="flex flex-col md:flex-row justify-between items-start md:items-center text-[10px] text-neutral-500 mt-2 border-t border-border-sem pt-3 gap-2">
                <span>
                  Tip: Make sure the backend user has read access (e.g. <code>sudo usermod -aG adm user</code>).
                </span>
                <button
                  type="submit"
                  disabled={savingProxy}
                  className="border border-border-sem rounded px-4 py-2 text-xs font-mono bg-transparent hover:bg-accent-sem hover:text-white hover:border-accent-sem disabled:opacity-50 transition-all font-bold md:ml-auto cursor-pointer"
                >
                  {savingProxy ? "SAVING..." : "SAVE PROXY SETTINGS"}
                </button>
              </div>
            </form>
          </div>
        </article>
      </div>
    </section>
  );
}
