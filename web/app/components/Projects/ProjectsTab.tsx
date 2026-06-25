import React, { useState, useEffect, useCallback } from "react";
import ConfigureProjectModal from "./ConfigureProjectModal";
import DeploymentsDrawer from "./DeploymentsDrawer";
import { parseUTCDate, formatLocalDateTime } from "@/app/utils/date";


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
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsError, setProjectsError] = useState("");
  const [deployModalOpen, setDeployModalOpen] = useState(false);
  const [deploymentsDrawerOpen, setDeploymentsDrawerOpen] = useState(false);
  const [deploymentsProjectId, setDeploymentsProjectId] = useState("");
  const [deploymentsProjectName, setDeploymentsProjectName] = useState("");
  const [activeDropdownId, setActiveDropdownId] = useState<string | null>(null);

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
      const response = await fetch("http://localhost:8080/api/v1/projects", {
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
  }) => {
    try {
      const response = await fetch("http://localhost:8080/api/v1/projects", {
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
      setDeployModalOpen(false);
      fetchProjects();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Project creation failed";
      alert(msg);
      addLog(`Projects Error: ${msg}`);
    }
  }, [token, fetchProjects, addLog]);

  const handleDeployProject = useCallback(async (projectId: string, projectName: string) => {
    const confirmed = window.confirm("Are you sure you trust this repository before deploying?");
    if (!confirmed) return;

    addLog(`Initiating deploy process for ${projectName}...`);
    try {
      const response = await fetch(`http://localhost:8080/api/v1/projects/${projectId}/deploy`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) throw new Error("Deployment trigger failed");
      
      addLog(`Deployment triggered for ${projectName}. Executing in background.`);
      fetchProjects();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Deployment failed";
      addLog(`Projects Error: ${msg}`);
    }
  }, [token, fetchProjects, addLog]);

  const handleStartProject = useCallback(async (projectId: string, projectName: string) => {
    addLog(`Starting service: ${projectName}...`);
    try {
      const response = await fetch(`http://localhost:8080/api/v1/projects/${projectId}/start`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) throw new Error("Start command failed");
      
      addLog(`Service ${projectName} started.`);
      fetchProjects();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to start service";
      addLog(`Projects Error: ${msg}`);
    }
  }, [token, fetchProjects, addLog]);

  const handleStopProject = useCallback(async (projectId: string, projectName: string) => {
    addLog(`Stopping service: ${projectName}...`);
    try {
      const response = await fetch(`http://localhost:8080/api/v1/projects/${projectId}/stop`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) throw new Error("Stop command failed");
      
      addLog(`Service ${projectName} stopped.`);
      fetchProjects();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to stop service";
      addLog(`Projects Error: ${msg}`);
    }
  }, [token, fetchProjects, addLog]);

  const handleDeleteProject = useCallback(async (projectId: string, projectName: string) => {
    if (!confirm(`Are you sure you want to delete project '${projectName}'? This will stop any active processes.`)) return;

    try {
      const response = await fetch(`http://localhost:8080/api/v1/projects/${projectId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) throw new Error("Failed to delete project");
      
      addLog(`Deleted project config: ${projectName}`);
      fetchProjects();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to delete project";
      addLog(`Projects Error: ${msg}`);
    }
  }, [token, fetchProjects, addLog]);

  const handleAddDomain = useCallback(async (projectId: string, domainName: string) => {
    addLog(`Adding domain mapping ${domainName} to project...`);
    try {
      const response = await fetch(`http://localhost:8080/api/v1/projects/${projectId}/domains`, {
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
      fetchProjects();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to add domain";
      alert(msg);
      addLog(`Domains Error: ${msg}`);
    }
  }, [token, fetchProjects, addLog]);

  const handleRemoveDomain = useCallback(async (projectId: string, domainId: string) => {
    if (!confirm("Are you sure you want to remove this domain mapping?")) return;
    addLog(`Removing domain mapping...`);
    try {
      const response = await fetch(`http://localhost:8080/api/v1/projects/${projectId}/domains/${domainId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) throw new Error("Failed to remove domain mapping");

      addLog(`Domain mapping removed.`);
      fetchProjects();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to remove domain";
      addLog(`Domains Error: ${msg}`);
    }
  }, [token, fetchProjects, addLog]);

  const handleRequestSSL = useCallback(async (projectId: string, domainId: string) => {
    addLog("Requesting Let's Encrypt SSL certificate...");
    try {
      const response = await fetch(`http://localhost:8080/api/v1/projects/${projectId}/domains/${domainId}/ssl`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) throw new Error("SSL trigger failed");
      
      addLog("SSL certificate generation scheduled.");
      fetchProjects();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "SSL trigger failed";
      addLog(`Domains Error: ${msg}`);
    }
  }, [token, fetchProjects, addLog]);

  const handleRegenerateWebhookSecret = useCallback(async (projectId: string) => {
    addLog("Regenerating deployment webhook secret key...");
    try {
      const response = await fetch(`http://localhost:8080/api/v1/projects/${projectId}/webhook/secret`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) throw new Error("Failed to generate secret key");
      addLog("Webhook secret key updated successfully.");
      fetchProjects();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Action failed";
      alert(msg);
      addLog(`Webhook Error: ${msg}`);
    }
  }, [token, fetchProjects, addLog]);

  const handleDeleteWebhookSecret = useCallback(async (projectId: string) => {
    if (!confirm("Are you sure you want to disable webhook auto-deploy for this project?")) return;
    addLog("Disabling webhook auto-deploy...");
    try {
      const response = await fetch(`http://localhost:8080/api/v1/projects/${projectId}/webhook/secret`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) throw new Error("Failed to delete secret key");
      addLog("Webhook auto-deploy disabled.");
      fetchProjects();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Action failed";
      alert(msg);
      addLog(`Webhook Error: ${msg}`);
    }
  }, [token, fetchProjects, addLog]);

  useEffect(() => {
    if (token) {
      const timer = setTimeout(() => {
        fetchProjects();
      }, 0);
      const interval = setInterval(fetchProjects, 3000);
      return () => {
        clearTimeout(timer);
        clearInterval(interval);
      };
    }
  }, [token, fetchProjects]);

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
                className="flat-card p-4 flex flex-col justify-between gap-3 border border-neutral-200 dark:border-neutral-800 rounded-lg bg-neutral-50/50 dark:bg-neutral-900/10 text-xs"
                data-testid={`project-card-${project.name}`}
              >
                <div className="flex flex-col gap-2">
                  <div className="flex justify-between items-start relative">
                    <div>
                      <h3 className="text-sm font-bold tracking-tight text-foreground font-mono truncate max-w-37.5 md:max-w-50">{project.name}</h3>
                      <span className="text-[10px] font-mono text-neutral-400 uppercase tracking-widest">[ {project.provider} ]</span>
                    </div>
                    <div className="flex items-center gap-1.5 select-none">
                      <span
                        className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded tracking-wider border uppercase select-none ${
                          isOnline
                            ? "text-cobalt border-cobalt/30 bg-cobalt/5"
                            : isDeploying
                            ? "text-cobalt border-cobalt/30 bg-cobalt/5 animate-pulse"
                            : isFailed
                            ? "text-red-500 border-red-500/30 bg-red-500/5"
                            : "text-neutral-400 border-neutral-200 dark:border-neutral-800 bg-neutral-100 dark:bg-neutral-900"
                        }`}
                      >
                        {project.status}
                      </span>
                      
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveDropdownId((prev) => (prev === project.id ? null : project.id));
                        }}
                        className="p-1 rounded hover:bg-neutral-200 dark:hover:bg-neutral-800 text-neutral-400 hover:text-foreground transition-all cursor-pointer flex items-center justify-center border border-neutral-200 dark:border-neutral-800/80"
                        title="Project Options"
                      >
                        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M12 8a2 2 0 110-4 2 2 0 010 4zm0 6a2 2 0 110-4 2 2 0 010 4zm0 6a2 2 0 110-4 2 2 0 010 4z" />
                        </svg>
                      </button>
                    </div>

                    {activeDropdownId === project.id && (
                      <div
                        className="absolute right-0 top-7 w-28 bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg shadow-lg py-1.5 z-20 font-mono text-[9px]"
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
                          className="w-full text-left px-3 py-2 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-800 transition-all font-bold cursor-pointer"
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
                          className="w-full text-left px-3 py-2 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-800 transition-all font-bold cursor-pointer"
                        >
                          HISTORY
                        </button>
                        <div className="border-t border-neutral-200 dark:border-neutral-800 my-1" />
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
                      <span className="text-[9px] text-neutral-400 font-mono tracking-wider uppercase">Repository</span>
                      <span className="text-xs font-mono text-neutral-600 dark:text-neutral-300 truncate">
                        {project.git_repo} ({project.branch})
                      </span>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2 mt-1">
                    <div className="flex flex-col">
                      <span className="text-[9px] text-neutral-400 font-mono tracking-wider uppercase">Port Mapping</span>
                      <span className="text-xs font-mono font-bold text-foreground">
                        {project.port ? `:${project.port}` : "Auto Allocating..."}
                      </span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[9px] text-neutral-400 font-mono tracking-wider uppercase">Last Deployed</span>
                      <span className="text-[10px] font-mono text-neutral-500 truncate">
                        {formatLocalDateTime(project.last_deployed)}
                      </span>
                    </div>
                  </div>

                  {/* Domains Mapping Section inside collapsible <details> */}
                  <details className="group border-t border-neutral-200/30 dark:border-neutral-800/30 pt-2 mt-1">
                    <summary className="text-[10px] text-neutral-400 font-mono tracking-wider uppercase cursor-pointer list-none flex justify-between items-center select-none hover:text-foreground">
                      <span className="flex items-center gap-1">🌐 Domains ({project.domains?.length || 0})</span>
                      <span className="text-[8px] font-mono border border-neutral-200 dark:border-neutral-800/60 px-1 py-0.5 rounded hover:bg-neutral-100 dark:hover:bg-neutral-900 select-none">TOGGLE</span>
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
                          className="flex-1 bg-neutral-900 border border-neutral-800 rounded px-2 py-1 font-mono text-[10px] text-white focus:outline-none focus:border-cobalt"
                          data-testid={`input-domain-${project.name}`}
                        />
                        <button
                          type="submit"
                          className="border border-neutral-200 dark:border-neutral-800 rounded px-2 py-1 text-[9px] font-mono hover:bg-cobalt hover:text-white hover:border-cobalt transition-all"
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
                          <span className="text-[10px] text-neutral-400 font-mono italic">No domains mapped.</span>
                        ) : (
                          project.domains.map((dom) => {
                            const expiryDays = dom.ssl_expiry
                              ? Math.max(0, Math.ceil((parseUTCDate(dom.ssl_expiry).getTime() - new Date().getTime()) / (1000 * 3600 * 24)))
                              : 0;

                            return (
                              <div
                                key={dom.id}
                                className="flex justify-between items-center bg-neutral-100/50 dark:bg-neutral-900/40 border border-neutral-200/50 dark:border-neutral-800/50 px-2 py-1 rounded"
                                data-testid={`domain-item-${dom.domain_name}`}
                              >
                                <div className="flex flex-col">
                                  <span className="text-[10px] font-mono text-foreground font-semibold">{dom.domain_name}</span>
                                  {dom.ssl_enabled ? (
                                    <span
                                      className="text-[8px] font-mono text-cobalt flex items-center gap-1 font-bold"
                                      data-testid={`ssl-badge-${dom.domain_name}`}
                                    >
                                      🔒 SSL ACTIVE — {expiryDays} DAYS
                                    </span>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => handleRequestSSL(project.id, dom.id)}
                                      className="text-[8px] font-mono text-neutral-400 hover:text-cobalt hover:underline text-left mt-0.5"
                                      data-testid={`btn-enable-ssl-${dom.domain_name}`}
                                    >
                                      🔐 ENABLE SSL
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
                    <details className="group border-t border-neutral-200/30 dark:border-neutral-800/30 pt-2 mt-1.5">
                      <summary className="text-[10px] text-neutral-400 font-mono tracking-wider uppercase cursor-pointer list-none flex justify-between items-center select-none hover:text-foreground">
                        <span className="flex items-center gap-1">🤖 Git Webhook ({project.webhook_secret ? "Active" : "Disabled"})</span>
                        <span className="text-[8px] font-mono border border-neutral-200 dark:border-neutral-800/60 px-1 py-0.5 rounded hover:bg-neutral-100 dark:hover:bg-neutral-900 select-none">TOGGLE</span>
                      </summary>
                      <div className="flex flex-col gap-2 mt-2 font-mono text-[10px]" data-testid={`webhook-section-${project.name}`}>
                        {project.webhook_secret ? (
                          <>
                            <div className="flex flex-col gap-1">
                              <span className="text-[8px] text-neutral-500 uppercase tracking-wider">Payload URL</span>
                              <span className="select-all bg-neutral-900 border border-neutral-800 rounded p-1.5 truncate block w-full text-neutral-300">
                                {(() => {
                                  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
                                  return `${apiUrl}/api/v1/projects/webhook/${project.id}`;
                                })()}
                              </span>
                            </div>
                            <div className="flex flex-col gap-1">
                              <span className="text-[8px] text-neutral-500 uppercase tracking-wider">Secret Key</span>
                              <span className="select-all bg-neutral-900 border border-neutral-800 rounded p-1.5 truncate block w-full text-neutral-400">
                                {project.webhook_secret}
                              </span>
                            </div>
                            <div className="flex gap-2 justify-end mt-1 select-none">
                              <button
                                type="button"
                                onClick={() => handleRegenerateWebhookSecret(project.id)}
                                className="border border-neutral-200 dark:border-neutral-800 rounded px-2 py-1 text-[9px] hover:bg-cobalt hover:text-white hover:border-cobalt transition-all"
                              >
                                ROTATE SECRET
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteWebhookSecret(project.id)}
                                className="border border-red-500/30 text-red-500/80 hover:text-white hover:bg-red-500 hover:border-red-500 rounded px-2 py-1 text-[9px] transition-all"
                              >
                                DISABLE
                              </button>
                            </div>
                          </>
                        ) : (
                          <div className="flex flex-col gap-2 p-1 text-neutral-400 font-sans">
                            <p className="text-[10px] leading-relaxed">
                              Automate deployments on push. Webhook signature checking prevents execution spamming.
                            </p>
                            <button
                              type="button"
                              onClick={() => handleRegenerateWebhookSecret(project.id)}
                              className="border border-neutral-200 dark:border-neutral-800 rounded px-3 py-1.5 text-[9px] font-mono hover:bg-cobalt hover:text-white hover:border-cobalt transition-all w-fit font-bold self-start"
                            >
                              ACTIVATE WEBHOOK
                            </button>
                          </div>
                        )}
                      </div>
                    </details>
                  )}
                </div>

                {isDeploying && (
                  <div className="w-full bg-neutral-100 dark:bg-neutral-800 h-1.5 rounded-full overflow-hidden relative my-1">
                    <div
                      className="absolute top-0 bottom-0 bg-cobalt left-0 right-0 animate-loading-bar"
                      style={{ transformOrigin: "0% 50%" }}
                    />
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-1.5 border-t border-neutral-200/50 dark:border-neutral-800/50 pt-4 mt-2">
                  <button
                    onClick={() => handleDeployProject(project.id, project.name)}
                    disabled={isDeploying}
                    className="border border-neutral-200 dark:border-neutral-800 rounded px-2 py-1 text-[10px] font-mono hover:bg-cobalt hover:text-white hover:border-cobalt disabled:opacity-50 transition-all"
                    data-testid={`btn-deploy-${project.name}`}
                  >
                    DEPLOY
                  </button>
                  <button
                    onClick={() => handleStartProject(project.id, project.name)}
                    disabled={isOnline || isDeploying}
                    className="border border-neutral-200 dark:border-neutral-800 rounded px-2 py-1 text-[10px] font-mono hover:bg-cobalt hover:text-white hover:border-cobalt disabled:opacity-50 transition-all"
                    data-testid={`btn-start-${project.name}`}
                  >
                    START
                  </button>
                  <button
                    onClick={() => handleStopProject(project.id, project.name)}
                    disabled={isOffline || isDeploying}
                    className="border border-neutral-200 dark:border-neutral-800 rounded px-2 py-1 text-[10px] font-mono hover:bg-cobalt hover:text-white hover:border-cobalt disabled:opacity-50 transition-all"
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
    </section>
  );
}
