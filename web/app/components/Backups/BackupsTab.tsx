import React, { useState, useEffect, useCallback } from "react";
import { formatLocalDateTime } from "@/app/utils/date";


export interface BackupResponse {
  id: string;
  project_id: string | null;
  name: string;
  backup_type: string;
  storage_provider: string;
  file_path: string;
  file_size: number;
  created_at: string;
}

interface ProjectBrief {
  id: string;
  name: string;
}

interface BackupsTabProps {
  token: string | null;
  addLog: (msg: string) => void;
}

const formatBytes = (bytes: number) => {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
};

export default function BackupsTab({ token, addLog }: BackupsTabProps) {
  const [backups, setBackups] = useState<BackupResponse[]>([]);
  const [projects, setProjects] = useState<ProjectBrief[]>([]);
  const [loading, setLoading] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const [targetProjectId, setTargetProjectId] = useState<string>("system-global");
  const [backupType, setBackupType] = useState<string>("database");
  const [storageProvider, setStorageProvider] = useState<string>("local");

  const fetchBackupsData = useCallback(async () => {
    setError("");
    try {
      const bRes = await fetch("http://localhost:8080/api/v1/backups", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!bRes.ok) throw new Error("Failed to load backups history");
      const bData = await bRes.json();
      setBackups(bData);

      const pRes = await fetch("http://localhost:8080/api/v1/projects", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!pRes.ok) throw new Error("Failed to load projects list for backup selection");
      const pData = await pRes.json();
      setProjects(pData);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Load failed";
      setError(msg);
      addLog(`Backup Engine Error: ${msg}`);
    }
  }, [token, addLog]);

  const handleCreateBackup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    const projId = targetProjectId === "system-global" ? null : targetProjectId;
    
    try {
      const response = await fetch("http://localhost:8080/api/v1/backups", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          project_id: projId,
          backup_type: backupType,
          storage_provider: storageProvider,
        }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.detail || "Backup execution failed");
      }

      const resData = await response.json();
      addLog(`Backup successfully generated: ${resData.name}`);
      fetchBackupsData();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Backup failed";
      alert(msg);
      addLog(`Backup Engine Error: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  const handleRestoreBackup = async (backupId: string, backupName: string) => {
    if (!confirm(`Warning: Restoring backup '${backupName}' will overwrite active database/files. Do you want to proceed?`)) return;

    setRestoringId(backupId);
    addLog(`Initiated restoration process from archive: ${backupName}...`);
    
    try {
      const response = await fetch(`http://localhost:8080/api/v1/backups/${backupId}/restore`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.detail || "Restore execution failed");
      }

      addLog(`Restoration successfully completed for archive: ${backupName}. Session reloaded.`);
      alert("Restore completed successfully.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Restore failed";
      alert(msg);
      addLog(`Backup Engine Error: ${msg}`);
    } finally {
      setRestoringId(null);
    }
  };

  const handleDeleteBackup = async (backupId: string, backupName: string) => {
    if (!confirm(`Are you sure you want to permanently delete backup archive '${backupName}'?`)) return;

    try {
      const response = await fetch(`http://localhost:8080/api/v1/backups/${backupId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) throw new Error("Deletion failed");

      addLog(`Deleted backup record & archive: ${backupName}`);
      fetchBackupsData();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to delete backup";
      addLog(`Backup Engine Error: ${msg}`);
    }
  };

  useEffect(() => {
    if (token) {
      const timer = setTimeout(() => {
        fetchBackupsData();
      }, 0);
      const interval = setInterval(fetchBackupsData, 5000);
      return () => {
        clearTimeout(timer);
        clearInterval(interval);
      };
    }
  }, [token, fetchBackupsData]);

  return (
    <section className="flex flex-col gap-6">
      {/* Top Banner */}
      <div className="flex justify-between items-center p-4 flat-card bg-neutral-50/50 dark:bg-neutral-900/10">
        <div>
          <h2 className="text-xs text-neutral-400 font-mono tracking-wider uppercase">Backup & Disaster Recovery</h2>
          <p className="text-xs text-neutral-400 font-mono mt-0.5">Generate snapshot archives of database states and project structures</p>
        </div>
      </div>

      {error && (
        <div className="text-xs text-red-500 font-mono border-l-2 border-red-500 pl-3 py-1">
          {error}
        </div>
      )}

      {/* Split Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Form panel */}
        <article className="flat-card p-6 flex flex-col gap-4 bg-neutral-50/50 dark:bg-neutral-900/10 lg:col-span-1">
          <h3 className="text-xs text-neutral-400 font-mono tracking-wider uppercase border-b border-neutral-200 dark:border-neutral-800 pb-2">
            Snapshot Generator
          </h3>

          <form onSubmit={handleCreateBackup} className="flex flex-col gap-4 font-mono text-xs">
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] text-neutral-400 uppercase font-bold tracking-wider">Backup Target</label>
              <select
                value={targetProjectId}
                onChange={(e) => setTargetProjectId(e.target.value)}
                className="bg-neutral-900 border border-neutral-800 rounded-lg p-2.5 text-white focus:outline-none"
              >
                <option value="system-global">System Global (DB & All Files)</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    Project: {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] text-neutral-400 uppercase font-bold tracking-wider">Backup Type</label>
              <select
                value={backupType}
                onChange={(e) => setBackupType(e.target.value)}
                className="bg-neutral-900 border border-neutral-800 rounded-lg p-2.5 text-white focus:outline-none"
              >
                <option value="database">SQLite Database Only</option>
                <option value="files">Project Folders / Source Code Only</option>
                <option value="full">Full Backup (Database + Files)</option>
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] text-neutral-400 uppercase font-bold tracking-wider">Storage Destination</label>
              <select
                value={storageProvider}
                onChange={(e) => setStorageProvider(e.target.value)}
                className="bg-neutral-900 border border-neutral-800 rounded-lg p-2.5 text-white focus:outline-none"
              >
                <option value="local">Local cPanel Disk Storage</option>
                <option value="s3">Simulated AWS S3 Bucket</option>
                <option value="gdrive">Simulated Google Drive Storage</option>
              </select>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="border border-neutral-200 dark:border-neutral-800 rounded-lg py-2.5 text-xs bg-transparent hover:bg-cobalt hover:text-white hover:border-cobalt transition-all font-mono tracking-wider disabled:opacity-50 mt-2 font-bold"
            >
              {loading ? "ARCHIVING SERVER STATE..." : "BACKUP NOW"}
            </button>
          </form>
        </article>

        {/* History panel */}
        <article className="flat-card p-6 flex flex-col gap-4 lg:col-span-2">
          <h3 className="text-xs text-neutral-400 font-mono tracking-wider uppercase border-b border-neutral-200 dark:border-neutral-800 pb-2">
            Backups Repository ({backups.length})
          </h3>

          <div className="flex flex-col gap-4 max-h-[60vh] overflow-y-auto pr-1">
            {backups.length === 0 ? (
              <div className="text-center text-xs text-neutral-400 font-mono py-12">
                No backup snapshots recorded in history database yet.
              </div>
            ) : (
              backups.map((b) => {
                const isRestoring = restoringId === b.id;
                const projectObject = projects.find((p) => p.id === b.project_id);
                const scopeLabel = projectObject ? `PROJECT: ${projectObject.name}` : "SYSTEM GLOBAL";

                return (
                  <div
                    key={b.id}
                    className="border border-neutral-200 dark:border-neutral-800 rounded-lg p-4 bg-neutral-50/20 dark:bg-neutral-900/10 flex justify-between items-center font-mono text-xs gap-4"
                  >
                    <div className="flex-1 flex flex-col gap-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-neutral-200 truncate">{b.name}</span>
                        <span className="text-[9px] border border-neutral-800 px-1.5 py-0.5 rounded text-neutral-400 uppercase font-bold tracking-wider">
                          {scopeLabel}
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-4 text-[10px] text-neutral-500 mt-1">
                        <span>TYPE: <strong className="text-neutral-400 uppercase">{b.backup_type}</strong></span>
                        <span>PROVIDER: <strong className="text-neutral-400 uppercase">{b.storage_provider}</strong></span>
                        <span>SIZE: <strong className="text-neutral-400">{formatBytes(b.file_size)}</strong></span>
                      </div>

                      <div className="text-[10px] text-neutral-500 mt-0.5">
                        CREATED: {formatLocalDateTime(b.created_at)}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 select-none">
                      <button
                        onClick={() => handleRestoreBackup(b.id, b.name)}
                        disabled={isRestoring || loading}
                        className="border border-neutral-200 dark:border-neutral-800 rounded px-3 py-1.5 text-[10px] font-mono hover:bg-cobalt hover:text-white hover:border-cobalt disabled:opacity-50 transition-all font-bold"
                      >
                        {isRestoring ? "RESTORING..." : "RESTORE"}
                      </button>
                      <button
                        onClick={() => handleDeleteBackup(b.id, b.name)}
                        disabled={isRestoring || loading}
                        className="px-2.5 py-1.5 border border-neutral-800 text-neutral-400 hover:text-red-500 hover:border-red-500/30 rounded transition-all text-xs font-bold disabled:opacity-50"
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
    </section>
  );
}
