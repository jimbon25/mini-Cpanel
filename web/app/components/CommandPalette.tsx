"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { TabType } from "./Sidebar";

interface CommandOption {
  id: string;
  label: string;
  category: string;
  shortcut?: string[];
  action: () => void;
  roles?: string[];
}

interface CommandPaletteProps {
  setActiveTab: (tab: TabType) => void;
  userRole: string;
  onLogout: () => void;
  onViewLogs: () => void;
}

export default function CommandPalette({
  setActiveTab,
  userRole,
  onLogout,
  onViewLogs,
}: CommandPaletteProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const overlayRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Toggle dark/light theme
  const toggleTheme = useCallback(() => {
    const isDark = document.documentElement.classList.contains("dark") || 
      (!document.documentElement.classList.contains("light") && 
       window.matchMedia("(prefers-color-scheme: dark)").matches);
    if (isDark) {
      document.documentElement.classList.remove("dark");
      document.documentElement.classList.add("light");
    } else {
      document.documentElement.classList.remove("light");
      document.documentElement.classList.add("dark");
    }
  }, []);

  const options: CommandOption[] = [
    {
      id: "nav-dashboard",
      label: "Go to Dashboard",
      category: "Navigation",
      shortcut: ["G", "D"],
      action: () => setActiveTab("dashboard"),
      roles: ["viewer", "developer", "super_admin"],
    },
    {
      id: "nav-files",
      label: "Go to File Explorer",
      category: "Navigation",
      shortcut: ["G", "F"],
      action: () => setActiveTab("files"),
      roles: ["developer", "super_admin"],
    },
    {
      id: "nav-projects",
      label: "Go to Project Deployer",
      category: "Navigation",
      shortcut: ["G", "P"],
      action: () => setActiveTab("projects"),
      roles: ["developer", "super_admin"],
    },
    {
      id: "nav-apps",
      label: "Go to App Store (Marketplace)",
      category: "Navigation",
      shortcut: ["G", "A"],
      action: () => setActiveTab("apps"),
      roles: ["developer", "super_admin"],
    },
    {
      id: "nav-cron",
      label: "Go to Task Scheduler",
      category: "Navigation",
      shortcut: ["G", "C"],
      action: () => setActiveTab("cron"),
      roles: ["developer", "super_admin"],
    },
    {
      id: "nav-databases",
      label: "Go to Databases",
      category: "Navigation",
      shortcut: ["G", "B"],
      action: () => setActiveTab("databases"),
      roles: ["super_admin"],
    },
    {
      id: "nav-backup",
      label: "Go to Backups",
      category: "Navigation",
      shortcut: ["G", "K"],
      action: () => setActiveTab("backup"),
      roles: ["super_admin"],
    },
    {
      id: "nav-settings",
      label: "Go to Settings",
      category: "Navigation",
      shortcut: ["G", "S"],
      action: () => setActiveTab("settings"),
      roles: ["super_admin"],
    },
    {
      id: "nav-terminal",
      label: "Go to Terminal",
      category: "Navigation",
      shortcut: ["G", "T"],
      action: () => setActiveTab("terminal"),
      roles: ["super_admin"],
    },
    {
      id: "nav-users",
      label: "Go to User Manager",
      category: "Navigation",
      shortcut: ["G", "U"],
      action: () => setActiveTab("users"),
      roles: ["super_admin"],
    },
    {
      id: "action-logs",
      label: "Open Live Logs Console",
      category: "Actions",
      shortcut: ["L"],
      action: () => onViewLogs(),
      roles: ["developer", "super_admin"],
    },
    {
      id: "action-theme",
      label: "Toggle Theme (Light / Dark Mode)",
      category: "Settings",
      shortcut: ["T"],
      action: toggleTheme,
    },
    {
      id: "action-logout",
      label: "Logout from Session",
      category: "Account",
      shortcut: ["Q"],
      action: onLogout,
    },
  ];

  // Filter options based on user role and query
  const filteredOptions = options.filter(
    (opt) =>
      (!opt.roles || opt.roles.includes(userRole)) &&
      (opt.label.toLowerCase().includes(search.toLowerCase()) ||
        opt.category.toLowerCase().includes(search.toLowerCase()))
  );

  // Toggle modal on Ctrl+K or Cmd+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setIsOpen((prev) => !prev);
        setSearch("");
        setSelectedIndex(0);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Handle auto-focus
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
      // Disable body scroll when open
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  // Keyboard navigation inside command palette
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % filteredOptions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + filteredOptions.length) % filteredOptions.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filteredOptions[selectedIndex]) {
        filteredOptions[selectedIndex].action();
        setIsOpen(false);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setIsOpen(false);
    }
  };

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current) {
      const activeEl = listRef.current.children[selectedIndex] as HTMLElement;
      if (activeEl) {
        const listEl = listRef.current;
        if (activeEl.offsetTop + activeEl.offsetHeight > listEl.scrollTop + listEl.offsetHeight) {
          listEl.scrollTop = activeEl.offsetTop + activeEl.offsetHeight - listEl.offsetHeight;
        } else if (activeEl.offsetTop < listEl.scrollTop) {
          listEl.scrollTop = activeEl.offsetTop;
        }
      }
    }
  }, [selectedIndex]);

  if (!isOpen) return null;

  return (
    <div
      ref={overlayRef}
      onClick={(e) => {
        if (e.target === overlayRef.current) {
          setIsOpen(false);
        }
      }}
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-start justify-center p-4 md:p-12 animate-fade-in"
    >
      <div
        className="w-full max-w-lg bg-card-sem border border-border-sem rounded-lg shadow-2xl flex flex-col font-mono text-xs overflow-hidden mt-12 md:mt-24 animate-slide-up"
        onKeyDown={handleKeyDown}
      >
        {/* Search Input Box */}
        <div className="flex items-center gap-2 border-b border-border-sem p-3 bg-input-sem/20">
          <svg
            className="w-4 h-4 text-muted-sem shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder="Type a command or search..."
            className="flex-1 bg-transparent text-foreground-sem border-none outline-none focus:ring-0 placeholder:text-muted-sem py-0.5 text-xs font-mono"
          />
          <span className="text-[9px] text-muted-sem border border-border-sem px-1.5 py-0.5 rounded font-mono select-none">
            ESC
          </span>
        </div>

        {/* Search Results List */}
        <div
          ref={listRef}
          className="grow overflow-y-auto max-h-72 select-none"
        >
          {filteredOptions.length === 0 ? (
            <div className="p-4 text-center text-muted-sem italic">
              No matching commands found.
            </div>
          ) : (
            filteredOptions.map((opt, index) => {
              const isSelected = index === selectedIndex;
              return (
                <button
                  key={opt.id}
                  onClick={() => {
                    opt.action();
                    setIsOpen(false);
                  }}
                  className={`w-full text-left p-3 flex justify-between items-center gap-4 border-b border-border-sem/40 last:border-b-0 cursor-pointer ${
                    isSelected
                      ? "bg-input-sem text-foreground-sem"
                      : "text-muted-sem hover:bg-input-sem/40 hover:text-foreground-sem"
                  }`}
                >
                  <div className="flex items-center gap-3 truncate">
                    <span className="text-[10px] text-accent-sem bg-accent-sem/5 border border-accent-sem/10 px-1.5 py-0.5 rounded uppercase font-bold tracking-wider">
                      {opt.category}
                    </span>
                    <span className="font-semibold truncate">{opt.label}</span>
                  </div>

                  {opt.shortcut && (
                    <div className="flex gap-1 shrink-0 font-mono text-[9px] text-muted-sem font-semibold">
                      {opt.shortcut.map((key, kIndex) => (
                        <span
                          key={kIndex}
                          className="border border-border-sem rounded px-1.5 py-0.5 bg-input-sem/30"
                        >
                          {key}
                        </span>
                      ))}
                    </div>
                  )}
                </button>
              );
            })
          )}
        </div>

        {/* Footer Help */}
        <div className="border-t border-border-sem p-2 bg-input-sem/25 text-[10px] text-muted-sem flex justify-between select-none font-sans px-4">
          <div className="flex gap-4">
            <span>
              <kbd className="font-mono bg-input-sem border border-border-sem rounded px-1 py-0.5 text-[9px]">↑↓</kbd> to navigate
            </span>
            <span>
              <kbd className="font-mono bg-input-sem border border-border-sem rounded px-1 py-0.5 text-[9px]">↵</kbd> to select
            </span>
          </div>
          <span>Command Palette</span>
        </div>
      </div>
    </div>
  );
}
