import React, { useState, useEffect, useCallback, useRef } from "react";
import ConfigureProjectModal from "./ConfigureProjectModal";
import DeploymentsDrawer from "./DeploymentsDrawer";
import EditConfigModal from "./EditConfigModal";
import { parseUTCDate, formatLocalDateTime } from "@/app/utils/date";
import { apiClient } from "@/app/utils/apiClient";
import { formatBytes } from "@/app/utils/helpers";
import { useNotification } from "@/app/context/NotificationContext";


export interface DomainResponse {
  id: string;
  project_id: string;
  domain_name: string;
  ssl_enabled: boolean;
  ssl_expiry: string | null;
  ssl_provider: string | null;
}

export interface Project {
  id: string;
  name: string;
  provider: string;
  git_repo: string | null;
  branch: string | null;
  port: number | null;
  status: "deploying" | "online" | "offline" | "failed";
  env_vars: string | null;
  last_deployed: string | null;
  webhook_secret: string | null;
  domains: DomainResponse[];
  ping_latency_ms: number | null;
  ping_error_detail: string | null;
  enable_http_ping: boolean;
  cpu_usage?: number;
  memory_usage?: number;
}

interface ProjectsTabProps {
  token: string | null;
  addLog: (msg: string) => void;
  setLogsProjectId: (id: string) => void;
  setLogsDrawerOpen: (open: boolean) => void;
}

