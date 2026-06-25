import React, { useState, useEffect, useCallback } from "react";

interface AppEnvVar {
  name: string;
  default_value: string;
  description: string;
  is_password: boolean;
}

interface MarketplaceApp {
  id: string;
  name: string;
  description: string;
  image: string;
  category: string;
  icon: string;
  default_port: number;
  env_variables: AppEnvVar[];
}

interface MarketplaceTabProps {
  token: string | null;
  addLog: (msg: string) => void;
  onInstallSuccess: () => void;
}

export default function MarketplaceTab({ token, addLog, onInstallSuccess }: MarketplaceTabProps) {
  const [apps, setApps] = useState<MarketplaceApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  
  const [selectedApp, setSelectedApp] = useState<MarketplaceApp | null>(null);
  const [customName, setCustomName] = useState("");
  const [customPort, setCustomPort] = useState("");
  const [envOverrides, setEnvOverrides] = useState<Record<string, string>>({});
  const [installing, setInstalling] = useState(false);

  const fetchCatalog = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("http://localhost:8080/api/v1/marketplace", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("Failed to load marketplace catalog");
      const data = await response.json();
      setApps(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Load catalog error";
      setError(msg);
      addLog(`Marketplace Error: ${msg}`);
    } finally {
      setLoading(false);
    }
  }, [token, addLog]);

  useEffect(() => {
    if (token) {
      const timer = setTimeout(() => {
        fetchCatalog();
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [token, fetchCatalog]);

  const handleOpenInstall = (app: MarketplaceApp) => {
    setSelectedApp(app);
    setCustomName(app.id);
    setCustomPort(String(app.default_port));
    
    const initialOverrides: Record<string, string> = {};
    app.env_variables.forEach((v) => {
      initialOverrides[v.name] = v.default_value;
    });
    setEnvOverrides(initialOverrides);
  };

  const handleOverrideChange = (key: string, value: string) => {
    setEnvOverrides((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleInstallApp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedApp) return;

    setInstalling(true);
    addLog(`Triggering one-click installer for ${selectedApp.name}...`);

    const payload = {
      app_id: selectedApp.id,
      custom_name: customName || null,
      custom_port: customPort ? parseInt(customPort) : null,
      env_overrides: envOverrides,
    };

    try {
      const response = await fetch("http://localhost:8080/api/v1/marketplace/install", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "Failed to trigger installation");
      }

      const newProject = await response.json();
      addLog(`Successfully scheduled installation for ${selectedApp.name}. Deployment ID: ${newProject.id}`);
      setSelectedApp(null);
      onInstallSuccess();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Install failed";
      alert(msg);
      addLog(`Marketplace Error: ${msg}`);
    } finally {
      setInstalling(false);
    }
  };

  return (
    <section className="flex flex-col gap-6" data-testid="marketplace-tab">
      <div className="flex justify-between items-center p-4 flat-card bg-neutral-50/50 dark:bg-neutral-900/10">
        <div>
          <h2 className="text-xs text-neutral-400 font-mono tracking-wider uppercase flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5 text-current" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
            </svg>
            App Store Marketplace
          </h2>
          <p className="text-xs text-neutral-400 font-mono mt-0.5">Deploy containerized system tools and databases with a single click</p>
        </div>
      </div>

      {error && (
        <div className="text-xs text-red-500 font-mono border-l-2 border-red-500 pl-3 py-1">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-center font-mono text-xs text-neutral-500 py-12">
          LOADING MARKETPLACE TEMPLATES...
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {apps.map((app) => (
            <article
              key={app.id}
              className="flat-card p-6 flex flex-col justify-between gap-4 bg-neutral-50/10 dark:bg-neutral-900/5 hover:border-cobalt/40 transition-all group"
            >
              <div className="flex flex-col gap-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-mono px-2 py-0.5 border border-neutral-200 dark:border-neutral-800 rounded-full text-neutral-500 uppercase">
                    {app.category}
                  </span>
                  <span className="text-xs text-neutral-500 font-mono">Port {app.default_port}</span>
                </div>
                <h3 className="text-sm font-bold text-foreground group-hover:text-cobalt transition-colors">
                  {app.name}
                </h3>
                <p className="text-xs text-neutral-400 font-normal leading-relaxed line-clamp-3">
                  {app.description}
                </p>
              </div>

              <div className="pt-2">
                <button
                  onClick={() => handleOpenInstall(app)}
                  className="w-full text-center text-xs border border-neutral-200 dark:border-neutral-800 p-2 rounded hover:bg-cobalt hover:text-white hover:border-cobalt transition-all font-mono"
                >
                  INSTALL APP
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {/* Installation Settings Modal Drawer */}
      {selectedApp && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="flat-card bg-canvas-light dark:bg-canvas-dark border border-neutral-200 dark:border-neutral-800 p-4 rounded-lg w-full max-w-lg flex flex-col gap-4 font-mono text-xs">
            <div className="flex justify-between items-center border-b border-neutral-200 dark:border-neutral-800 pb-3">
              <div>
                <h3 className="text-sm font-bold text-foreground">Deploy {selectedApp.name}</h3>
                <p className="text-xs text-neutral-400 font-light mt-0.5">Image: {selectedApp.image}</p>
              </div>
              <button
                onClick={() => setSelectedApp(null)}
                className="text-neutral-400 hover:text-foreground text-xs"
              >
                CLOSE
              </button>
            </div>

            <form onSubmit={handleInstallApp} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-neutral-400">APPLICATION NAME *</label>
                <input
                  type="text"
                  required
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  className="bg-neutral-900 border border-neutral-800 rounded p-1.5 text-white text-xs font-mono"
                  placeholder="e.g. my-redis"
                />
                <span className="text-[10px] text-neutral-500 font-light">Lowercase alphanumeric, hyphens, and underscores only.</span>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs text-neutral-400">HOST PORT BINDING *</label>
                <input
                  type="number"
                  required
                  value={customPort}
                  onChange={(e) => setCustomPort(e.target.value)}
                  className="bg-neutral-900 border border-neutral-800 rounded p-1.5 text-white text-xs font-mono"
                  placeholder={String(selectedApp.default_port)}
                />
                <span className="text-[10px] text-neutral-500 font-light">Host machine port mapping. Auto-allocates next free port if current is busy.</span>
              </div>

              {selectedApp.env_variables.length > 0 && (
                <div className="flex flex-col gap-3 border-t border-neutral-200 dark:border-neutral-800 pt-3">
                  <h4 className="text-xs text-neutral-400 uppercase tracking-widest font-bold">Environment Variables</h4>
                  {selectedApp.env_variables.map((env) => (
                    <div key={env.name} className="flex flex-col gap-1">
                      <div className="flex justify-between items-center">
                        <label className="text-xs text-neutral-200">{env.name}</label>
                        {env.is_password && (
                          <span className="text-[9px] text-cobalt bg-cobalt/10 px-1.5 py-0.5 rounded font-bold">SECURE PASS</span>
                        )}
                      </div>
                      <input
                        type={env.is_password ? "password" : "text"}
                        value={envOverrides[env.name] || ""}
                        onChange={(e) => handleOverrideChange(env.name, e.target.value)}
                        className="bg-neutral-900 border border-neutral-800 rounded p-1.5 text-white text-xs font-mono"
                        placeholder={env.is_password ? "(Auto-generated securely if empty)" : env.default_value}
                      />
                      <span className="text-[10px] text-neutral-500 font-light leading-relaxed">{env.description}</span>
                    </div>
                  ))}
                </div>
              )}

              <button
                type="submit"
                disabled={installing}
                className="mt-2 bg-cobalt hover:bg-cobalt/80 text-white rounded p-2.5 text-xs font-bold transition-all disabled:opacity-50 text-center font-mono"
              >
                {installing ? "TRIGGERING ORCHESTRATOR..." : "LAUNCH CONTAINER"}
              </button>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
