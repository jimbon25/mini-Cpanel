import React from "react";

export type TabType = "dashboard" | "files" | "projects" | "apps" | "cron" | "backup" | "settings" | "databases" | "terminal" | "users";

interface SidebarProps {
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
  agentStatus: "connecting" | "online" | "offline";
  onViewLogs: () => void;
  onLogout: () => void;
  isOpen: boolean;
  onClose: () => void;
  userRole?: string;
}

export default function Sidebar({
  activeTab,
  setActiveTab,
  agentStatus,
  onViewLogs,
  onLogout,
  isOpen,
  onClose,
  userRole = "viewer",
}: SidebarProps) {
  
  const menuItems = [
    {
      id: "dashboard" as TabType,
      num: "01",
      label: "Dashboard",
      icon: (
        <svg className="w-4 h-4 text-current" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2H6a2 2 0 01-2-2v-4zM14 16a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2h-2a2 2 0 01-2-2v-4z" />
        </svg>
      )
    },
    {
      id: "files" as TabType,
      num: "02",
      label: "File Explorer",
      icon: (
        <svg className="w-4 h-4 text-current" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
        </svg>
      )
    },
    {
      id: "projects" as TabType,
      num: "03",
      label: "Project Deployer",
      icon: (
        <svg className="w-4 h-4 text-current" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
        </svg>
      )
    },
    {
      id: "apps" as TabType,
      num: "04",
      label: "App Store",
      icon: (
        <svg className="w-4 h-4 text-current" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
        </svg>
      )
    },
    {
      id: "cron" as TabType,
      num: "05",
      label: "Task Scheduler",
      icon: (
        <svg className="w-4 h-4 text-current" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      )
    },
    {
      id: "databases" as TabType,
      num: "06",
      label: "Databases",
      icon: (
        <svg className="w-4 h-4 text-current" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
        </svg>
      )
    },
    {
      id: "backup" as TabType,
      num: "07",
      label: "Backups",
      icon: (
        <svg className="w-4 h-4 text-current" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
        </svg>
      )
    },
    {
      id: "settings" as TabType,
      num: "08",
      label: "Settings",
      icon: (
        <svg className="w-4 h-4 text-current" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      )
    },
    {
      id: "terminal" as TabType,
      num: "09",
      label: "Terminal",
      icon: (
        <svg className="w-4 h-4 text-current" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      )
    },
    {
      id: "users" as TabType,
      num: "10",
      label: "User Manager",
      icon: (
        <svg className="w-4 h-4 text-current" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      )
    }
  ];

  const allowedTabs: Record<string, TabType[]> = {
    viewer: ["dashboard"],
    developer: ["dashboard", "files", "projects", "apps", "cron"],
    super_admin: ["dashboard", "files", "projects", "apps", "cron", "databases", "backup", "settings", "terminal", "users"],
  };
  const roleAllowed = allowedTabs[userRole] || ["dashboard"];
  const filteredMenuItems = menuItems.filter((item) => roleAllowed.includes(item.id));

  const sidebarContent = (
    <div className="flex flex-col min-h-full justify-between select-none">
      {/* Brand & Menu */}
      <div className="flex flex-col gap-5">
        {/* Mobile close toggle */}
        <div className="flex justify-between items-center md:block">
          <div>
            <h1 className="text-lg font-black tracking-tighter text-foreground">
              mini<span className="text-cobalt font-light font-mono">.cpanel</span>
            </h1>
            <p className="text-[10px] text-neutral-400 tracking-widest uppercase font-mono mt-0.5">
              SERVER ORCHESTRATOR
            </p>
          </div>
          <button
            onClick={onClose}
            className="md:hidden border border-neutral-200 dark:border-neutral-800 p-1.5 rounded-lg text-neutral-400 hover:text-foreground"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Connectivity Status */}
        <div className="flex items-center gap-2 border border-neutral-200 dark:border-neutral-800/60 p-2 rounded-lg bg-neutral-50/50 dark:bg-neutral-900/10">
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              agentStatus === "online" ? "bg-cobalt animate-pulse" : "bg-red-500"
            }`}
          ></span>
          <span className="text-[10px] font-mono font-medium tracking-wider uppercase text-neutral-500">
            AGENT: {agentStatus}
          </span>
        </div>

        {/* Menu Items */}
        <nav className="flex flex-col gap-1">
          {filteredMenuItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  setActiveTab(item.id);
                  onClose();
                }}
                className={`flex items-center gap-2.5 p-2.5 rounded-lg border text-xs font-mono text-left transition-all ${
                  isActive
                    ? "bg-neutral-950 border-cobalt text-white font-bold"
                    : "bg-transparent border-transparent text-neutral-400 hover:text-foreground hover:bg-neutral-50/30 dark:hover:bg-neutral-900/10"
                }`}
                data-testid={`tab-${item.id}`}
              >
                <span className={isActive ? "text-cobalt" : "text-neutral-500"}>{item.icon}</span>
                <span className="flex-1 truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Footer Controls */}
      <div className="flex flex-col gap-2 pt-4 border-t border-neutral-200 dark:border-neutral-800/80">
        {userRole !== "viewer" && (
          <button
            onClick={onViewLogs}
            className="w-full flex justify-between items-center text-xs border border-neutral-200 dark:border-neutral-800 p-2 rounded hover:bg-cobalt hover:text-white hover:border-cobalt transition-all font-mono"
            data-testid="btn-view-logs"
          >
            <span>LIVE LOGS</span>
            <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-ping"></span>
          </button>
        )}

        <button
          onClick={onLogout}
          className="w-full flex items-center gap-2.5 p-2.5 rounded-lg text-xs font-mono text-left transition-all border border-transparent text-neutral-400 hover:text-red-500 hover:bg-red-500/10"
        >
          <svg className="w-4 h-4 text-current" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          <span className="flex-1 truncate">LOGOUT</span>
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-64 border-r border-neutral-200 dark:border-neutral-800 bg-neutral-50/20 dark:bg-neutral-900/5 h-screen sticky top-0 p-6 shrink-0 overflow-y-auto">
        {sidebarContent}
      </aside>

      {/* Mobile Drawer */}
      {isOpen && (
        <>
          <div
            onClick={onClose}
            className="fixed inset-0 bg-black/60 z-40 md:hidden animate-fade-in"
          ></div>
          <aside className="fixed inset-y-0 left-0 w-64 bg-canvas-light dark:bg-canvas-dark border-r border-neutral-200 dark:border-neutral-800 z-50 p-6 md:hidden overflow-y-auto">
            {sidebarContent}
          </aside>
        </>
      )}
    </>
  );
}
