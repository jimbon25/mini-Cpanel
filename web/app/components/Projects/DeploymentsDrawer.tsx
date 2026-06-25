import React, { useState, useEffect, useRef, useCallback } from "react";
import { formatLocalDateTime } from "@/app/utils/date";

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
  
  const terminalEndRef = useRef<HTMLDivElement | null>(null);

  const fetchDeployments = useCallback(async (showLoading = false) => {
    if (!projectId || !token) return;
    if (showLoading) {
      setTimeout(() => setLoading(true), 0);
    }
    try {
      const response = await fetch(`http://localhost:8080/api/v1/projects/${projectId}/deployments`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!response.ok) throw new Error("Failed to fetch deployments");
      const data = await response.json();
      setDeployments(data);
      setError("");

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

  useEffect(() => {
    if (selectedDeployment && isOpen) {
      terminalEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [selectedDeployment?.build_logs, selectedDeployment, isOpen]);

  const handleClose = () => {
    setSelectedDeployment(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 flex justify-end z-50 bg-black/40 backdrop-blur-xs select-none">
      {/* Click outside to close */}
      <div className="flex-1" onClick={handleClose} />

      {/* Drawer Body */}
      <div 
        className="w-full max-w-xl bg-canvas-dark h-full border-l border-neutral-800 shadow-xl flex flex-col animate-slide-in text-xs"
        data-testid="deployments-drawer"
      >
        {/* Header */}
        <header className="flex justify-between items-center p-4 border-b border-neutral-800 select-none">
          <div>
            <h2 className="text-xs font-mono font-bold text-neutral-400">DEPLOYMENT HISTORY</h2>
            <p className="text-xs font-mono text-white mt-0.5">{projectName}</p>
          </div>
          
          <button
            onClick={handleClose}
            className="text-xs text-neutral-400 hover:text-white font-mono border border-neutral-800 hover:border-neutral-700 px-2 py-1 rounded transition-all"
          >
            CLOSE
          </button>
        </header>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto flex flex-col min-h-0 bg-neutral-950/10">
          {error && (
            <div className="p-4 text-xs text-red-500 font-mono border-b border-neutral-900 bg-red-500/5">
              Error: {error}
            </div>
          )}

          {!selectedDeployment ? (
            // LIST VIEW
            <div className="p-4 flex flex-col gap-3 flex-1 overflow-y-auto select-none">
              {deployments.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-neutral-500 font-mono italic">
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
                      className="border border-neutral-800/80 rounded-lg p-3 bg-neutral-900/30 hover:bg-neutral-900/60 hover:border-neutral-700 transition-all cursor-pointer flex flex-col gap-2"
                    >
                      <div className="flex justify-between items-center">
                        <span className="font-mono text-[10px] text-neutral-500">
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
                              : "text-neutral-400 border-neutral-800"
                          }`}
                        >
                          {dep.status}
                        </span>
                      </div>

                      {dep.commit_sha ? (
                        <div className="flex flex-col gap-1">
                          <div className="font-mono text-neutral-200 truncate max-w-full text-xs font-semibold">
                            {dep.commit_message}
                          </div>
                          <div className="flex items-center gap-1.5 font-mono text-[10px] text-neutral-400">
                            <span className="text-cobalt font-bold select-all">{dep.commit_sha.substring(0, 7)}</span>
                            <span>by</span>
                            <span className="text-neutral-300 font-bold">{dep.commit_author}</span>
                          </div>
                        </div>
                      ) : (
                        <div className="font-mono text-neutral-400 italic text-[10px]">
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
              <div className="flex justify-between items-center px-4 py-2 border-b border-neutral-900 bg-neutral-950/20 text-neutral-400 font-mono text-[10px] select-none">
                <button
                  onClick={() => setSelectedDeployment(null)}
                  className="hover:text-white transition-all uppercase flex items-center gap-1"
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
                <div className="px-4 py-2 border-b border-neutral-900 bg-neutral-900/10 text-neutral-300 font-mono text-[10px] flex flex-col gap-0.5 select-none">
                  <div>
                    <span className="text-neutral-500 uppercase mr-2">Commit:</span>
                    <span className="font-bold">{selectedDeployment.commit_message}</span>
                  </div>
                  <div className="flex gap-4">
                    <div>
                      <span className="text-neutral-500 uppercase mr-2">Author:</span>
                      <span>{selectedDeployment.commit_author}</span>
                    </div>
                    <div>
                      <span className="text-neutral-500 uppercase mr-2">SHA:</span>
                      <span className="text-cobalt font-bold select-all">{selectedDeployment.commit_sha}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Log Monospace Output */}
              <div className="flex-1 p-4 overflow-y-auto font-mono text-[11px] text-neutral-300 flex flex-col gap-1.5 select-text bg-neutral-950/40">
                {!selectedDeployment.build_logs ? (
                  <div className="h-full flex items-center justify-center text-neutral-500 text-xs select-none">
                    {selectedDeployment.status === "building" || selectedDeployment.status === "queued"
                      ? "Build in progress... waiting for logs."
                      : "No logs recorded for this deployment."}
                  </div>
                ) : (
                  selectedDeployment.build_logs.split("\n").map((line, index) => {
                    const isCommand = line.includes("Running command:");
                    const isError = line.includes("Stderr:") || line.includes("Deployment failed") || line.includes("returned code: -1");
                    
                    return (
                      <div key={index} className="flex gap-4 items-start leading-relaxed">
                        <span className="text-[9px] text-neutral-700 w-8 select-none text-right">
                          {(index + 1).toString().padStart(3, "0")}
                        </span>
                        <span 
                          className={
                            isCommand 
                              ? "text-cobalt font-bold" 
                              : isError 
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
          )}
        </div>
      </div>
    </div>
  );
}
