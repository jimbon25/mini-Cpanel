"use client";

import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { websocketClient } from "@/app/utils/websocketClient";
import "@xterm/xterm/css/xterm.css";

interface TerminalTabProps {
  token: string | null;
  addLog: (log: string) => void;
  isActive: boolean;
}

export default function TerminalTab({ token, addLog, isActive }: TerminalTabProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const termInstanceRef = useRef<Terminal | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const [status, setStatus] = useState<"connecting" | "connected" | "disconnected">("connecting");
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      return window.matchMedia("(prefers-color-scheme: dark)").matches;
    }
    return true;
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      const media = window.matchMedia("(prefers-color-scheme: dark)");
      const listener = (e: MediaQueryListEvent) => setIsDarkMode(e.matches);
      media.addEventListener("change", listener);
      return () => media.removeEventListener("change", listener);
    }
  }, []);

  useEffect(() => {
    if (!token || !terminalRef.current) return;

    // 1. Initialize xterm.js Terminal
    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: "block",
      fontSize: 13,
      fontFamily: "Courier New, Courier, monospace",
      theme: {
        background: isDarkMode ? "#0c0c0e" : "#fbfbfb", // dark canvas vs light background
        foreground: isDarkMode ? "#d4d4d4" : "#09090b", // light grey text vs dark text
        cursor: "#2245e3",     // cobalt blue cursor highlight
        selectionBackground: isDarkMode ? "rgba(34, 69, 227, 0.3)" : "rgba(34, 69, 227, 0.15)",
        cursorAccent: isDarkMode ? "#0c0c0e" : "#fbfbfb",
      },
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(terminalRef.current);
    
    // Fit dimensions immediately
    setTimeout(() => {
      try {
        fitAddon.fit();
      } catch (e) {
        console.warn("xterm fit error:", e);
      }
    }, 100);

    termInstanceRef.current = term;
    fitAddonRef.current = fitAddon;

    term.write("Connecting to server terminal console...\r\n");

    // 2. Configure WebSocket URL
    const isHttps = window.location.protocol === "https:";
    const wsProto = isHttps ? "wss:" : "ws:";
    
    let wsUrl = "";
    const apiEnv = process.env.NEXT_PUBLIC_API_URL;
    if (apiEnv) {
      const cleanHost = apiEnv.replace(/^https?:\/\//, "");
      const cleanProto = apiEnv.startsWith("https") ? "wss:" : "ws:";
      wsUrl = `${cleanProto}//${cleanHost}/api/v1/system/terminal/ws?token=${encodeURIComponent(token)}`;
    } else {
      // Local fallback
      wsUrl = `${wsProto}//localhost:8080/api/v1/system/terminal/ws?token=${encodeURIComponent(token)}`;
    }

    addLog("Opening Web SSH Terminal WebSocket connection.");
    const ws = websocketClient.create(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus("connected");
      term.write("\r\n*** WEB SSH TERMINAL INITIALIZED ***\r\n\r\n");
      
      // Send initial PTY resize message
      const dimensions = fitAddon.proposeDimensions();
      if (dimensions) {
        ws.send(
          JSON.stringify({
            type: "resize",
            cols: dimensions.cols,
            rows: dimensions.rows,
          })
        );
      }
    };

    ws.onmessage = async (event) => {
      if (event.data instanceof Blob) {
        const text = await event.data.text();
        term.write(text);
      } else {
        term.write(event.data);
      }
    };

    ws.onclose = () => {
      setStatus("disconnected");
      term.write("\r\n*** CONNECTION CLOSED BY REMOTE ***\r\n");
      addLog("Web SSH Terminal WebSocket connection closed.");
    };

    ws.onerror = (err) => {
      console.error("Terminal WebSocket error:", err);
      term.write("\r\nError: Connection failed.\r\n");
      addLog("Web SSH Terminal WebSocket error.");
    };

    // 3. Send keyboard input from terminal to WebSocket
    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            type: "input",
            data: data,
          })
        );
      }
    });

    // 4. Handle Window Resize Events
    const handleResize = () => {
      if (fitAddonRef.current && ws.readyState === WebSocket.OPEN) {
        try {
          fitAddonRef.current.fit();
          const dimensions = fitAddonRef.current.proposeDimensions();
          if (dimensions) {
            ws.send(
              JSON.stringify({
                type: "resize",
                cols: dimensions.cols,
                rows: dimensions.rows,
              })
            );
          }
        } catch (e) {
          console.warn("PTY Resize synchronization failed:", e);
        }
      }
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      if (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
      term.dispose();
    };
  }, [token, addLog, isDarkMode]);

  useEffect(() => {
    if (isActive && fitAddonRef.current && wsRef.current?.readyState === WebSocket.OPEN) {
      const timer = setTimeout(() => {
        try {
          fitAddonRef.current?.fit();
          const dimensions = fitAddonRef.current?.proposeDimensions();
          if (dimensions) {
            wsRef.current?.send(
              JSON.stringify({
                type: "resize",
                cols: dimensions.cols,
                rows: dimensions.rows,
              })
            );
          }
        } catch (e) {
          console.warn("xterm fit sync failed:", e);
        }
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isActive]);

  return (
    <div className="flex-1 flex flex-col gap-4 w-full h-[calc(100vh-200px)]">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground font-mono uppercase flex items-center gap-2">
            <svg className="w-5 h-5 text-current" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            Web SSH Terminal
          </h2>
          <p className="text-xs text-neutral-500 font-mono mt-0.5">
            Shell commands
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`w-2.5 h-2.5 rounded-full ${
              status === "connected"
                ? "bg-green-500 animate-pulse"
                : status === "connecting"
                ? "bg-yellow-500 animate-pulse"
                : "bg-red-500"
            }`}
          ></span>
          <span className="text-xs font-mono text-neutral-400 uppercase">
            {status}
          </span>
        </div>
      </div>

      <div className="flat-card flex-1 flex flex-col bg-card-sem border border-border-sem rounded p-4 overflow-hidden relative min-h-100">
        <div ref={terminalRef} className="flex-1 w-full h-full min-h-95" />
      </div>
    </div>
  );
}
