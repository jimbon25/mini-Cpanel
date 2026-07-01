import React, { useState, useEffect, useCallback } from "react";
import { apiClient } from "@/app/utils/apiClient";
import { useNotification } from "@/app/context/NotificationContext";

interface DockerTabProps {
  token: string;
  addLog: (msg: string) => void;
}

interface ContainerItem {
  id: string;
  name: string;
  image: string;
  status: string;
  state: string;
  ports: string;
}

interface ContainerStats {
  cpu: string;
  mem_usage: string;
  mem_perc: string;
}

interface ImageItem {
  id: string;
  repository: string;
  tag: string;
  size: string;
  created: string;
}

interface VolumeItem {
  name: string;
  driver: string;
}

interface NetworkItem {
  id: string;
  name: string;
  driver: string;
  scope: string;
}

type SubTab = "containers" | "images" | "volumes" | "networks";

export default function DockerTab({ token, addLog }: DockerTabProps) {
  const { showToast, confirm } = useNotification();
  const [subTab, setSubTab] = useState<SubTab>("containers");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Data States
  const [containers, setContainers] = useState<ContainerItem[]>([]);
  const [images, setImages] = useState<ImageItem[]>([]);
  const [volumes, setVolumes] = useState<VolumeItem[]>([]);
  const [networks, setNetworks] = useState<NetworkItem[]>([]);

  // Stats & Logs
  const [stats, setStats] = useState<Record<string, ContainerStats>>({});
  const [activeLogsId, setActiveLogsId] = useState<string | null>(null);
  const [logsText, setLogsText] = useState("");
  const [logsLoading, setLogsLoading] = useState(false);

  // Fetch functions
  const fetchContainers = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await apiClient.fetch("http://localhost:8080/api/v1/docker/containers", {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error("Failed to fetch Docker containers");
      const data = await res.json();
      setContainers(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load containers";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [token]);

  const fetchImages = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await apiClient.fetch("http://localhost:8080/api/v1/docker/images", {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error("Failed to fetch Docker images");
      const data = await res.json();
      setImages(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load images";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [token]);

  const fetchVolumes = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await apiClient.fetch("http://localhost:8080/api/v1/docker/volumes", {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error("Failed to fetch Docker volumes");
      const data = await res.json();
      setVolumes(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load volumes";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [token]);

  const fetchNetworks = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await apiClient.fetch("http://localhost:8080/api/v1/docker/networks", {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error("Failed to fetch Docker networks");
      const data = await res.json();
      setNetworks(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load networks";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [token]);

  // Load appropriate data on subTab changes
  useEffect(() => {
    const timer = setTimeout(() => {
      if (subTab === "containers") fetchContainers();
      if (subTab === "images") fetchImages();
      if (subTab === "volumes") fetchVolumes();
      if (subTab === "networks") fetchNetworks();
    }, 0);
    return () => clearTimeout(timer);
  }, [subTab, fetchContainers, fetchImages, fetchVolumes, fetchNetworks]);

  // Real-time stats fetcher
  const fetchContainerStats = useCallback(async (containerId: string) => {
    try {
      const res = await apiClient.fetch(`http://localhost:8080/api/v1/docker/containers/${containerId}/stats`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setStats(prev => ({ ...prev, [containerId]: data }));
      }
    } catch {
      // Ignore background stats fetch errors silently
    }
  }, [token]);

  // Poll stats for running containers every 5s
  useEffect(() => {
    if (subTab !== "containers" || containers.length === 0) return;
    
    const runningContainers = containers.filter(c => c.state === "running");
    if (runningContainers.length === 0) return;

    // Run initial fetch
    runningContainers.forEach(c => fetchContainerStats(c.id));

    const interval = setInterval(() => {
      runningContainers.forEach(c => fetchContainerStats(c.id));
    }, 5000);

    return () => clearInterval(interval);
  }, [subTab, containers, fetchContainerStats]);

  // Action Triggers
  const handleContainerAction = (containerId: string, name: string, action: "start" | "stop" | "restart" | "remove") => {
    const executeAction = async () => {
      addLog(`[Docker] Executing ${action} on container '${name}'...`);
      try {
        const res = await apiClient.fetch(`http://localhost:8080/api/v1/docker/containers/${containerId}/action`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ action })
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({ detail: `Action ${action} failed` }));
          throw new Error(errData.detail || `Action ${action} failed`);
        }

        showToast(`Container '${name}' successfully ${action}ed.`, "success");
        addLog(`[Docker] Container '${name}' successfully ${action}ed.`);
        fetchContainers();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed to execute action";
        showToast(msg, "error");
        addLog(`[Docker Error] ${msg}`);
      }
    };

    if (action === "remove") {
      confirm({
        message: `Are you sure you want to remove container '${name}'?`,
        onConfirm: executeAction
      });
    } else {
      executeAction();
    }
  };

  // Image Prune Trigger
  const handlePruneImages = () => {
    confirm({
      message: "Are you sure you want to prune dangling Docker images? This will delete all unused images.",
      onConfirm: async () => {
        addLog("[Docker] Pruning unused images...");
        try {
          const res = await apiClient.fetch("http://localhost:8080/api/v1/docker/images/prune", {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` }
          });
          if (!res.ok) throw new Error("Image prune failed");
          const data = await res.json();
          showToast("Dangling images pruned successfully", "success");
          addLog(`[Docker] ${data.message || "Prune success"}`);
          fetchImages();
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "Image prune failed";
          showToast(msg, "error");
          addLog(`[Docker Error] ${msg}`);
        }
      }
    });
  };

  // Logs Modal Trigger
  const handleViewLogs = async (containerId: string, name: string) => {
    setActiveLogsId(containerId);
    setLogsLoading(true);
    setLogsText("");
    addLog(`[Docker] Loading logs for container '${name}'...`);
    try {
      const res = await apiClient.fetch(`http://localhost:8080/api/v1/docker/containers/${containerId}/logs?tail=300`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error("Failed to load logs");
      const data = await res.json();
      setLogsText(data.logs || "No logs available.");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load logs";
      setLogsText(`Error: ${msg}`);
    } finally {
      setLogsLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Tab Navigation header */}
      <header className="flex justify-between items-center border-b border-border-sem pb-2">
        <div className="flex items-center gap-6">
          <button
            onClick={() => setSubTab("containers")}
            className={`text-xs font-mono font-bold uppercase pb-2 border-b-2 transition-all ${
              subTab === "containers" ? "border-cobalt text-foreground" : "border-transparent text-muted-sem hover:text-foreground"
            }`}
          >
            Containers
          </button>
          <button
            onClick={() => setSubTab("images")}
            className={`text-xs font-mono font-bold uppercase pb-2 border-b-2 transition-all ${
              subTab === "images" ? "border-cobalt text-foreground" : "border-transparent text-muted-sem hover:text-foreground"
            }`}
          >
            Images
          </button>
          <button
            onClick={() => setSubTab("volumes")}
            className={`text-xs font-mono font-bold uppercase pb-2 border-b-2 transition-all ${
              subTab === "volumes" ? "border-cobalt text-foreground" : "border-transparent text-muted-sem hover:text-foreground"
            }`}
          >
            Volumes
          </button>
          <button
            onClick={() => setSubTab("networks")}
            className={`text-xs font-mono font-bold uppercase pb-2 border-b-2 transition-all ${
              subTab === "networks" ? "border-cobalt text-foreground" : "border-transparent text-muted-sem hover:text-foreground"
            }`}
          >
            Networks
          </button>
        </div>

        {subTab === "images" && (
          <button
            onClick={handlePruneImages}
            className="btn-danger text-xs font-mono py-1 px-3"
          >
            PRUNE IMAGES
          </button>
        )}
      </header>

      {/* Main Content Areas */}
      {loading ? (
        <div className="p-8 text-center text-xs text-muted-sem font-mono">Loading data from Docker daemon...</div>
      ) : error ? (
        <div className="p-4 border-l-2 border-red-500 bg-red-500/5 text-xs text-red-500 font-mono">
          {error}
        </div>
      ) : (
        <>
          {/* CONTAINERS */}
          {subTab === "containers" && (
            <div className="grid grid-cols-1 gap-4">
              {containers.length === 0 ? (
                <div className="p-8 text-center text-xs text-muted-sem font-mono flat-card bg-neutral-50/50 dark:bg-neutral-900/10">
                  No Docker containers found on the host system.
                </div>
              ) : (
                containers.map(c => {
                  const running = c.state === "running";
                  const containerStats = stats[c.id];
                  return (
                    <article
                      key={c.id}
                      className="flat-card p-3 flex flex-col md:flex-row justify-between items-start md:items-center gap-3 border border-border-sem rounded-lg bg-card-sem text-xs"
                    >
                      <div className="flex flex-col gap-1 flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span
                            className={`w-2 h-2 rounded-full ${
                              running ? "bg-green-500 animate-pulse" : "bg-neutral-500"
                            }`}
                          ></span>
                          <h3 className="font-mono text-xs font-bold text-foreground truncate">{c.name}</h3>
                          <span className="text-[10px] text-muted-sem font-mono truncate max-w-xs">({c.image})</span>
                        </div>
                        
                        <div className="text-[10px] text-neutral-500 font-mono flex flex-wrap gap-x-6 gap-y-1">
                          <span>ID: {c.id.substring(0, 12)}</span>
                          <span>STATUS: {c.status}</span>
                          {c.ports && <span>PORTS: {c.ports}</span>}
                        </div>

                        {/* CPU / RAM Stats usage bar */}
                        {running && containerStats && (
                          <div className="grid grid-cols-2 gap-4 mt-2 border-t border-border-sem pt-2 max-w-md">
                            <div className="flex flex-col gap-0.5">
                              <span className="text-[9px] text-neutral-400 font-mono">CPU USAGE</span>
                              <span className="text-xs font-bold font-mono">{containerStats.cpu}</span>
                            </div>
                            <div className="flex flex-col gap-0.5">
                              <span className="text-[9px] text-neutral-400 font-mono">MEM USAGE</span>
                              <span className="text-xs font-bold font-mono">
                                {containerStats.mem_usage} ({containerStats.mem_perc})
                              </span>
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0 select-none">
                        {running ? (
                          <button
                            onClick={() => handleContainerAction(c.id, c.name, "stop")}
                            className="border border-border-sem hover:bg-amber-500/10 text-amber-500 rounded px-2 py-0.5 text-[11px] font-mono transition-all"
                            title="Stop Container"
                          >
                            STOP
                          </button>
                        ) : (
                          <button
                            onClick={() => handleContainerAction(c.id, c.name, "start")}
                            className="border border-border-sem hover:bg-green-500/10 text-green-500 rounded px-2 py-0.5 text-[11px] font-mono transition-all"
                            title="Start Container"
                          >
                            START
                          </button>
                        )}
                        <button
                          onClick={() => handleContainerAction(c.id, c.name, "restart")}
                          className="border border-border-sem hover:bg-indigo-500/10 text-indigo-500 rounded px-2 py-0.5 text-[11px] font-mono transition-all"
                          title="Restart Container"
                        >
                          RESTART
                        </button>
                        <button
                          onClick={() => handleViewLogs(c.id, c.name)}
                          className="border border-border-sem hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-400 hover:text-white rounded px-2 py-0.5 text-[11px] font-mono transition-all"
                          title="View Logs"
                        >
                          LOGS
                        </button>
                        <button
                          onClick={() => handleContainerAction(c.id, c.name, "remove")}
                          className="border border-border-sem hover:bg-red-500/10 text-neutral-400 hover:text-red-500 rounded px-2 py-0.5 text-[11px] font-mono transition-all"
                          title="Remove Container"
                        >
                          REMOVE
                        </button>
                      </div>
                    </article>
                  );
                })
              )}
            </div>
          )}

          {/* IMAGES */}
          {subTab === "images" && (
            <div className="flat-card bg-card-sem divide-y divide-neutral-200 dark:divide-neutral-800 overflow-x-auto">
              <table className="w-full text-left font-mono text-xs">
                <thead>
                  <tr className="bg-neutral-50/50 dark:bg-neutral-900/10 text-neutral-400 text-[10px] uppercase">
                    <th className="p-2.5">Repository</th>
                    <th className="p-2.5">Tag</th>
                    <th className="p-2.5">Image ID</th>
                    <th className="p-2.5">Created</th>
                    <th className="p-2.5 text-right">Size</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                  {images.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-6 text-center text-muted-sem">No Docker images found.</td>
                    </tr>
                  ) : (
                    images.map(img => (
                      <tr key={img.id} className="hover:bg-neutral-50/30 dark:hover:bg-neutral-900/10">
                        <td className="p-2.5 font-bold text-foreground">{img.repository}</td>
                        <td className="p-2.5 text-muted-sem">{img.tag}</td>
                        <td className="p-2.5 text-neutral-400">{img.id.substring(0, 12)}</td>
                        <td className="p-2.5 text-neutral-500">{img.created}</td>
                        <td className="p-2.5 text-right font-bold">{img.size}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* VOLUMES */}
          {subTab === "volumes" && (
            <div className="flat-card bg-card-sem divide-y divide-neutral-200 dark:divide-neutral-800 overflow-x-auto">
              <table className="w-full text-left font-mono text-xs">
                <thead>
                  <tr className="bg-neutral-50/50 dark:bg-neutral-900/10 text-neutral-400 text-[10px] uppercase">
                    <th className="p-2.5">Volume Name</th>
                    <th className="p-2.5 text-right">Driver</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                  {volumes.length === 0 ? (
                    <tr>
                      <td colSpan={2} className="p-6 text-center text-muted-sem">No Docker volumes found.</td>
                    </tr>
                  ) : (
                    volumes.map(vol => (
                      <tr key={vol.name} className="hover:bg-neutral-50/30 dark:hover:bg-neutral-900/10">
                        <td className="p-2.5 text-foreground font-bold break-all">{vol.name}</td>
                        <td className="p-2.5 text-right text-muted-sem font-bold">{vol.driver}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* NETWORKS */}
          {subTab === "networks" && (
            <div className="flat-card bg-card-sem divide-y divide-neutral-200 dark:divide-neutral-800 overflow-x-auto">
              <table className="w-full text-left font-mono text-xs">
                <thead>
                  <tr className="bg-neutral-50/50 dark:bg-neutral-900/10 text-neutral-400 text-[10px] uppercase">
                    <th className="p-2.5">Network Name</th>
                    <th className="p-2.5">Network ID</th>
                    <th className="p-2.5">Driver</th>
                    <th className="p-2.5 text-right">Scope</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                  {networks.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="p-6 text-center text-muted-sem">No Docker networks found.</td>
                    </tr>
                  ) : (
                    networks.map(net => (
                      <tr key={net.id} className="hover:bg-neutral-50/30 dark:hover:bg-neutral-900/10">
                        <td className="p-2.5 text-foreground font-bold">{net.name}</td>
                        <td className="p-2.5 text-neutral-400">{net.id.substring(0, 12)}</td>
                        <td className="p-2.5 text-muted-sem font-bold">{net.driver}</td>
                        <td className="p-2.5 text-right text-neutral-500">{net.scope}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Logs View Modal / Overlay */}
      {activeLogsId && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="w-full max-w-4xl flat-card bg-canvas-dark text-neutral-200 flex flex-col h-[70vh] border-neutral-800 rounded-lg overflow-hidden shadow-2xl">
            <header className="flex justify-between items-center p-4 border-b border-neutral-800 bg-[#0c0c0e]">
              <div>
                <h3 className="text-xs font-mono font-bold text-neutral-400">CONTAINER LOGS</h3>
                <p className="text-[10px] font-mono text-neutral-500 mt-0.5">ID: {activeLogsId}</p>
              </div>
              <button
                onClick={() => setActiveLogsId(null)}
                className="text-xs text-neutral-400 hover:text-white font-mono bg-transparent border-0 cursor-pointer"
              >
                CLOSE
              </button>
            </header>

            <div className="flex-1 p-4 overflow-y-auto bg-[#040405] font-mono text-[11px] leading-relaxed whitespace-pre-wrap select-text">
              {logsLoading ? (
                <div className="text-neutral-500 text-center py-8">Fetching container logs...</div>
              ) : (
                logsText
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

