import React, { useState, useEffect, useCallback } from "react";
import Editor from "@monaco-editor/react";
import { apiClient } from "@/app/utils/apiClient";
import { useNotification } from "@/app/context/NotificationContext";

interface EditConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  projectName: string;
  token: string | null;
}

const detectLanguage = (filename: string): string => {
  const ext = filename.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "json":
      return "json";
    case "yaml":
    case "yml":
      return "yaml";
    case "toml":
      return "ini";
    case "env":
    case "ini":
    case "conf":
      return "ini";
    default:
      if (filename.startsWith(".env")) return "ini";
      return "plaintext";
  }
};

export default function EditConfigModal({
  isOpen,
  onClose,
  projectId,
  projectName,
  token,
}: EditConfigModalProps) {
  const { showToast } = useNotification();
  const [files, setFiles] = useState<string[]>([]);
  const [selectedFile, setSelectedFile] = useState<string>("");
  const [content, setContent] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [restartService, setRestartService] = useState<boolean>(true);

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

  const fetchFilesList = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await apiClient.fetch(`http://localhost:8080/api/v1/projects/${projectId}/config/files`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error("Failed to load config files list");
      }

      const data = await response.json();
      setFiles(data);
      if (data.length > 0) {
        // Prefer .env if available, otherwise pick the first file
        const defaultFile = data.includes(".env") ? ".env" : data[0];
        setSelectedFile(defaultFile);
      } else {
        setError("No configuration files found in project directory.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  }, [projectId, token]);

  const fetchFileContent = useCallback(async (filename: string) => {
    if (!filename) return;
    setLoading(true);
    setError("");
    try {
      const response = await apiClient.fetch(
        `http://localhost:8080/api/v1/projects/${projectId}/config/read?filename=${encodeURIComponent(filename)}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to read file: ${filename}`);
      }

      const data = await response.json();
      setContent(data.content);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  }, [projectId, token]);

  useEffect(() => {
    if (isOpen && projectId) {
      Promise.resolve().then(() => {
        fetchFilesList();
      });
    }
  }, [isOpen, projectId, fetchFilesList]);

  useEffect(() => {
    if (selectedFile) {
      Promise.resolve().then(() => {
        fetchFileContent(selectedFile);
      });
    }
  }, [selectedFile, fetchFileContent]);

  const handleSave = async () => {
    if (!selectedFile) return;
    setSaving(true);
    try {
      const response = await apiClient.fetch(`http://localhost:8080/api/v1/projects/${projectId}/config/write`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          filename: selectedFile,
          content: content,
          restart_service: restartService,
        }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.detail || "Failed to save configuration file.");
      }

      const data = await response.json();
      showToast(data.message || "Configuration saved successfully.", "success");
      onClose();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to save config", "error");
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-neutral-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card-sem border border-border-sem w-full max-w-4xl h-150 max-h-[90vh] rounded-xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="border-b border-border-sem/40 p-4 flex justify-between items-center bg-neutral-50/50 dark:bg-neutral-900/10">
          <div>
            <h3 className="text-sm font-bold font-mono text-foreground">
              EDIT CONFIG — {projectName}
            </h3>
            <p className="text-[11px] text-neutral-400 font-mono mt-0.5">
              Modify configuration variables directly on the server
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-foreground text-sm font-bold font-mono border border-border-sem px-2 py-0.5 rounded hover:bg-input-sem transition-all"
          >
            ESC
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 p-4 flex flex-col gap-3 overflow-hidden">
          {/* File Selector */}
          {files.length > 1 && (
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-mono text-neutral-400 uppercase tracking-wider">
                Select File:
              </span>
              <select
                value={selectedFile}
                onChange={(e) => setSelectedFile(e.target.value)}
                className="bg-input-sem border border-border-sem rounded px-2.5 py-1 font-mono text-xs text-foreground-sem focus:outline-none focus:border-accent-sem"
              >
                {files.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>
          )}

          {error && (
            <div className="border border-red-500/20 bg-red-500/5 text-red-500 rounded p-3 font-mono text-xs leading-relaxed">
              ⚠️ {error}
            </div>
          )}

          {/* Editor Area */}
          <div className="h-96 border border-border-sem rounded-lg overflow-hidden relative bg-input-sem/10">
            {loading ? (
              <div className="absolute inset-0 flex items-center justify-center bg-card-sem/60 backdrop-blur-[1px] z-10 font-mono text-xs text-neutral-400">
                <span className="animate-pulse">Loading file content...</span>
              </div>
            ) : null}

            {!error && (
              <Editor
                height="100%"
                language={detectLanguage(selectedFile)}
                theme={isDarkMode ? "vs-dark" : "light"}
                value={content}
                onChange={(val) => setContent(val || "")}
                options={{
                  fontFamily: "var(--font-mono, monospace)",
                  fontSize: 12,
                  minimap: { enabled: false },
                  wordWrap: "on",
                  scrollbar: {
                    vertical: "auto",
                    horizontal: "auto",
                  },
                  automaticLayout: true,
                  lineNumbersMinChars: 3,
                }}
              />
            )}
          </div>

          {/* Options */}
          {!error && (
            <div className="flex items-center gap-2 select-none py-1">
              <input
                type="checkbox"
                id="restart-service-cb"
                checked={restartService}
                onChange={(e) => setRestartService(e.target.checked)}
                className="rounded border-border-sem text-accent-sem focus:ring-accent-sem bg-input-sem cursor-pointer h-3.5 w-3.5"
              />
              <label
                htmlFor="restart-service-cb"
                className="text-[11px] font-mono text-neutral-400 cursor-pointer hover:text-foreground-sem uppercase tracking-wider"
              >
                Restart service automatically to apply changes
              </label>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-border-sem/40 p-4 flex justify-between items-center bg-neutral-50/50 dark:bg-neutral-900/10">
          <button
            onClick={onClose}
            className="border border-border-sem rounded px-3 py-1.5 text-xs font-mono font-bold hover:bg-input-sem text-neutral-400 hover:text-foreground transition-all"
          >
            CANCEL
          </button>
          {!error && (
            <button
              onClick={handleSave}
              disabled={loading || saving}
              className="bg-accent-sem text-white rounded px-4 py-1.5 text-xs font-mono font-bold hover:brightness-110 disabled:opacity-50 transition-all shadow-md"
            >
              {saving ? "SAVING..." : restartService ? "SAVE & RESTART" : "SAVE CONFIG"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