export default function ProjectsTab({
  token,
  addLog,
  setLogsProjectId,
  setLogsDrawerOpen,
}: ProjectsTabProps) {
  const { confirm, showToast } = useNotification();
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsError, setProjectsError] = useState("");
  const [deployModalOpen, setDeployModalOpen] = useState(false);
  const [deploymentsDrawerOpen, setDeploymentsDrawerOpen] = useState(false);
  const [deploymentsProjectId, setDeploymentsProjectId] = useState("");
  const [deploymentsProjectName, setDeploymentsProjectName] = useState("");
  const [activeDropdownId, setActiveDropdownId] = useState<string | null>(null);
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [configProjectId, setConfigProjectId] = useState("");
  const [configProjectName, setConfigProjectName] = useState("");

  // Close dropdown on click outside
  useEffect(() => {
    const handleGlobalClick = () => {
      setActiveDropdownId(null);
    };
    window.addEventListener("click", handleGlobalClick);
    return () => {
      window.removeEventListener("click", handleGlobalClick);
    };
  }, []);

  const fetchProjects = useCallback(async () => {
    setProjectsError("");
    try {
      const response = await apiClient.fetch("http://localhost:8080/api/v1/projects", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) throw new Error("Failed to load projects list");
      const data = await response.json();
      setProjects(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load projects";
      setProjectsError(msg);
      addLog(`Projects Error: ${msg}`);
    }
  }, [token, addLog]);

  const handleCreateProject = useCallback(async (formData: {
    name: string;
    provider: string;
    git_repo: string | null;
    branch: string;
    port: number | null;
    env_vars: string | null;
    enable_http_ping: boolean;
  }) => {
    try {
      const response = await apiClient.fetch("http://localhost:8080/api/v1/projects", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "Failed to configure project");
      }

      addLog(`Project ${formData.name} created successfully.`);
      showToast(`Project ${formData.name} created successfully.`, "success");
      setDeployModalOpen(false);
      fetchProjects();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Project creation failed";
      showToast(msg, "error");
      addLog(`Projects Error: ${msg}`);
    }
  }, [token, fetchProjects, addLog, showToast]);

  const handleDeployProject = useCallback((projectId: string, projectName: string) => {
    confirm({
      message: "Are you sure you trust this repository before deploying?",
      onConfirm: async () => {
        addLog(`Initiating deploy process for ${projectName}...`);
        try {
          const response = await apiClient.fetch(`http://localhost:8080/api/v1/projects/${projectId}/deploy`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });

          if (!response.ok) throw new Error("Deployment trigger failed");
          
          addLog(`Deployment triggered for ${projectName}. Executing in background.`);
          showToast(`Deployment triggered for ${projectName}.`, "success");
          fetchProjects();
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Deployment failed";
          addLog(`Projects Error: ${msg}`);
          showToast(msg, "error");
        }
      }
    });
  }, [token, fetchProjects, addLog, confirm, showToast]);

  const handleStartProject = useCallback(async (projectId: string, projectName: string) => {
    addLog(`Starting service: ${projectName}...`);
    try {
      const response = await apiClient.fetch(`http://localhost:8080/api/v1/projects/${projectId}/start`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) throw new Error("Start command failed");
      
      addLog(`Service ${projectName} started.`);
      showToast(`Service ${projectName} started.`, "success");
      fetchProjects();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to start service";
      addLog(`Projects Error: ${msg}`);
      showToast(msg, "error");
    }
  }, [token, fetchProjects, addLog, showToast]);

  const handleStopProject = useCallback(async (projectId: string, projectName: string) => {
    addLog(`Stopping service: ${projectName}...`);
    try {
      const response = await apiClient.fetch(`http://localhost:8080/api/v1/projects/${projectId}/stop`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) throw new Error("Stop command failed");
      
      addLog(`Service ${projectName} stopped.`);
      showToast(`Service ${projectName} stopped.`, "success");
      fetchProjects();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to stop service";
      addLog(`Projects Error: ${msg}`);
      showToast(msg, "error");
    }
  }, [token, fetchProjects, addLog, showToast]);

  const handleDeleteProject = useCallback((projectId: string, projectName: string) => {
    confirm({
      message: `Are you sure you want to delete project '${projectName}'? This will stop any active processes.`,
      confirmText: "DELETE",
      onConfirm: async () => {
        try {
          const response = await apiClient.fetch(`http://localhost:8080/api/v1/projects/${projectId}`, {
            method: "DELETE",
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });

          if (!response.ok) throw new Error("Failed to delete project");
          
          addLog(`Deleted project config: ${projectName}`);
          showToast(`Project '${projectName}' has been deleted.`, "success");
          fetchProjects();
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Failed to delete project";
          addLog(`Projects Error: ${msg}`);
          showToast(msg, "error");
        }
      }
    });
  }, [token, fetchProjects, addLog, confirm, showToast]);

  const handleToggleHttpPing = useCallback(async (projectId: string, currentVal: boolean) => {
    try {
      const response = await apiClient.fetch(`http://localhost:8080/api/v1/projects/${projectId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ enable_http_ping: !currentVal }),
      });

      if (!response.ok) throw new Error("Failed to update ping settings");
      
      addLog(`HTTP Ping monitoring ${!currentVal ? "enabled" : "disabled"} for project.`);
      showToast(`HTTP Ping monitoring ${!currentVal ? "enabled" : "disabled"} successfully.`, "success");
      fetchProjects();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to toggle ping";
      addLog(`Projects Error: ${msg}`);
      showToast(msg, "error");
    }
  }, [token, fetchProjects, addLog, showToast]);

  const handleAddDomain = useCallback(async (projectId: string, domainName: string) => {
    addLog(`Adding domain mapping ${domainName} to project...`);
    try {
      const response = await apiClient.fetch(`http://localhost:8080/api/v1/projects/${projectId}/domains`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ domain_name: domainName }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "Failed to add domain mapping");
      }

      addLog(`Domain ${domainName} successfully mapped.`);
      showToast(`Domain ${domainName} mapped successfully.`, "success");
      fetchProjects();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to add domain";
      showToast(msg, "error");
      addLog(`Domains Error: ${msg}`);
    }
  }, [token, fetchProjects, addLog, showToast]);

  const handleRemoveDomain = useCallback((projectId: string, domainId: string) => {
    confirm({
      message: "Are you sure you want to remove this domain mapping?",
      confirmText: "REMOVE",
      onConfirm: async () => {
        addLog(`Removing domain mapping...`);
        try {
          const response = await apiClient.fetch(`http://localhost:8080/api/v1/projects/${projectId}/domains/${domainId}`, {
            method: "DELETE",
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });

          if (!response.ok) throw new Error("Failed to remove domain mapping");

          addLog(`Domain mapping removed.`);
          showToast("Domain mapping removed successfully.", "success");
          fetchProjects();
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Failed to remove domain";
          addLog(`Domains Error: ${msg}`);
          showToast(msg, "error");
        }
      }
    });
  }, [token, fetchProjects, addLog, confirm, showToast]);

  const handleRequestSSL = useCallback((projectId: string, domainId: string) => {
    confirm({
      message: "Are you sure you want to request an SSL certificate for this domain? This may take up to a minute.",
      confirmText: "PROCEED",
      onConfirm: async () => {
        addLog("Requesting Let's Encrypt SSL certificate...");
        try {
          const response = await apiClient.fetch(`http://localhost:8080/api/v1/projects/${projectId}/domains/${domainId}/ssl`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });

          if (!response.ok) throw new Error("SSL trigger failed");
          
          addLog("SSL certificate generation scheduled.");
          showToast("SSL certificate generation requested.", "success");
          fetchProjects();
        } catch (err) {
          const msg = err instanceof Error ? err.message : "SSL trigger failed";
          addLog(`Domains Error: ${msg}`);
          showToast(msg, "error");
        }
      }
    });
  }, [token, fetchProjects, addLog, confirm, showToast]);

  const handleRegenerateWebhookSecret = useCallback(async (projectId: string) => {
    addLog("Regenerating deployment webhook secret key...");
    try {
      const response = await apiClient.fetch(`http://localhost:8080/api/v1/projects/${projectId}/webhook/secret`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) throw new Error("Failed to generate secret key");
      addLog("Webhook secret key updated successfully.");
      showToast("Webhook secret key updated successfully.", "success");
      fetchProjects();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Action failed";
      showToast(msg, "error");
      addLog(`Webhook Error: ${msg}`);
    }
  }, [token, fetchProjects, addLog, showToast]);

  const handleDeleteWebhookSecret = useCallback((projectId: string) => {
    confirm({
      message: "Are you sure you want to disable webhook auto-deploy for this project?",
      confirmText: "DISABLE",
      onConfirm: async () => {
        addLog("Disabling webhook auto-deploy...");
        try {
          const response = await apiClient.fetch(`http://localhost:8080/api/v1/projects/${projectId}/webhook/secret`, {
            method: "DELETE",
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });

          if (!response.ok) throw new Error("Failed to delete secret key");
          addLog("Webhook auto-deploy disabled.");
          showToast("Webhook auto-deploy disabled.", "success");
          fetchProjects();
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Action failed";
          showToast(msg, "error");
          addLog(`Webhook Error: ${msg}`);
        }
      }
    });
  }, [token, fetchProjects, addLog, confirm, showToast]);

  const fetchProjectsRef = useRef(fetchProjects);
  useEffect(() => {
    fetchProjectsRef.current = fetchProjects;
  }, [fetchProjects]);

  // Load and poll projects
  useEffect(() => {
    if (token) {
      // Fetch immediately once
      fetchProjectsRef.current();
      
      const interval = setInterval(() => {
        fetchProjectsRef.current();
      }, 3000);
      
      return () => {
        clearInterval(interval);
      };
    }
  }, [token]);

  return (
    <section className="flex flex-col gap-6" data-testid="projects-tab">
      <div className="flex justify-between items-center p-4 flat-card bg-neutral-50/50 dark:bg-neutral-900/10">
        <div>
          <h2 className="text-xs text-neutral-400 font-mono tracking-wider uppercase">Active Deployments</h2>
          <p className="text-xs text-neutral-400 font-mono mt-0.5">Manage and orchestrate project services</p>
        </div>
        <button
          onClick={() => setDeployModalOpen(true)}
          className="border border-neutral-200 dark:border-neutral-800 rounded-lg px-4 py-2 text-xs font-mono bg-transparent hover:bg-cobalt hover:text-white hover:border-cobalt transition-all"
          data-testid="btn-configure-project"
        >
          + CONFIGURE NEW PROJECT
        </button>
      </div>

      {projectsError && (
        <div className="text-xs text-red-500 font-mono border-l-2 border-red-500 pl-3 py-1">
          {projectsError}
        </div>
      )}

      {projects.length === 0 ? (
        <div className="flat-card p-12 text-center text-xs text-neutral-400 font-mono" data-testid="empty-projects">
          No projects configured yet. Click &quot;+ CONFIGURE NEW PROJECT&quot; to register one.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="projects-grid">
          {projects.map((project) => {
            const isDeploying = project.status === "deploying";
            const isOnline = project.status === "online";
            const isFailed = project.status === "failed";
            const isOffline = project.status === "offline";

            return (
              <article
                key={project.id}
                className="flat-card p-4 flex flex-col justify-between gap-3 border border-border-sem rounded-lg bg-card-sem text-xs"
                data-testid={`project-card-${project.name}`}
              >
                <div className="flex flex-col gap-2">
                  <div className="flex justify-between items-start relative">
                    <div>
                      <h3 className="text-sm font-bold tracking-tight text-foreground font-mono truncate max-w-37.5 md:max-w-50">{project.name}</h3>
                      <span className="text-[11px] font-mono text-neutral-400 uppercase tracking-widest">[ {project.provider} ]</span>
                    </div>
                     <div className="flex items-center gap-1.5 select-none">
                      {isOnline && project.ping_latency_ms !== null && (
                        <span className="text-[11px] font-mono text-accent-sem bg-accent-sem/5 border border-accent-sem/20 rounded px-1.5 py-0.5 flex items-center gap-0.5" data-testid={`latency-${project.name}`}>
                          <svg className="w-2.5 h-2.5 text-accent-sem shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                          </svg>
                          {project.ping_latency_ms}ms
                        </span>
                      )}
                      
                      <span
                        className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded tracking-wider border uppercase select-none ${
                          isOnline
                            ? "text-accent-sem border-accent-sem/30 bg-accent-sem/5"
                            : isDeploying
                            ? "text-accent-sem border-accent-sem/30 bg-accent-sem/5 animate-pulse"
                            : isFailed
                            ? "text-red-500 border-red-500/30 bg-red-500/5"
                            : "text-neutral-400 border-border-sem bg-input-sem"
                        }`}
                      >
                        {project.status}
                      </span>

                      {isFailed && (
                        <div className="relative group flex items-center justify-center cursor-help" data-testid={`error-warn-${project.name}`}>
                          <span className="flex items-center justify-center select-none filter hover:brightness-110 active:scale-95 transition-all text-red-500">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                          </span>
                          {project.ping_error_detail && (
                            <div className="absolute bottom-full right-0 mb-1.5 hidden group-hover:block z-30 bg-card-sem border border-border-sem text-foreground-sem text-[11px] font-mono px-2 py-1 rounded shadow-xl whitespace-nowrap">
                              {project.ping_error_detail}
                            </div>
                          )}
                        </div>
                      )}
                      
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveDropdownId((prev) => (prev === project.id ? null : project.id));
                        }}
                        className="p-1 rounded hover:bg-input-sem text-neutral-400 hover:text-foreground-sem transition-all cursor-pointer flex items-center justify-center border border-border-sem"
                        title="Project Options"
                      >
                        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M12 8a2 2 0 110-4 2 2 0 010 4zm0 6a2 2 0 110-4 2 2 0 010 4zm0 6a2 2 0 110-4 2 2 0 010 4z" />
                        </svg>
                      </button>
                    </div>

                    {activeDropdownId === project.id && (
                      <div
                        className="absolute right-0 top-7 w-28 bg-card-sem border border-border-sem rounded-lg shadow-lg py-1.5 z-20 font-mono text-[11px]"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setLogsProjectId(project.id);
                            setLogsDrawerOpen(true);
                            addLog(`Initiated live websocket logs stream for project ${project.name}`);
                            setActiveDropdownId(null);
                          }}
                          className="w-full text-left px-3 py-2 text-neutral-700 dark:text-neutral-300 hover:bg-input-sem transition-all font-bold cursor-pointer"
                        >
                          LOGS
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setDeploymentsProjectId(project.id);
                            setDeploymentsProjectName(project.name);
                            setDeploymentsDrawerOpen(true);
                            setActiveDropdownId(null);
                          }}
                          className="w-full text-left px-3 py-2 text-neutral-700 dark:text-neutral-300 hover:bg-input-sem transition-all font-bold cursor-pointer"
                        >
                          HISTORY
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setConfigProjectId(project.id);
                            setConfigProjectName(project.name);
                            setConfigModalOpen(true);
                            setActiveDropdownId(null);
                          }}
                          className="w-full text-left px-3 py-2 text-neutral-700 dark:text-neutral-300 hover:bg-input-sem transition-all font-bold cursor-pointer"
                        >
                          EDIT CONFIG
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            handleToggleHttpPing(project.id, project.enable_http_ping);
                            setActiveDropdownId(null);
                          }}
                          className="w-full text-left px-3 py-2 text-neutral-700 dark:text-neutral-300 hover:bg-input-sem transition-all font-bold cursor-pointer"
                        >
                          {project.enable_http_ping ? "DISABLE PING" : "ENABLE PING"}
                        </button>
                        <div className="border-t border-border-sem my-1" />
                        <button
                          type="button"
                          onClick={() => {
                            handleDeleteProject(project.id, project.name);
                            setActiveDropdownId(null);
                          }}
                          className="w-full text-left px-3 py-2 text-red-500 hover:bg-red-500 hover:text-white transition-all font-bold cursor-pointer"
                        >
                          DELETE
                        </button>
                      </div>
                    )}
                  </div>

                  {project.git_repo && (
                    <div className="flex flex-col mt-1">
                      <span className="text-[11px] text-neutral-400 font-mono tracking-wider uppercase">Repository</span>
                      <span className="text-xs font-mono text-neutral-600 dark:text-neutral-300 truncate">
                        {project.git_repo} ({project.branch})
                      </span>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2 mt-1">
                    <div className="flex flex-col">
                      <span className="text-[11px] text-neutral-400 font-mono tracking-wider uppercase">Port Mapping</span>
                      <span className="text-xs font-mono font-bold text-foreground">
                        {project.port ? `:${project.port}` : "Auto Allocating..."}
                      </span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[11px] text-neutral-400 font-mono tracking-wider uppercase">Last Deployed</span>
                      <span className="text-[11px] font-mono text-neutral-500 truncate">
                        {formatLocalDateTime(project.last_deployed)}
                      </span>
                    </div>
                  </div>

                  {/* Domains Mapping Section inside collapsible <details> */}
                  <details className="group border-t border-border-sem/30 pt-2 mt-1">
                    <summary className="text-[11px] text-neutral-400 font-mono tracking-wider uppercase cursor-pointer list-none flex justify-between items-center select-none hover:text-foreground">
                      <span className="flex items-center gap-1.5">
                        <svg className="w-3.5 h-3.5 text-current shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-.778.099-1.533.284-2.253" />
                        </svg>
                        Domains ({project.domains?.length || 0})
                      </span>
                      <span className="text-[11px] font-mono border border-border-sem px-1.5 py-0.5 rounded hover:bg-input-sem select-none">TOGGLE</span>
                    </summary>
                    <div className="flex flex-col gap-2 mt-2" data-testid={`domains-section-${project.name}`}>
                      {/* Add Domain Form */}
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          const form = e.target as HTMLFormElement;
                          const input = form.elements.namedItem("domain_name") as HTMLInputElement;
                          if (input.value) {
                            handleAddDomain(project.id, input.value);
                            input.value = "";
                          }
                        }}
                        className="flex gap-2"
                      >
                        <input
                          type="text"
                          name="domain_name"
                          placeholder="sub.domain.com"
                          required
                          className="flex-1 bg-input-sem border border-border-sem rounded px-2 py-1 font-mono text-[11px] text-foreground-sem focus:outline-none focus:border-accent-sem"
                          data-testid={`input-domain-${project.name}`}
                        />
                        <button
                          type="submit"
                          className="border border-border-sem rounded px-2 py-1 text-[11px] font-mono hover:bg-accent-sem hover:text-white hover:border-accent-sem transition-all"
                          data-testid={`btn-add-domain-${project.name}`}
                        >
                          ADD
                        </button>
                      </form>

                      {/* Domains List */}
                      <div
                        className="flex flex-col gap-1.5 mt-1 max-h-24 overflow-y-auto"
                        data-testid={`domains-list-${project.name}`}
                      >
                        {!project.domains || project.domains.length === 0 ? (
                          <span className="text-[11px] text-neutral-400 font-mono italic">No domains mapped.</span>
                        ) : (
                          project.domains.map((dom) => {
                            const expiryDays = dom.ssl_expiry
                              ? Math.max(0, Math.ceil((parseUTCDate(dom.ssl_expiry).getTime() - new Date().getTime()) / (1000 * 3600 * 24)))
                              : 0;

                            return (
                              <div
                                key={dom.id}
                                className="flex justify-between items-center bg-input-sem border border-border-sem px-2 py-1 rounded"
                                data-testid={`domain-item-${dom.domain_name}`}
                              >
                                <div className="flex flex-col">
                                  <span className="text-[11px] font-mono text-foreground font-semibold">{dom.domain_name}</span>
                                  {dom.ssl_enabled ? (
                                    <span
                                      className="text-[11px] font-mono text-accent-sem flex items-center gap-1 font-bold"
                                      data-testid={`ssl-badge-${dom.domain_name}`}
                                    >
                                      <svg className="w-3 h-3 text-accent-sem shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                                      </svg>
                                      SSL ACTIVE — {expiryDays} DAYS
                                    </span>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => handleRequestSSL(project.id, dom.id)}
                                      className="text-[11px] font-mono text-neutral-400 hover:text-accent-sem flex items-center gap-1 hover:underline text-left mt-0.5"
                                      data-testid={`btn-enable-ssl-${dom.domain_name}`}
                                    >
                                      <svg className="w-3.5 h-3.5 text-current shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5V6.75a4.5 4.5 0 119 0v3.75M3.75 21.75h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H3.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                                      </svg>
                                      ENABLE SSL
                                    </button>
                                  )}
                                </div>

                                <button
                                  type="button"
                                  onClick={() => handleRemoveDomain(project.id, dom.id)}
                                  className="text-[11px] text-neutral-400 hover:text-red-500 px-1 font-mono transition-all"
                                  data-testid={`btn-remove-domain-${dom.domain_name}`}
                                >
                                  ×
                                </button>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  </details>

                  {/* Webhook Auto-Deploy Section inside collapsible <details> */}
                  {project.git_repo && (
                    <details className="group border-t border-border-sem/30 pt-2 mt-1.5">
                      <summary className="text-[11px] text-neutral-400 font-mono tracking-wider uppercase cursor-pointer list-none flex justify-between items-center select-none hover:text-foreground">
                        <span className="flex items-center gap-1.5">
                          <svg className="w-3.5 h-3.5 text-current shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0V12a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 12V5.25" />
                          </svg>
                          Git Webhook ({project.webhook_secret ? "Active" : "Disabled"})
                        </span>
                        <span className="text-[11px] font-mono border border-border-sem px-1.5 py-0.5 rounded hover:bg-input-sem select-none">TOGGLE</span>
                      </summary>
                      <div className="flex flex-col gap-2 mt-2 font-mono text-[11px]" data-testid={`webhook-section-${project.name}`}>
                        {project.webhook_secret ? (
                          <>
                            <div className="flex flex-col gap-1">
                              <span className="text-[11px] text-neutral-500 uppercase tracking-wider">Payload URL</span>
                              <span className="select-all bg-input-sem border border-border-sem rounded p-1.5 truncate block w-full text-foreground-sem">
                                {(() => {
                                  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
                                  return `${apiUrl}/api/v1/projects/webhook/${project.id}`;
                                })()}
                              </span>
                            </div>
                            <div className="flex flex-col gap-1">
                              <span className="text-[11px] text-neutral-500 uppercase tracking-wider">Secret Key</span>
                              <span className="select-all bg-input-sem border border-border-sem rounded p-1.5 truncate block w-full text-foreground-sem">
                                {project.webhook_secret}
                              </span>
                            </div>
                            <div className="flex gap-2 justify-end mt-1 select-none">
                              <button
                                type="button"
                                onClick={() => handleRegenerateWebhookSecret(project.id)}
                                className="border border-border-sem rounded px-2 py-1 text-[11px] hover:bg-accent-sem hover:text-white hover:border-accent-sem transition-all"
                              >
                                ROTATE SECRET
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteWebhookSecret(project.id)}
                                className="border border-red-500/30 text-red-500/80 hover:text-white hover:bg-red-500 hover:border-red-500 rounded px-2 py-1 text-[11px] transition-all"
                              >
                                DISABLE
                              </button>
                            </div>
                          </>
                        ) : (
                          <div className="flex flex-col gap-2 p-1 text-neutral-400 font-sans">
                            <p className="text-[11px] leading-relaxed">
                              Automate deployments on push. Webhook signature checking prevents execution spamming.
                            </p>
                            <button
                              type="button"
                              onClick={() => handleRegenerateWebhookSecret(project.id)}
                              className="border border-border-sem rounded px-3 py-1.5 text-[11px] font-mono hover:bg-accent-sem hover:text-white hover:border-accent-sem transition-all w-fit font-bold self-start"
                            >
                              ACTIVATE WEBHOOK
                            </button>
                          </div>
                        )}
                      </div>
                    </details>
                  )}

                  {isOnline && (
                    <div className="grid grid-cols-2 gap-2 mt-2.5 border border-border-sem/40 bg-input-sem/20 rounded p-2 font-mono text-[11px]" data-testid={`project-metrics-${project.name}`}>
                      <div className="flex flex-col">
                        <span className="text-neutral-400 uppercase tracking-wider text-[9px] font-bold">CPU Usage</span>
                        <span className="text-foreground-sem font-bold mt-0.5" data-testid={`cpu-usage-${project.name}`}>
                          {project.cpu_usage !== undefined ? `${project.cpu_usage.toFixed(1)}%` : "0.0%"}
                        </span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-neutral-400 uppercase tracking-wider text-[9px] font-bold">RAM Usage</span>
                        <span className="text-foreground-sem font-bold mt-0.5" data-testid={`ram-usage-${project.name}`}>
                          {project.memory_usage ? formatBytes(project.memory_usage) : "0 Bytes"}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {isDeploying && (
                  <div className="w-full bg-input-sem h-1.5 rounded-full overflow-hidden relative my-1">
                    <div
                      className="absolute top-0 bottom-0 bg-accent-sem left-0 right-0 animate-loading-bar"
                      style={{ transformOrigin: "0% 50%" }}
                    />
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-1.5 border-t border-border-sem/50 pt-4 mt-2">
                  <button
                    onClick={() => handleDeployProject(project.id, project.name)}
                    disabled={isDeploying}
                    className="border border-border-sem rounded px-2 py-1 text-[11px] font-mono hover:bg-accent-sem hover:text-white hover:border-accent-sem disabled:opacity-50 transition-all"
                    data-testid={`btn-deploy-${project.name}`}
                  >
                    DEPLOY
                  </button>
                  <button
                    onClick={() => handleStartProject(project.id, project.name)}
                    disabled={isOnline || isDeploying}
                    className="border border-border-sem rounded px-2 py-1 text-[11px] font-mono hover:bg-accent-sem hover:text-white hover:border-accent-sem disabled:opacity-50 transition-all"
                    data-testid={`btn-start-${project.name}`}
                  >
                    START
                  </button>
                  <button
                    onClick={() => handleStopProject(project.id, project.name)}
                    disabled={isOffline || isDeploying}
                    className="border border-border-sem rounded px-2 py-1 text-[11px] font-mono hover:bg-accent-sem hover:text-white hover:border-accent-sem disabled:opacity-50 transition-all"
                    data-testid={`btn-stop-${project.name}`}
                  >
                    STOP
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <ConfigureProjectModal
        isOpen={deployModalOpen}
        onClose={() => setDeployModalOpen(false)}
        onConfigure={handleCreateProject}
      />

      <DeploymentsDrawer
        isOpen={deploymentsDrawerOpen}
        onClose={() => setDeploymentsDrawerOpen(false)}
        projectId={deploymentsProjectId}
        projectName={deploymentsProjectName}
        token={token}
      />

      <EditConfigModal
        isOpen={configModalOpen}
        onClose={() => setConfigModalOpen(false)}
        projectId={configProjectId}
        projectName={configProjectName}
        token={token}
      />
    </section>
  );
}
