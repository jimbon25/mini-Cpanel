"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { parseUTCDate } from "@/app/utils/date";
import AuthForm from "./components/Auth/AuthForm";
import DashboardTab, { SystemMetrics, TrafficMetrics } from "./components/Dashboard/DashboardTab";
import FileExplorerTab from "./components/FileExplorer/FileExplorerTab";
import ProjectsTab from "./components/Projects/ProjectsTab";
import LogsDrawer from "./components/Projects/LogsDrawer";
import BackupsTab from "./components/Backups/BackupsTab";
import SettingsTab from "./components/Settings/SettingsTab";
import CronJobsTab from "./components/CronJobs/CronJobsTab";
import DatabasesTab from "./components/Databases/DatabasesTab";
import Sidebar, { TabType } from "./components/Sidebar";
import MarketplaceTab from "./components/Marketplace/MarketplaceTab";
import TerminalTab from "./components/Terminal/TerminalTab";
import UsersTab from "./components/Users/UsersTab";

if (typeof window !== "undefined") {
  const getBaseUrl = (): string => {
    if (process.env.NEXT_PUBLIC_API_URL) {
      return process.env.NEXT_PUBLIC_API_URL;
    }
    
    const { hostname, protocol } = window.location;
    
    if (hostname !== "localhost" && hostname !== "127.0.0.1") {
      const httpProto = protocol === "https:" ? "https:" : "http:";
      return `${httpProto}//${hostname}:8080`;
    }
    
    return "http://localhost:8080";
  };

  const getBaseWsUrl = (): string => {
    const baseUrl = getBaseUrl();
    return baseUrl.replace(/^http/, "ws");
  };

  // Override window.fetch
  const originalFetch = window.fetch;
  window.fetch = function (input, init) {
    if (typeof input === "string" && input.startsWith("http://localhost:8080")) {
      const baseUrl = getBaseUrl();
      const targetUrl = input.replace("http://localhost:8080", baseUrl);
      return originalFetch(targetUrl, init);
    }
    return originalFetch(input, init);
  };

  // Override window.WebSocket to handle WebSocket streaming dynamically
  const OriginalWebSocket = window.WebSocket;
  // @ts-expect-error - WebSocket override is not natively typed on window
  window.WebSocket = function (url, protocols) {
    if (typeof url === "string" && url.startsWith("ws://localhost:8080")) {
      const baseWsUrl = getBaseWsUrl();
      const targetUrl = url.replace("ws://localhost:8080", baseWsUrl);
      return new OriginalWebSocket(targetUrl, protocols);
    }
    return new OriginalWebSocket(url, protocols);
  };
  window.WebSocket.prototype = OriginalWebSocket.prototype;
  // @ts-expect-error - overriding read-only/static WebSocket constants
  window.WebSocket.CONNECTING = OriginalWebSocket.CONNECTING;
  // @ts-expect-error - overriding read-only/static WebSocket constants
  window.WebSocket.OPEN = OriginalWebSocket.OPEN;
  // @ts-expect-error - overriding read-only/static WebSocket constants
  window.WebSocket.CLOSING = OriginalWebSocket.CLOSING;
  // @ts-expect-error - overriding read-only/static WebSocket constants
  window.WebSocket.CLOSED = OriginalWebSocket.CLOSED;
}

