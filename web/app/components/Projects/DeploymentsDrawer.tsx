import React, { useState, useEffect, useRef, useCallback } from "react";
import { formatLocalDateTime } from "@/app/utils/date";
import { apiClient } from "@/app/utils/apiClient";
import { websocketClient } from "@/app/utils/websocketClient";

export interface Deployment {
  id: string;
  project_id: string;
  commit_sha: string | null;
  commit_message: string | null;
  commit_author: string | null;
  status: "queued" | "building" | "success" | "failed";
  build_logs: string | null;
  created_at: string;
}

interface DeploymentsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  projectName: string;
  token: string | null;
}

export default function DeploymentsDrawer({
  isOpen,
  onClose,
  projectId,
  projectName,
  token,
}: DeploymentsDrawerProps) {
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedDeployment, setSelectedDeployment] = useState<Deployment | null>(null);
  const [wsLogs, setWsLogs] = useState<string[]>([]);
  
  const terminalEndRef = useRef<HTMLDivElement | null>(null);

  const fetchDeployments = useCallback(async (showLoading = false) => {
    if (!projectId || !token) return;
    if (showLoading) {
      setTimeout(() => setLoading(true), 0);
    }
    try {
      const response = await apiClient.fetch(`http://localhost:8080/api/v1/projects/${projectId}/deployments`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!response.ok) throw new Error("Failed to fetch deployments");
      const data = await response.json();
      setDeployments(data);
      setError("");

      // If we have a selected deployment, update its details too (e.g. if it finished building)
      if (selectedDeployment) {
        const updated = data.find((d: Deployment) => d.id === selectedDeployment.id);
        if (updated) {
          setSelectedDeployment(updated);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error fetching deployments");
    } finally {
      if (showLoading) {
        setTimeout(() => setLoading(false), 0);
      }
    }
  }, [projectId, token, selectedDeployment]);

  // Load and poll deployments
  useEffect(() => {
    let timerId: ReturnType<typeof setTimeout> | null = null;
    let intervalId: ReturnType<typeof setInterval> | null = null;
    let clearTimerId: ReturnType<typeof setTimeout> | null = null;

    if (isOpen && token && projectId) {
      timerId = setTimeout(() => {
        fetchDeployments(true);
      }, 0);
      
      intervalId = setInterval(() => {
        fetchDeployments(false);
      }, 3000);
    } else {
      clearTimerId = setTimeout(() => {
        setDeployments([]);
        setSelectedDeployment(null);
        setError("");
      }, 0);
    }

    return () => {
      if (timerId) clearTimeout(timerId);
      if (intervalId) clearInterval(intervalId);
      if (clearTimerId) clearTimeout(clearTimerId);
    };
  }, [isOpen, projectId, token, fetchDeployments]);

  const selectedDepId = selectedDeployment?.id;
  const selectedDepStatus = selectedDeployment?.status;
  const isBuilding = selectedDepStatus === "building" || selectedDepStatus === "queued";

  useEffect(() => {
    if (!selectedDepId || !isBuilding || !token || !isOpen) {
      return;
    }

    const wsUrl = `ws://localhost:8080/api/v1/projects/${projectId}/deployments/${selectedDepId}/stream?token=${encodeURIComponent(token)}`;
    const ws = websocketClient.create(wsUrl);

    ws.onmessage = (event) => {
      setWsLogs((prev) => [...prev, event.data]);
    };

    ws.onerror = (err) => {
      console.error("Build logs WebSocket error:", err);
    };

    return () => {
      setWsLogs([]);
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
    };
  }, [selectedDepId, isBuilding, token, projectId, isOpen]);

  // Auto scroll in logs view
  useEffect(() => {
    if (selectedDeployment && isOpen) {
      terminalEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [selectedDeployment?.build_logs, wsLogs, selectedDeployment, isOpen]);

  const handleClose = () => {
    setSelectedDeployment(null);
    onClose();
  };

  const logsToRender = wsLogs.length > 0
    ? wsLogs
    : selectedDeployment?.build_logs
      ? selectedDeployment.build_logs.split("\n")
      : [];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 flex justify-end z-50 bg-black/40 backdrop-blur-sm select-none">
      {/* Click outside to close */}
      <div className="flex-1" onClick={handleClose} />

      {/* Drawer Body */}
      <div 
        className="w-full max-w-xl bg-card-sem h-full border-l border-border-sem shadow-xl flex flex-col animate-slide-in text-xs text-foreground-sem"
        data-testid="deployments-drawer"
      >
        {/* Header */}
        <header className="flex justify-between items-center p-4 border-b border-border-sem select-none">
          <div>
            <h2 className="text-xs font-mono font-bold text-muted-sem">DEPLOYMENT HISTORY</h2>
            <p className="text-xs font-mono text-foreground-sem mt-0.5">{projectName}</p>
          </div>
          
          <button
            onClick={handleClose}
            className="text-xs text-muted-sem hover:text-foreground-sem font-mono border border-border-sem hover:border-border-sem px-2 py-1 rounded transition-all"
          >
            CLOSE
          </button>
        </header>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto flex flex-col min-h-0 bg-input-sem/10">
          {error && (
            <div className="p-4 text-xs text-red-500 font-mono border-b border-border-sem bg-red-500/5">
              Error: {error}
            </div>
          )}

          {!selectedDeployment ? (
            // LIST VIEW
            <div className="p-4 flex flex-col gap-3 flex-1 overflow-y-auto select-none">
              {deployments.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-muted-sem font-mono italic">
                  {loading ? "Loading deployments..." : "No deployments recorded yet."}
                </div>
              ) : (
                deployments.map((dep) => {
                  const isSuccess = dep.status === "success";
                  const isFailed = dep.status === "failed";
                  const isBuilding = dep.status === "building" || dep.status === "queued";

                  return (
                    <div
                      key={dep.id}
                      onClick={() => setSelectedDeployment(dep)}
                      className="border border-border-sem rounded-lg p-3 bg-card-sem hover:bg-input-sem hover:border-border-sem transition-all cursor-pointer flex flex-col gap-2"
                    >
                      <div className="flex justify-between items-center">
                        <span className="font-mono text-[10px] text-muted-sem">
                          {formatLocalDateTime(dep.created_at)}
                        </span>
                        <span
                          className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded tracking-wider border uppercase select-none ${
                            isSuccess
                              ? "text-cobalt border-cobalt/30 bg-cobalt/5"
                              : isBuilding
                              ? "text-amber-500 border-amber-500/30 bg-amber-500/5 animate-pulse"
                              : isFailed
                              ? "text-red-500 border-red-500/30 bg-red-500/5"
                              : "text-muted-sem border-border-sem"
                          }`}
                        >
                          {dep.status}
                        </span>
                      </div>

                      {dep.commit_sha ? (
                        <div className="flex flex-col gap-1">
                          <div className="font-mono text-foreground-sem truncate max-w-full text-xs font-semibold">
                            {dep.commit_message}
                          </div>
                          <div className="flex items-center gap-1.5 font-mono text-[10px] text-muted-sem">
                            <span className="text-cobalt font-bold select-all">{dep.commit_sha.substring(0, 7)}</span>
                            <span>by</span>
                            <span className="text-foreground-sem font-bold">{dep.commit_author}</span>
                          </div>
                        </div>
                      ) : (
                        <div className="font-mono text-muted-sem italic text-[10px]">
                          Manual deployment trigger
                        </div>
                      )}

                      <div className="mt-1 flex justify-end">
                        <span className="text-[10px] font-mono text-cobalt hover:underline">
                          View Build Logs →
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          ) : (
            // LOGS VIEW
            <div className="flex-1 flex flex-col min-h-0">
              {/* Logs Sub-header */}
              <div className="flex justify-between items-center px-4 py-2 border-b border-border-sem bg-input-sem text-muted-sem font-mono text-[10px] select-none">
                <button
                  onClick={() => setSelectedDeployment(null)}
                  className="hover:text-foreground-sem transition-all uppercase flex items-center gap-1"
                >
                  ← BACK TO LIST
                </button>
                <div className="flex items-center gap-1.5">
                  <span className="uppercase">Status:</span>
                  <span
                    className={
                      selectedDeployment.status === "success"
                        ? "text-cobalt font-bold"
                        : selectedDeployment.status === "failed"
                        ? "text-red-500 font-bold"
                        : "text-amber-500 font-bold"
                    }
                  >
                    {selectedDeployment.status}
                  </span>
                </div>
              </div>

              {/* Commit info header in logs */}
              {selectedDeployment.commit_sha && (
                <div className="px-4 py-2 border-b border-border-sem bg-input-sem/30 text-foreground-sem font-mono text-[10px] flex flex-col gap-0.5 select-none">
                  <div>
                    <span className="text-muted-sem uppercase mr-2">Commit:</span>
                    <span className="font-bold">{selectedDeployment.commit_message}</span>
                  </div>
                  <div className="flex gap-4">
                    <div>
                      <span className="text-muted-sem uppercase mr-2">Author:</span>
                      <span>{selectedDeployment.commit_author}</span>
                    </div>
                    <div>
                      <span className="text-muted-sem uppercase mr-2">SHA:</span>
                      <span className="text-cobalt font-bold select-all">{selectedDeployment.commit_sha}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Log Monospace Output */}
              <div className="flex-1 p-4 overflow-y-auto font-mono text-[11px] text-foreground-sem flex flex-col gap-1.5 select-text bg-input-sem/20">
                {logsToRender.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-muted-sem text-xs select-none">
                    {selectedDeployment.status === "building" || selectedDeployment.status === "queued"
                      ? "Build in progress... waiting for logs."
                      : "No logs recorded for this deployment."}
                  </div>
                ) : (
                  logsToRender.map((line, index) => {
                    const isCommand = line.includes("Running command:");
                    const isError = line.includes("Stderr:") || line.includes("Deployment failed") || line.includes("returned code: -1");
                    
                    return (
                      <div key={index} className="flex gap-4 items-start leading-relaxed">
                        <span className="text-[9px] text-muted-sem w-8 select-none text-right">
                          {(index + 1).toString().padStart(3, "0")}
                        </span>
                        <span 
                          className={
                            isCommand 
                              ? "text-cobalt font-bold" 
                              : isError 
                              ? "text-red-400" 
                              : "text-foreground-sem"
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
          )}
        </div>
      </div>
    </div>
  );
}
