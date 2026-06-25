import React, { useState, useEffect, useCallback } from "react";
import { formatLocalDateTime } from "@/app/utils/date";


export interface CronJobResponse {
  id: string;
  project_id: string;
  name: string;
  schedule: string;
  command: string;
  is_active: boolean;
  last_run: string | null;
  last_output: string | null;
}

interface ProjectBrief {
  id: string;
  name: string;
  cron_jobs: CronJobResponse[];
}

interface CronJobsTabProps {
  token: string | null;
  addLog: (msg: string) => void;
}

export default function CronJobsTab({ token, addLog }: CronJobsTabProps) {
  const [projects, setProjects] = useState<ProjectBrief[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [jobName, setJobName] = useState("");
  const [jobCommand, setJobCommand] = useState("");
  
  const [bMinute, setBMinute] = useState("*/5");
  const [bHour, setBHour] = useState("*");
  const [bDay, setBDay] = useState("*");
  const [bMonth, setBMonth] = useState("*");
  const [bDayOfWeek, setBDayOfWeek] = useState("*");

  const [selectedOutput, setSelectedOutput] = useState<{ name: string; output: string | null } | null>(null);

  const fetchCronData = useCallback(async () => {
    setError("");
    try {
      const response = await fetch("http://localhost:8080/api/v1/projects", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!response.ok) throw new Error("Failed to load projects and scheduler configurations");
      const data = await response.json();
      setProjects(data);
      if (data.length > 0 && !selectedProjectId) {
        setSelectedProjectId(data[0].id);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Load failed";
      setError(msg);
      addLog(`Scheduler Error: ${msg}`);
    }
  }, [token, selectedProjectId, addLog]);

  const jobSchedule = `${bMinute} ${bHour} ${bDay} ${bMonth} ${bDayOfWeek}`;

  const applyPreset = (preset: string) => {
    if (preset === "minute") {
      setBMinute("*"); setBHour("*"); setBDay("*"); setBMonth("*"); setBDayOfWeek("*");
    } else if (preset === "5min") {
      setBMinute("*/5"); setBHour("*"); setBDay("*"); setBMonth("*"); setBDayOfWeek("*");
    } else if (preset === "hourly") {
      setBMinute("0"); setBHour("*"); setBDay("*"); setBMonth("*"); setBDayOfWeek("*");
    } else if (preset === "daily") {
      setBMinute("0"); setBHour("0"); setBDay("*"); setBMonth("*"); setBDayOfWeek("*");
    } else if (preset === "weekly") {
      setBMinute("0"); setBHour("0"); setBDay("*"); setBMonth("*"); setBDayOfWeek("0");
    } else if (preset === "monthly") {
      setBMinute("0"); setBHour("0"); setBDay("1"); setBMonth("*"); setBDayOfWeek("*");
    }
  };

  const handleCreateJob = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProjectId || !jobName || !jobCommand || !jobSchedule) return;

    setLoading(true);
    try {
      const response = await fetch(`http://localhost:8080/api/v1/projects/${selectedProjectId}/cron`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: jobName,
          schedule: jobSchedule,
          command: jobCommand,
          is_active: true,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "Failed to create scheduled job");
      }

      addLog(`Created cron job '${jobName}' on schedule '${jobSchedule}'`);
      setJobName("");
      setJobCommand("");
      setBMinute("*/5"); setBHour("*"); setBDay("*"); setBMonth("*"); setBDayOfWeek("*");
      fetchCronData();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Creation failed";
      alert(msg);
      addLog(`Scheduler Error: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleJob = async (projId: string, jobId: string, currentActive: boolean) => {
    try {
      const response = await fetch(`http://localhost:8080/api/v1/projects/${projId}/cron/${jobId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          is_active: !currentActive,
        }),
      });

      if (!response.ok) throw new Error("Toggle update failed");
      addLog(`Scheduled job ${jobId} active status updated to ${!currentActive}`);
      fetchCronData();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to toggle status";
      addLog(`Scheduler Error: ${msg}`);
    }
  };

  const handleDeleteJob = async (projId: string, jobId: string, jobName: string) => {
    if (!confirm(`Are you sure you want to delete task '${jobName}'?`)) return;

    try {
      const response = await fetch(`http://localhost:8080/api/v1/projects/${projId}/cron/${jobId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) throw new Error("Deletion failed");
      addLog(`Deleted scheduled task '${jobName}'`);
      fetchCronData();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to delete task";
      addLog(`Scheduler Error: ${msg}`);
    }
  };

  useEffect(() => {
    if (token) {
      const timer = setTimeout(() => {
        fetchCronData();
      }, 0);
      const interval = setInterval(fetchCronData, 5000);
      return () => {
        clearTimeout(timer);
        clearInterval(interval);
      };
    }
  }, [token, fetchCronData]);

  const allJobs = projects.reduce<{ job: CronJobResponse; projectName: string; projId: string }[]>((acc, proj) => {
    if (proj.cron_jobs) {
      proj.cron_jobs.forEach((job) => {
        acc.push({ job, projectName: proj.name, projId: proj.id });
      });
    }
    return acc;
  }, []);

  return (
    <section className="flex flex-col gap-6">
      {/* Top Banner */}
      <div className="flex justify-between items-center p-4 flat-card bg-neutral-50/50 dark:bg-neutral-900/10">
        <div>
          <h2 className="text-xs text-neutral-400 font-mono tracking-wider uppercase">Task Scheduler & Cron Jobs</h2>
          <p className="text-xs text-neutral-400 font-mono mt-0.5">Automate routines, backup, and scripts execution</p>
        </div>
      </div>

      {error && (
        <div className="text-xs text-red-500 font-mono border-l-2 border-red-500 pl-3 py-1">
          {error}
        </div>
      )}

      {/* Main Split Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Configure Form */}
        <article className="flat-card p-6 flex flex-col gap-4 bg-neutral-50/50 dark:bg-neutral-900/10 lg:col-span-1">
          <h3 className="text-xs text-neutral-400 font-mono tracking-wider uppercase border-b border-neutral-200 dark:border-neutral-800 pb-2">
            Configure New Task
          </h3>

          <form onSubmit={handleCreateJob} className="flex flex-col gap-4 font-mono text-xs">
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] text-neutral-400 uppercase font-bold tracking-wider">Target Project</label>
              <select
                required
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                className="bg-neutral-900 border border-neutral-800 rounded-lg p-2.5 text-white focus:outline-none focus:border-cobalt"
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] text-neutral-400 uppercase font-bold tracking-wider">Task Name</label>
              <input
                type="text"
                required
                value={jobName}
                onChange={(e) => setJobName(e.target.value)}
                className="bg-neutral-900 border border-neutral-800 rounded-lg p-2.5 text-white focus:outline-none"
                placeholder="backup-db-daily"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] text-neutral-400 uppercase font-bold tracking-wider">Shell Command</label>
              <input
                type="text"
                required
                value={jobCommand}
                onChange={(e) => setJobCommand(e.target.value)}
                className="bg-neutral-900 border border-neutral-800 rounded-lg p-2.5 text-white focus:outline-none"
                placeholder="python backup.py --env prod"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between items-center">
                <label className="text-[10px] text-neutral-400 uppercase font-bold tracking-wider">Cron Schedule</label>
                <span className="text-[10px] text-cobalt font-bold font-mono">{jobSchedule}</span>
              </div>
              
              {/* Presets Button Row */}
              <div className="flex flex-wrap gap-1 mt-1">
                <button type="button" onClick={() => applyPreset("minute")} className="px-2 py-0.5 border border-neutral-800 hover:border-cobalt rounded text-[9px] hover:text-white transition-all">Every Min</button>
                <button type="button" onClick={() => applyPreset("5min")} className="px-2 py-0.5 border border-neutral-800 hover:border-cobalt rounded text-[9px] hover:text-white transition-all">5 Min</button>
                <button type="button" onClick={() => applyPreset("hourly")} className="px-2 py-0.5 border border-neutral-800 hover:border-cobalt rounded text-[9px] hover:text-white transition-all">Hourly</button>
                <button type="button" onClick={() => applyPreset("daily")} className="px-2 py-0.5 border border-neutral-800 hover:border-cobalt rounded text-[9px] hover:text-white transition-all">Daily</button>
                <button type="button" onClick={() => applyPreset("weekly")} className="px-2 py-0.5 border border-neutral-800 hover:border-cobalt rounded text-[9px] hover:text-white transition-all">Weekly</button>
                <button type="button" onClick={() => applyPreset("monthly")} className="px-2 py-0.5 border border-neutral-800 hover:border-cobalt rounded text-[9px] hover:text-white transition-all">Monthly</button>
              </div>
            </div>

            {/* Interactive Picker */}
            <div className="border border-neutral-200 dark:border-neutral-800 rounded-lg p-3 bg-neutral-900/5 gap-2.5 flex flex-col">
              <span className="text-[9px] font-bold text-neutral-400 tracking-wide uppercase">Interactive Generator</span>
              
              <div className="grid grid-cols-5 gap-1.5 font-mono text-[9px]">
                <div className="flex flex-col gap-1">
                  <span className="text-[8px] text-neutral-500">Min</span>
                  <input type="text" value={bMinute} onChange={(e) => setBMinute(e.target.value)} className="bg-neutral-950 border border-neutral-800 text-center py-1 rounded text-white" />
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-[8px] text-neutral-500">Hour</span>
                  <input type="text" value={bHour} onChange={(e) => setBHour(e.target.value)} className="bg-neutral-950 border border-neutral-800 text-center py-1 rounded text-white" />
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-[8px] text-neutral-500">Day</span>
                  <input type="text" value={bDay} onChange={(e) => setBDay(e.target.value)} className="bg-neutral-950 border border-neutral-800 text-center py-1 rounded text-white" />
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-[8px] text-neutral-500">Month</span>
                  <input type="text" value={bMonth} onChange={(e) => setBMonth(e.target.value)} className="bg-neutral-950 border border-neutral-800 text-center py-1 rounded text-white" />
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-[8px] text-neutral-500">WDay</span>
                  <input type="text" value={bDayOfWeek} onChange={(e) => setBDayOfWeek(e.target.value)} className="bg-neutral-950 border border-neutral-800 text-center py-1 rounded text-white" />
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || projects.length === 0}
              className="border border-neutral-200 dark:border-neutral-800 rounded-lg py-2.5 text-xs bg-transparent hover:bg-cobalt hover:text-white hover:border-cobalt transition-all font-mono tracking-wider disabled:opacity-50 mt-2 font-bold"
            >
              {loading ? "CONFIGURING..." : "CREATE SCHEDULED TASK"}
            </button>
          </form>
        </article>

        {/* Cron Jobs List */}
        <article className="flat-card p-6 flex flex-col gap-4 lg:col-span-2">
          <h3 className="text-xs text-neutral-400 font-mono tracking-wider uppercase border-b border-neutral-200 dark:border-neutral-800 pb-2">
            Configured Tasks ({allJobs.length})
          </h3>

          <div className="flex flex-col gap-4 max-h-[60vh] overflow-y-auto pr-1">
            {allJobs.length === 0 ? (
              <div className="text-center text-xs text-neutral-400 font-mono py-12">
                No active scheduled jobs defined. Build one to the left.
              </div>
            ) : (
              allJobs.map(({ job, projectName, projId }) => {
                return (
                  <div
                    key={job.id}
                    className="border border-neutral-200 dark:border-neutral-800 rounded-lg p-4 bg-neutral-50/20 dark:bg-neutral-900/10 flex justify-between items-start font-mono text-xs gap-4"
                  >
                    <div className="flex-1 flex flex-col gap-1.5 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-xs text-foreground truncate">{job.name}</span>
                        <span className="text-[9px] border border-neutral-800 px-1.5 py-0.5 rounded text-neutral-400 tracking-wider">
                          {projectName}
                        </span>
                        <span className="text-[10px] bg-cobalt/10 border border-cobalt/20 text-cobalt px-2 py-0.5 rounded font-bold">
                          {job.schedule}
                        </span>
                      </div>
                      
                      <div className="text-xs text-neutral-400 bg-neutral-950 p-2 rounded-md font-mono mt-1 break-all truncate">
                        $ {job.command}
                      </div>

                      <div className="flex items-center gap-4 text-[10px] text-neutral-500 mt-1">
                        <span>
                          LAST RUN:{" "}
                          {formatLocalDateTime(job.last_run)}
                        </span>
                        {job.last_output && (
                          <button
                            onClick={() => setSelectedOutput({ name: job.name, output: job.last_output })}
                            className="text-cobalt hover:underline cursor-pointer"
                          >
                            VIEW LAST OUTPUT
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 select-none">
                      <button
                        onClick={() => handleToggleJob(projId, job.id, job.is_active)}
                        className={`px-3 py-1.5 border rounded transition-all text-[10px] font-bold ${
                          job.is_active
                            ? "bg-cobalt border-cobalt text-white hover:bg-[#2c4eff]"
                            : "bg-transparent border-neutral-800 text-neutral-500 hover:text-white"
                        }`}
                      >
                        {job.is_active ? "ACTIVE" : "PAUSED"}
                      </button>
                      <button
                        onClick={() => handleDeleteJob(projId, job.id, job.name)}
                        className="px-2.5 py-1.5 border border-neutral-800 text-neutral-400 hover:text-red-500 hover:border-red-500/30 rounded transition-all text-xs font-bold"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </article>
      </div>

      {/* Monospace Output Modal */}
      {selectedOutput && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="w-full max-w-2xl flat-card bg-canvas-dark text-neutral-100 flex flex-col h-[60vh] border-neutral-800 rounded-lg overflow-hidden">
            <header className="flex justify-between items-center p-4 border-b border-neutral-800">
              <div>
                <h3 className="text-xs font-mono font-bold text-neutral-400">LAST EXECUTION LOG</h3>
                <p className="text-xs font-mono text-white mt-0.5">{selectedOutput.name}</p>
              </div>
              <button
                onClick={() => setSelectedOutput(null)}
                className="text-xs text-neutral-400 hover:text-white font-mono"
              >
                CLOSE
              </button>
            </header>
            
            <pre className="flex-1 p-4 bg-black text-neutral-300 font-mono text-xs overflow-auto select-text whitespace-pre-wrap">
              {selectedOutput.output || "No output logged from last execution."}
            </pre>
            
            <footer className="flex justify-end p-4 border-t border-neutral-800 bg-neutral-900/10">
              <button
                onClick={() => setSelectedOutput(null)}
                className="border border-neutral-800 rounded px-4 py-2 text-xs font-mono text-neutral-400 hover:text-white hover:border-neutral-700 transition-all"
              >
                CLOSE
              </button>
            </footer>
          </div>
        </div>
      )}
    </section>
  );
}
