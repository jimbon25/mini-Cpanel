import React, { useState, useEffect, useRef, useCallback } from "react";

interface LogsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  token: string | null;
}

export default function LogsDrawer({ isOpen, onClose, projectId, token }: LogsDrawerProps) {
  const [lines, setLines] = useState<string[]>([]);
  const [status, setStatus] = useState<"connecting" | "streaming" | "disconnected">("connecting");
  const [isPaused, setIsPaused] = useState<boolean>(false);
  
  const wsRef = useRef<WebSocket | null>(null);
  const terminalEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isPaused && isOpen) {
      terminalEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [lines, isPaused, isOpen]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    if (!isOpen || !token) {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      timer = setTimeout(() => {
        setLines([]);
        setStatus("disconnected");
      }, 0);
      return () => clearTimeout(timer);
    }

    timer = setTimeout(() => {
      setStatus("connecting");
      setLines([]);
    }, 0);
    
    const wsUrl = `ws://localhost:8080/api/v1/projects/${projectId}/logs/stream?token=${encodeURIComponent(token)}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus("streaming");
    };

    ws.onmessage = (event) => {
      if (!isPaused) {
        setLines((prev) => [...prev, event.data]);
      }
    };

    ws.onclose = () => {
      setStatus("disconnected");
    };

    ws.onerror = () => {
      setStatus("disconnected");
    };

    return () => {
      clearTimeout(timer);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [isOpen, projectId, token, isPaused]);

  const handleClear = useCallback(() => {
    setLines([]);
  }, []);

  const handleTogglePause = useCallback(() => {
    setIsPaused((prev) => !prev);
  }, []);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 flex justify-end z-50 bg-black/40 backdrop-blur-xs select-none">
      {/* Click outside to close */}
      <div className="flex-1" onClick={onClose} />

      {/* Drawer Body */}
      <div 
        className="w-full max-w-lg bg-canvas-dark h-full border-l border-neutral-800 shadow-xl flex flex-col animate-slide-in"
        data-testid="logs-drawer"
      >
        {/* Header */}
        <header className="flex justify-between items-center p-4 border-b border-neutral-800">
          <div>
            <h2 className="text-xs font-mono font-bold text-neutral-400">STREAMING SERVICE LOGS</h2>
            <p className="text-xs font-mono text-white mt-0.5">/{projectId}</p>
          </div>
          
          <div className="flex items-center gap-3">
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                status === "streaming"
                  ? "bg-cobalt animate-pulse"
                  : status === "connecting"
                  ? "bg-amber-500 animate-pulse"
                  : "bg-red-500"
              }`}
            />
            <span className="text-[10px] font-mono text-neutral-500 uppercase">
              {status}
            </span>
            <button
              onClick={onClose}
              className="text-xs text-neutral-400 hover:text-white font-mono ml-2 border border-neutral-800 hover:border-neutral-700 px-2 py-1 rounded"
            >
              CLOSE
            </button>
          </div>
        </header>

        {/* Toolbar */}
        <div className="flex justify-between items-center px-4 py-2 border-b border-neutral-900 bg-neutral-950/20 text-neutral-400 font-mono text-[10px]">
          <div className="flex gap-4">
            <button 
              onClick={handleTogglePause} 
              className={`hover:text-white transition-all uppercase ${isPaused ? "text-amber-500 font-bold" : ""}`}
            >
              {isPaused ? "▶ RESUME" : "⏸ PAUSE"}
            </button>
            <button onClick={handleClear} className="hover:text-white transition-all uppercase">
              ❌ CLEAR
            </button>
          </div>
          <div>
            LINES: {lines.length}
          </div>
        </div>

        {/* Monospace Code Log Screen */}
        <div className="flex-1 p-4 overflow-y-auto font-mono text-xs text-neutral-300 flex flex-col gap-1.5 select-text">
          {lines.length === 0 ? (
            <div className="h-full flex items-center justify-center text-neutral-500 text-xs">
              {status === "connecting" ? "Establishing socket pipeline..." : "No logs received yet."}
            </div>
          ) : (
            lines.map((line, index) => {
              const isSystem = line.startsWith("[System") || line.startsWith("[Docker");
              return (
                <div key={index} className="flex gap-4 items-start leading-relaxed">
                  <span className="text-[10px] text-neutral-700 w-8 select-none text-right">
                    {(index + 1).toString().padStart(3, "0")}
                  </span>
                  <span 
                    className={
                      isSystem 
                        ? "text-cobalt font-bold" 
                        : line.startsWith("[Error") 
                        ? "text-red-400" 
                        : "text-neutral-300"
                    }
                  >
                    {line}
                  </span>
                </div>
              );
            })
          )}
          <div ref={terminalEndRef} />
        </div>
      </div>
    </div>
  );
}
