import React, { useState } from "react";

interface ConfigureProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfigure: (data: {
    name: string;
    provider: string;
    git_repo: string | null;
    branch: string;
    port: number | null;
    env_vars: string | null;
    enable_http_ping: boolean;
  }) => void;
}

interface EnvVarRow {
  key: string;
  value: string;
}

export default function ConfigureProjectModal({
  isOpen,
  onClose,
  onConfigure,
}: ConfigureProjectModalProps) {
  const [projName, setProjName] = useState("");
  const [projProvider, setProjProvider] = useState("docker");
  const [projGitRepo, setProjGitRepo] = useState("");
  const [projBranch, setProjBranch] = useState("main");
  const [projPort, setProjPort] = useState("");
  const [projStartCommand, setProjStartCommand] = useState("");
  const [enableHttpPing, setEnableHttpPing] = useState(true);
  const [showHelp, setShowHelp] = useState(false);
  const [showEnvVars, setShowEnvVars] = useState(false);
  const [envVars, setEnvVars] = useState<EnvVarRow[]>([{ key: "", value: "" }]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!projName) return;

    const envList = envVars
      .filter((row) => row.key.trim() !== "")
      .map((row) => `${row.key.trim()}=${row.value.trim()}`);

    if (projStartCommand.trim()) {
      envList.push(`START_COMMAND=${projStartCommand.trim()}`);
    }

    const envString = envList.join("\n");

    onConfigure({
      name: projName,
      provider: projProvider,
      git_repo: projGitRepo || null,
      branch: projBranch || "main",
      port: projPort ? parseInt(projPort, 10) : null,
      env_vars: envString || null,
      enable_http_ping: enableHttpPing,
    });

    setProjName("");
    setProjProvider("docker");
    setProjGitRepo("");
    setProjBranch("main");
    setProjPort("");
    setProjStartCommand("");
    setEnableHttpPing(true);
    setShowHelp(false);
    setShowEnvVars(false);
    setEnvVars([{ key: "", value: "" }]);
  };

  const handleAddRow = () => {
    setEnvVars([...envVars, { key: "", value: "" }]);
  };

  const handleRemoveRow = (index: number) => {
    const updated = envVars.filter((_, idx) => idx !== index);
    setEnvVars(updated.length > 0 ? updated : [{ key: "", value: "" }]);
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData("text");
    if (text.includes("=") || text.includes("\n")) {
      e.preventDefault();
      const lines = text.split(/[\n,]/);
      const newRows: EnvVarRow[] = [];

      lines.forEach((line) => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
          const [k, v] = trimmed.split("=", 2);
          const keyUpper = k.trim().toUpperCase();
          const valueTrimmed = v.trim();
          if (keyUpper === "START_COMMAND") {
            setProjStartCommand(valueTrimmed);
          } else {
            newRows.push({ key: keyUpper, value: valueTrimmed });
          }
        }
      });

      if (newRows.length > 0) {
        setEnvVars(newRows);
        setShowEnvVars(true);
      }
    }
  };

  const handleRowChange = (index: number, field: "key" | "value", val: string) => {
    const updated = [...envVars];
    updated[index][field] = field === "key" ? val.toUpperCase() : val;
    setEnvVars(updated);
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in"
      data-testid="configure-project-modal"
    >
      <div className="w-full max-w-lg flat-card bg-canvas-dark text-neutral-100 flex flex-col border-neutral-800 rounded-lg overflow-hidden">
        <header className="flex justify-between items-center p-4 border-b border-neutral-800">
          <div>
            <h3 className="text-xs font-mono font-bold text-neutral-400">CONFIGURE NEW DEPLOYMENT</h3>
            <p className="text-xs font-mono text-white mt-0.5">Define runtime & deployment options</p>
          </div>
          <button
            onClick={onClose}
            className="text-xs text-neutral-400 hover:text-white font-mono"
            data-testid="btn-close-modal"
          >
            CLOSE
          </button>
        </header>

        <form
          onSubmit={handleSubmit}
          className="p-6 flex flex-col gap-4 font-mono text-xs"
          data-testid="configure-project-form"
        >
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] text-neutral-400 uppercase font-bold tracking-wider">Project Name</label>
            <input
              type="text"
              required
              value={projName}
              onChange={(e) => setProjName(e.target.value)}
              className="bg-neutral-900 border border-neutral-800 rounded p-2.5 text-white focus:outline-none focus:border-cobalt"
              placeholder="my-awesome-app"
              data-testid="input-proj-name"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] text-neutral-400 uppercase font-bold tracking-wider">Provider Engine</label>
            <select
              value={projProvider}
              onChange={(e) => setProjProvider(e.target.value)}
              className="bg-neutral-900 border border-neutral-800 rounded p-2.5 text-white focus:outline-none focus:border-cobalt"
              data-testid="select-proj-provider"
            >
              <option value="docker">Docker Container (Universal)</option>
              <option value="systemd">Systemd Linux Service</option>
              <option value="windows">NSSM Windows Service</option>
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] text-neutral-400 uppercase font-bold tracking-wider">Git Repository URL (Optional)</label>
            <input
              type="url"
              value={projGitRepo}
              onChange={(e) => setProjGitRepo(e.target.value)}
              className="bg-neutral-900 border border-neutral-800 rounded p-2.5 text-white focus:outline-none focus:border-cobalt"
              placeholder="https://github.com/username/repo.git"
              data-testid="input-proj-git"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] text-neutral-400 uppercase font-bold tracking-wider">Git Branch</label>
              <input
                type="text"
                value={projBranch}
                onChange={(e) => setProjBranch(e.target.value)}
                className="bg-neutral-900 border border-neutral-800 rounded p-2.5 text-white focus:outline-none focus:border-cobalt"
                placeholder="main"
                data-testid="input-proj-branch"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] text-neutral-400 uppercase font-bold tracking-wider">Static Port (Optional)</label>
              <input
                type="number"
                value={projPort}
                onChange={(e) => setProjPort(e.target.value)}
                className="bg-neutral-900 border border-neutral-800 rounded p-2.5 text-white focus:outline-none focus:border-cobalt"
                placeholder="Auto allocate if blank"
                data-testid="input-proj-port"
              />
            </div>
          </div>

          <div className="flex items-center justify-between bg-neutral-900 border border-neutral-800 rounded p-3">
            <div>
              <p className="text-xs text-white font-mono">Enable HTTP Health Check</p>
              <p className="text-[10px] text-neutral-500 mt-0.5">Disable for bots, workers, or services without a web server</p>
            </div>
            <button
              type="button"
              id="toggle-enable-http-ping"
              onClick={() => setEnableHttpPing(!enableHttpPing)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${enableHttpPing ? "bg-cobalt" : "bg-neutral-700"}`}
              data-testid="toggle-http-ping"
            >
              <span
                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${enableHttpPing ? "translate-x-4.5" : "translate-x-0.5"}`}
              />
            </button>
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between items-center">
              <label className="text-[10px] text-neutral-400 uppercase font-bold tracking-wider">Start Command (Optional)</label>
              <button
                type="button"
                onClick={() => setShowHelp(!showHelp)}
                className="text-[10px] text-cobalt hover:underline cursor-pointer flex items-center gap-1 font-mono"
              >
                <span>[?] Guide</span>
              </button>
            </div>
            <input
              type="text"
              value={projStartCommand}
              onChange={(e) => setProjStartCommand(e.target.value)}
              className="bg-neutral-900 border border-neutral-800 rounded p-2.5 text-white focus:outline-none focus:border-cobalt font-mono"
              placeholder="e.g. python bot.py (Leave blank for default start)"
              data-testid="input-proj-start-command"
            />
            {showHelp && (
              <div className="bg-neutral-950 border border-neutral-850 rounded p-3 text-[11px] text-neutral-450 font-mono leading-relaxed mt-1 flex flex-col gap-2">
                <p className="text-white font-bold">💡 How to start your project:</p>
                
                <div className="flex flex-col gap-1">
                  <span className="text-cobalt font-bold">1. Python with Virtualenv (Recommended):</span>
                  <span>If your repo contains a startup script (e.g. <code className="text-neutral-200">start.sh</code>) that activates your virtualenv:</span>
                  <code className="text-neutral-200 bg-neutral-900 px-1 py-0.5 rounded w-fit">bash start.sh</code>
                </div>

                <div className="flex flex-col gap-1">
                  <span className="text-cobalt font-bold">2. Direct Python/Node execution:</span>
                  <span>For basic files without special virtualenv triggers:</span>
                  <code className="text-neutral-200 bg-neutral-900 px-1.5 py-0.5 rounded w-fit">python bot.py</code>
                  <code className="text-neutral-200 bg-neutral-900 px-1.5 py-0.5 rounded w-fit">node index.js</code>
                </div>

                <div className="flex flex-col gap-1">
                  <span className="text-cobalt font-bold">3. Auto-Detection fallback:</span>
                  <span>If left blank, Mini cPanel auto-runs <code className="text-neutral-200">npm start</code> (if <code className="text-neutral-200">package.json</code> exists) or <code className="text-neutral-200">python main.py</code>.</span>
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => setShowEnvVars(!showEnvVars)}
              className="flex items-center gap-1.5 text-[10px] text-neutral-400 uppercase font-bold tracking-wider hover:text-white cursor-pointer w-fit transition-all font-mono"
            >
              <span>{showEnvVars ? "▼" : "▶"}</span>
              <span>Environment Variables (Optional)</span>
            </button>

            {showEnvVars && (
              <div className="flex flex-col gap-2 mt-1 animate-fade-in">
                <div className="flex flex-col gap-2 max-h-40 overflow-y-auto pr-1">
                  {envVars.map((row, idx) => (
                    <div key={idx} className="flex items-center gap-2 animate-fade-in">
                      <input
                        type="text"
                        value={row.key}
                        onChange={(e) => handleRowChange(idx, "key", e.target.value)}
                        onPaste={handlePaste}
                        className="bg-neutral-900 border border-neutral-800 rounded p-2 text-white text-xs font-mono w-5/12 focus:outline-none focus:border-cobalt"
                        placeholder="KEY (e.g. PORT)"
                        data-testid={`input-env-key-${idx}`}
                      />
                      <span className="text-neutral-500 font-bold">=</span>
                      <input
                        type="text"
                        value={row.value}
                        onChange={(e) => handleRowChange(idx, "value", e.target.value)}
                        className="bg-neutral-900 border border-neutral-800 rounded p-2 text-white text-xs font-mono flex-1 focus:outline-none focus:border-cobalt"
                        placeholder="value"
                        data-testid={`input-env-val-${idx}`}
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveRow(idx)}
                        className="text-neutral-500 hover:text-red-500 p-1 font-mono transition-all text-xs"
                        title="Remove variable"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={handleAddRow}
                  className="text-left text-[10px] text-cobalt font-mono border border-cobalt/20 hover:border-cobalt/60 px-2.5 py-1 rounded w-fit mt-1 transition-all"
                >
                  + ADD VARIABLE
                </button>
              </div>
            )}
          </div>

          <footer className="flex justify-end gap-3 mt-4">
            <button
              type="button"
              onClick={onClose}
              className="border border-neutral-800 rounded px-4 py-2 text-xs font-mono text-neutral-400 hover:text-white hover:border-neutral-700 transition-all"
              data-testid="btn-cancel-modal"
            >
              CANCEL
            </button>
            <button
              type="submit"
              className="border border-cobalt rounded px-4 py-2 text-xs font-mono text-white bg-cobalt hover:bg-[#2c4eff] transition-all"
              data-testid="btn-submit-modal"
            >
              REGISTER PROJECT
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
