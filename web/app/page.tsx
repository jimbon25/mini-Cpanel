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
import CommandPalette from "./components/CommandPalette";

import { apiClient } from "@/app/utils/apiClient";
import { websocketClient } from "@/app/utils/websocketClient";
import { useAuth } from "@/app/context/AuthContext";
import { useNotification } from "@/app/context/NotificationContext";

export default function App() {
  const {
    token,
    userRole,
    agentStatus,
    setAgentStatus,
    login: setAuthToken,
    logout: clearAuthToken,
  } = useAuth();
  const { showToast } = useNotification();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Tabs: "dashboard" | "files" | "projects" | "apps" | "cron" | "backup" | "settings" | "databases" | "terminal"
  const [activeTab, setActiveTab] = useState<TabType>("dashboard");

  // System Metrics States
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [cpuHistory, setCpuHistory] = useState<number[]>([]);
  const [memHistory, setMemHistory] = useState<number[]>([]);
  const [diskHistory, setDiskHistory] = useState<number[]>([]);
  const [uptimeSeconds, setUptimeSeconds] = useState<number>(0);

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
    clearAuthToken();
    setUsername("");
    setPassword("");
    setActiveTab("dashboard");
    setConsoleLogs([]);
    addLog("Session logged out.");
  }, [clearAuthToken, addLog]);

  const handleLogin = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    addLog(`Attempting login for user: ${username}...`);

    try {
      const response = await apiClient.fetch("http://localhost:8080/api/v1/auth/login", {
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
      setAuthToken(data.access_token);
      showToast("Logged in successfully", "success");
      addLog("Login successful. Access token generated.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Cannot connect to backend agent";
      setError(msg);
      addLog(`Login failed: ${msg}`);
    } finally {
      setLoading(false);
    }
  }, [username, password, setAuthToken, showToast, addLog]);

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

  // Poll metrics when token or activeTab changes
  useEffect(() => {
    if (!token || activeTab !== "dashboard") {
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
        const response = await apiClient.fetch("http://localhost:8080/api/v1/system/metrics", {
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
  }, [token, activeTab, handleLogout, setAgentStatus, addLog]);

  // Traffic WebSocket Connection for real-time 1s updates
  useEffect(() => {
    if (!token || activeTab !== "dashboard") {
      const timer = setTimeout(() => {
        setTraffic(null);
      }, 0);
      return () => clearTimeout(timer);
    }

    let ws: WebSocket | null = null;
    let reconnectTimeout: NodeJS.Timeout | null = null;
    let isComponentMounted = true;

    const connect = () => {
      if (!isComponentMounted) return;

      const wsUrl = `ws://localhost:8080/api/v1/system/traffic/ws?token=${encodeURIComponent(token)}`;
      ws = websocketClient.create(wsUrl);

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (isComponentMounted) {
            setTraffic(data);
          }
        } catch (err) {
          console.error("Error parsing traffic WebSocket data:", err);
        }
      };

      ws.onerror = (err) => {
        console.error("Traffic WebSocket error:", err);
      };

      ws.onclose = () => {
        if (isComponentMounted) {
          console.log("Traffic WebSocket connection closed. Retrying in 5 seconds...");
          reconnectTimeout = setTimeout(connect, 5000);
        }
      };
    };

    connect();

    return () => {
      isComponentMounted = false;
      if (ws) {
        ws.close();
      }
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
    };
  }, [token, activeTab]);

  interface ActivityLogItem {
    id: string;
    project_id: string | null;
    event_type: string;
    message: string;
    timestamp: string | null;
  }

  // Poll activity logs from database dynamically
  useEffect(() => {
    if (!token || (activeTab !== "dashboard" && activeTab !== "projects")) return;

    const fetchActivityLogs = async () => {
      try {
        const response = await apiClient.fetch("http://localhost:8080/api/v1/system/activity-logs", {
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
  }, [token, activeTab]);

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
      {/* Command Palette */}
      <CommandPalette
        setActiveTab={setActiveTab}
        userRole={userRole}
        onLogout={handleLogout}
        onViewLogs={() => {
          setLogsProjectId("local-agent");
          setLogsDrawerOpen(true);
          addLog("Opened live log stream console.");
        }}
      />

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
        <header className="md:hidden sticky top-0 bg-canvas-light/95 dark:bg-canvas-dark/95 backdrop-blur-md z-40 flex justify-between items-center py-2 pb-4 border-b border-border-sem">
          <div>
            <h1 className="text-lg font-black tracking-tighter text-foreground">
              mini<span className="text-cobalt font-light font-mono">.cpanel</span>
            </h1>
          </div>
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="border border-border-sem px-3 py-1.5 rounded-lg text-xs font-mono text-muted-sem hover:text-foreground-sem cursor-pointer"
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
          <div className="bg-[#0c0c0e] text-neutral-300 p-4 rounded-lg font-mono text-xs h-40 overflow-y-auto flex flex-col-reverse gap-1 border border-neutral-800/80 dark:border-border-sem/40 shadow-inner">
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
            <div className="text-cobalt border-b border-border-sem/20 pb-1 mb-1 font-bold">
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