// Helper to decode JWT payload client-side without external dependencies
function decodeJwt(token: string): { sub?: string; role?: string } | null {
  try {
    const base64Url = token.split(".")[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = decodeURIComponent(
      window.atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    return JSON.parse(jsonPayload);
  } catch {
    return null;
  }
}

export default function App() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const userRole = token ? (decodeJwt(token)?.role || "super_admin") : "viewer";

  // Tabs: "dashboard" | "files" | "projects" | "apps" | "cron" | "backup" | "settings" | "databases" | "terminal"
  const [activeTab, setActiveTab] = useState<TabType>("dashboard");

  // System Metrics States
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [cpuHistory, setCpuHistory] = useState<number[]>([]);
  const [memHistory, setMemHistory] = useState<number[]>([]);
  const [diskHistory, setDiskHistory] = useState<number[]>([]);
  const [uptimeSeconds, setUptimeSeconds] = useState<number>(0);
  const [agentStatus, setAgentStatus] = useState<"connecting" | "online" | "offline">("connecting");

  // Ingress Traffic States
  const [traffic, setTraffic] = useState<TrafficMetrics | null>(null);

  // Logs state
  const [consoleLogs, setConsoleLogs] = useState<string[]>([]);
  const [logsDrawerOpen, setLogsDrawerOpen] = useState(false);
  const [logsProjectId, setLogsProjectId] = useState("local-agent");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const uptimeRef = useRef<NodeJS.Timeout | null>(null);

  // Stable logger callback
  const addLog = useCallback((message: string) => {
    const time = new Date().toLocaleTimeString();
    setConsoleLogs((prev) => [`[${time}] ${message}`, ...prev.slice(0, 49)]);
  }, []);

  const handleLogout = useCallback(() => {
    localStorage.removeItem("minicpanel_token");
    setToken(null);
    setUsername("");
    setPassword("");
    setActiveTab("dashboard");
    setConsoleLogs([]);
    addLog("Session logged out.");
  }, [addLog]);

  const handleLogin = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    addLog(`Attempting login for user: ${username}...`);

    try {
      const response = await fetch("http://localhost:8080/api/v1/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username, password }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({ detail: "Login failed" }));
        throw new Error(data.detail || "Invalid credentials");
      }

      const data = await response.json();
      localStorage.setItem("minicpanel_token", data.access_token);
      setToken(data.access_token);
      addLog("Login successful. Access token generated.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Cannot connect to backend agent";
      setError(msg);
      addLog(`Login failed: ${msg}`);
    } finally {
      setLoading(false);
    }
  }, [username, password, addLog]);

  // Check for existing token on mount
  useEffect(() => {
    const savedToken = localStorage.getItem("minicpanel_token");
    let timer: ReturnType<typeof setTimeout>;
    if (savedToken) {
      timer = setTimeout(() => {
        setToken(savedToken);
        addLog("Existing token found. Session loaded.");
      }, 0);
    } else {
      timer = setTimeout(() => {
        setAgentStatus("offline");
      }, 0);
    }
    return () => clearTimeout(timer);
  }, [addLog]);

  // Client-Side Tab Route Guard
  useEffect(() => {
    if (!token) return;
    const allowedTabs: Record<string, TabType[]> = {
      viewer: ["dashboard"],
      developer: ["dashboard", "files", "projects", "apps", "cron"],
      super_admin: ["dashboard", "files", "projects", "apps", "cron", "databases", "backup", "settings", "terminal", "users"],
    };
    const roleAllowed = allowedTabs[userRole] || ["dashboard"];
    if (!roleAllowed.includes(activeTab)) {
      setTimeout(() => {
        addLog(`Access denied to tab '${activeTab}' for role '${userRole}'. Redirecting to dashboard.`);
        setActiveTab("dashboard");
      }, 0);
    }
  }, [activeTab, userRole, token, addLog]);

  // Poll metrics when token changes
  useEffect(() => {
    if (!token) {
      if (pollingRef.current) clearInterval(pollingRef.current);
      if (uptimeRef.current) clearInterval(uptimeRef.current);
      const timer = setTimeout(() => {
        setMetrics(null);
        setTraffic(null);
        setCpuHistory([]);
        setMemHistory([]);
        setDiskHistory([]);
      }, 0);
      return () => clearTimeout(timer);
    }

    const fetchMetrics = async () => {
      try {
        const response = await fetch("http://localhost:8080/api/v1/system/metrics", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          if (response.status === 401) {
            handleLogout();
            throw new Error("Session expired. Please log in again.");
          }
          throw new Error(`Agent metrics failed with status ${response.status}`);
        }

        const data: SystemMetrics = await response.json();
        
        setMetrics(data);
        setUptimeSeconds(data.uptime);
        setAgentStatus("online");

        setCpuHistory((prev) => [...prev, data.cpu.percent].slice(-20));
        setMemHistory((prev) => [...prev, data.memory.percent].slice(-20));
        setDiskHistory((prev) => [...prev, data.disk.percent].slice(-20));

        // Fetch Ingress Traffic Stats
        try {
          const tResponse = await fetch("http://localhost:8080/api/v1/system/traffic", {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (tResponse.ok) {
            const tData = await tResponse.json();
            setTraffic(tData);
          }
        } catch (tErr) {
          console.error("Failed to fetch traffic stats:", tErr);
        }
      } catch (err) {
        setAgentStatus("offline");
        const msg = err instanceof Error ? err.message : "Failed to fetch metrics";
        addLog(`Metrics fetch failed: ${msg}`);
      }
    };

    fetchMetrics();
    pollingRef.current = setInterval(fetchMetrics, 3000);

    uptimeRef.current = setInterval(() => {
      setUptimeSeconds((prev) => prev + 1);
    }, 1000);

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
      if (uptimeRef.current) clearInterval(uptimeRef.current);
    };
  }, [token, handleLogout, addLog]);

  interface ActivityLogItem {
    id: string;
    project_id: string | null;
    event_type: string;
    message: string;
    timestamp: string | null;
  }

  // Poll activity logs from database dynamically
  useEffect(() => {
    if (!token) return;

    const fetchActivityLogs = async () => {
      try {
        const response = await fetch("http://localhost:8080/api/v1/system/activity-logs", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        if (!response.ok) return;
        const data = await response.json();

        const dbLogs = data.map((log: ActivityLogItem) => {
          const date = parseUTCDate(log.timestamp);
          const timeStr = isNaN(date.getTime()) ? "" : date.toLocaleTimeString();
          const timePrefix = timeStr ? `[${timeStr}]` : "";
          const eventPrefix = log.event_type ? ` [${log.event_type.toUpperCase()}]` : "";
          return `${timePrefix}${eventPrefix} ${log.message}`;
        });

        // Merge with local logs that are NOT already in the database logs (e.g. login/logout/tab guards)
        setConsoleLogs((prev) => {
          const localOnly = prev.filter(
            (localLog) =>
              localLog.includes("Login successful") ||
              localLog.includes("Session loaded") ||
              localLog.includes("Session logged out") ||
              localLog.includes("Access denied")
          );
          return [...localOnly, ...dbLogs].slice(0, 50);
        });
      } catch (err) {
        console.error("Failed to load activity logs:", err);
      }
    };

    fetchActivityLogs();
    const interval = setInterval(fetchActivityLogs, 3000);
    return () => clearInterval(interval);
  }, [token]);

  if (!token) {
    return (
      <AuthForm
        username={username}
        setUsername={setUsername}
        password={password}
        setPassword={setPassword}
        loading={loading}
        error={error}
        handleLogin={handleLogin}
      />
    );
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-canvas-light dark:bg-canvas-dark text-foreground w-full">
      {/* Sidebar Component */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        agentStatus={agentStatus}
        onViewLogs={() => {
          setLogsProjectId("local-agent");
          setLogsDrawerOpen(true);
          addLog("Opened live log stream console.");
        }}
        onLogout={handleLogout}
        isOpen={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
        userRole={userRole}
      />

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col p-4 md:p-8 gap-6 overflow-y-auto w-full">
        {/* Mobile Header (Only visible on mobile) */}
        <header className="md:hidden flex justify-between items-center pb-4 border-b border-neutral-200 dark:border-neutral-800">
          <div>
            <h1 className="text-lg font-black tracking-tighter text-foreground">
              mini<span className="text-cobalt font-light font-mono">.cpanel</span>
            </h1>
          </div>
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="border border-neutral-200 dark:border-neutral-800 px-3 py-1.5 rounded-lg text-xs font-mono text-neutral-400 hover:text-foreground"
          >
            MENU
          </button>
        </header>

        {/* Tab Content Rendering */}
        <div className="flex-1 flex flex-col gap-6">
          {activeTab === "dashboard" && (
            <DashboardTab
              metrics={metrics}
              cpuHistory={cpuHistory}
              memHistory={memHistory}
              diskHistory={diskHistory}
              uptimeSeconds={uptimeSeconds}
              traffic={traffic}
            />
          )}

          {activeTab === "files" && (
            <FileExplorerTab
              token={token}
              addLog={addLog}
            />
          )}

          {activeTab === "projects" && (
            <ProjectsTab
              token={token}
              addLog={addLog}
              setLogsProjectId={setLogsProjectId}
              setLogsDrawerOpen={setLogsDrawerOpen}
            />
          )}

          {activeTab === "apps" && (
            <MarketplaceTab
              token={token}
              addLog={addLog}
              onInstallSuccess={() => setActiveTab("projects")}
            />
          )}

          {activeTab === "cron" && (
            <CronJobsTab
              token={token}
              addLog={addLog}
            />
          )}

          {activeTab === "backup" && (
            <BackupsTab
              token={token}
              addLog={addLog}
            />
          )}

          {activeTab === "settings" && (
            <SettingsTab
              token={token}
              addLog={addLog}
            />
          )}

          {activeTab === "databases" && (
            <DatabasesTab
              token={token}
              addLog={addLog}
            />
          )}

          <div className={activeTab === "terminal" ? "flex-1 flex flex-col gap-6" : "hidden"}>
            <TerminalTab
              token={token}
              addLog={addLog}
              isActive={activeTab === "terminal"}
            />
          </div>

          {activeTab === "users" && (
            <UsersTab
              token={token}
              addLog={addLog}
            />
          )}
        </div>

        {/* Terminal Activity Logs Box */}
        <section className="flex flex-col gap-2 mt-auto">
          <h3 className="text-xs text-neutral-400 font-mono tracking-wider uppercase">Activity Console</h3>
          <div className="flat-card bg-canvas-dark text-neutral-300 p-4 rounded-lg font-mono text-xs h-40 overflow-y-auto flex flex-col-reverse gap-1 border-neutral-800">
            {consoleLogs.map((log, index) => {
              const isError = log.includes("Error") || log.includes("failed") || log.includes("expired");
              return (
                <div
                  key={index}
                  className={isError ? "text-red-400" : log.includes("Metrics") ? "text-neutral-500" : "text-neutral-200"}
                >
                  {log}
                </div>
              );
            })}
            <div className="text-cobalt border-b border-neutral-900 pb-1 mb-1 font-bold">
              *** MINI CPANEL RECEPTION CONSOLE INITIALIZED ***
            </div>
          </div>
        </section>
      </main>

      {/* Logs Overlay Panel */}
      <LogsDrawer
        isOpen={logsDrawerOpen}
        onClose={() => setLogsDrawerOpen(false)}
        projectId={logsProjectId}
        token={token}
      />
    </div>
  );
}
