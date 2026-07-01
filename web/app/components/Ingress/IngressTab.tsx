import React, { useState, useEffect, useCallback } from "react";
import { apiClient } from "@/app/utils/apiClient";
import { useNotification } from "@/app/context/NotificationContext";
import { parseUTCDate } from "@/app/utils/date";

export interface IngressRuleResponse {
  id: string;
  domain_name: string;
  target_type: string;
  target_value: string;
  max_body_size: string;
  cors_enabled: boolean;
  ssl_enabled: boolean;
  ssl_expiry?: string;
  created_at: string;
}

interface IngressTabProps {
  token: string | null;
  addLog: (msg: string) => void;
}

export default function IngressTab({ token, addLog }: IngressTabProps) {
  const { showToast, confirm } = useNotification();
  const [rules, setRules] = useState<IngressRuleResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Create Ingress Rule Modal / Form states
  const [showModal, setShowModal] = useState(false);
  const [domainName, setDomainName] = useState("");
  const [targetType, setTargetType] = useState("port");
  const [targetValue, setTargetValue] = useState("");
  const [maxBodySize, setMaxBodySize] = useState("100M");
  const [corsEnabled, setCorsEnabled] = useState(false);

  const fetchRules = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const response = await apiClient.fetch("http://localhost:8080/api/v1/ingress/rules", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        throw new Error("Failed to load Ingress proxy routing rules.");
      }
      const data: IngressRuleResponse[] = await response.json();
      setRules(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Load failed";
      setError(msg);
      addLog(`Ingress Router Error: ${msg}`);
    } finally {
      setLoading(false);
    }
  }, [token, addLog]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchRules();
    }, 0);
    return () => clearTimeout(timer);
  }, [fetchRules]);

  const handleCreateRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!domainName || !targetValue) {
      showToast("Domain name and target destination value are required.", "warning");
      return;
    }

    setLoading(true);
    addLog(`Creating custom Ingress rule: ${domainName} -> ${targetValue} (${targetType})...`);

    try {
      const response = await apiClient.fetch("http://localhost:8080/api/v1/ingress/rules", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          domain_name: domainName,
          target_type: targetType,
          target_value: targetValue,
          max_body_size: maxBodySize,
          cors_enabled: corsEnabled,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({ detail: "Creation failed" }));
        throw new Error(errData.detail || "Failed to create Ingress rule.");
      }

      showToast(`Ingress rule for '${domainName}' created successfully.`, "success");
      addLog(`Ingress rule created successfully: ${domainName}`);
      
      // Reset form
      setDomainName("");
      setTargetType("port");
      setTargetValue("");
      setMaxBodySize("100M");
      setCorsEnabled(false);
      setShowModal(false);
      
      fetchRules();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Creation failed";
      showToast(msg, "error");
      addLog(`Ingress Router Error: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteRule = (ruleId: string, domainName: string) => {
    confirm({
      message: `Are you sure you want to delete the Ingress rule for '${domainName}'? This will remove the proxy route file.`,
      onConfirm: async () => {
        setLoading(true);
        addLog(`Deleting Ingress rule for: ${domainName}...`);

        try {
          const response = await apiClient.fetch(`http://localhost:8080/api/v1/ingress/rules/${ruleId}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` },
          });

          if (!response.ok) {
            throw new Error("Failed to delete Ingress rule.");
          }

          showToast(`Ingress rule for '${domainName}' deleted successfully.`, "success");
          addLog(`Ingress rule deleted successfully: ${domainName}`);
          fetchRules();
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Deletion failed";
          showToast(msg, "error");
          addLog(`Ingress Router Error: ${msg}`);
        } finally {
          setLoading(false);
        }
      }
    });
  };

  const handleRequestSSL = async (ruleId: string, domainName: string) => {
    setLoading(true);
    addLog(`Triggering Let's Encrypt SSL issuance for: ${domainName}...`);
    try {
      const response = await apiClient.fetch(`http://localhost:8080/api/v1/ingress/rules/${ruleId}/ssl`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error("Failed to trigger SSL issuance.");
      }

      showToast(`SSL Certificate request triggered for '${domainName}' in background.`, "success");
      addLog(`SSL Certificate requested for: ${domainName}`);
      fetchRules();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "SSL request failed";
      showToast(msg, "error");
      addLog(`Ingress Router SSL Error: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Header section */}
      <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-white">Ingress Proxy Router</h2>
          <p className="text-sm text-zinc-400 mt-1">
            Map custom domains directly to local ports or external URLs with automatic SSL/TLS.
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-white text-black px-4 py-2 text-sm font-semibold rounded hover:bg-zinc-200 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Ingress Rule
        </button>
      </div>

      {error && (
        <div className="bg-red-950/40 border border-red-900 text-red-200 p-4 rounded text-sm">
          {error}
        </div>
      )}

      {/* Rules list */}
      <div className="flat-card bg-card-sem overflow-hidden border border-border-sem rounded-lg text-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-neutral-50/50 dark:bg-neutral-900/10 text-neutral-400 text-[10px] uppercase border-b border-border-sem font-bold">
                <th className="p-2.5">Domain Name</th>
                <th className="p-2.5">Target Route</th>
                <th className="p-2.5">Max Upload</th>
                <th className="p-2.5">CORS</th>
                <th className="p-2.5">SSL Status</th>
                <th className="p-2.5">Created At</th>
                <th className="p-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
              {rules.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-muted-sem">
                    {loading ? "Loading proxy mappings..." : "No custom Ingress routing rules configured."}
                  </td>
                </tr>
              ) : (
                rules.map((rule) => {
                  const dateStr = parseUTCDate(rule.created_at).toLocaleDateString();
                  const sslExpiryStr = rule.ssl_expiry
                    ? parseUTCDate(rule.ssl_expiry).toLocaleDateString()
                    : null;

                  return (
                    <tr key={rule.id} className="hover:bg-neutral-50/30 dark:hover:bg-neutral-900/10">
                      <td className="p-2.5 font-mono font-medium text-foreground">
                        {rule.domain_name}
                      </td>
                      <td className="p-2.5 font-mono">
                        <span className="text-zinc-500 mr-1.5">[{rule.target_type.toUpperCase()}]</span>
                        {rule.target_type === "port" ? `localhost:${rule.target_value}` : rule.target_value}
                      </td>
                      <td className="p-2.5 font-mono text-neutral-400">{rule.max_body_size}</td>
                      <td className="p-2.5">
                        {rule.cors_enabled ? (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-900">
                            Enabled
                          </span>
                        ) : (
                          <span className="text-neutral-500">-</span>
                        )}
                      </td>
                      <td className="p-2.5">
                        {rule.ssl_enabled ? (
                          <div className="flex flex-col">
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-900 w-fit">
                              HTTPS Active
                            </span>
                            {sslExpiryStr && (
                              <span className="text-[9px] text-neutral-500 mt-0.5">Expires: {sslExpiryStr}</span>
                            )}
                          </div>
                        ) : (
                          <button
                            onClick={() => handleRequestSSL(rule.id, rule.domain_name)}
                            className="text-[10px] bg-neutral-800 hover:bg-neutral-700 text-neutral-300 border border-neutral-700 px-2 py-0.5 rounded transition-colors font-mono"
                          >
                            Request SSL
                          </button>
                        )}
                      </td>
                      <td className="p-2.5 text-neutral-400">{dateStr}</td>
                      <td className="p-2.5 text-right">
                        <button
                          onClick={() => handleDeleteRule(rule.id, rule.domain_name)}
                          className="p-1 hover:text-red-500 text-neutral-500 transition-colors"
                          title="Delete Mapping"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Ingress Rule Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-zinc-900 border border-zinc-800 w-full max-w-md rounded-lg overflow-hidden shadow-2xl">
            <div className="border-b border-zinc-800 p-4 flex items-center justify-between bg-zinc-950/40">
              <h3 className="font-bold text-white">Add Custom Ingress Route</h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-zinc-400 hover:text-white transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <form onSubmit={handleCreateRule} className="p-4 flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs uppercase tracking-wider text-zinc-400 font-semibold">
                  Domain Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. redis-admin.yourdomain.com"
                  value={domainName}
                  onChange={(e) => setDomainName(e.target.value)}
                  className="bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-zinc-700 font-mono"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs uppercase tracking-wider text-zinc-400 font-semibold">
                    Target Type
                  </label>
                  <select
                    value={targetType}
                    onChange={(e) => setTargetType(e.target.value)}
                    className="bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-zinc-700"
                  >
                    <option value="port">Local Port</option>
                    <option value="url">External URL</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs uppercase tracking-wider text-zinc-400 font-semibold">
                    Max Upload Body
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 100M"
                    value={maxBodySize}
                    onChange={(e) => setMaxBodySize(e.target.value)}
                    className="bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-zinc-700 font-mono"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs uppercase tracking-wider text-zinc-400 font-semibold">
                  {targetType === "port" ? "Port Number" : "Destination URL"}
                </label>
                <input
                  type="text"
                  placeholder={targetType === "port" ? "e.g. 8084" : "e.g. http://192.168.1.100:8000"}
                  value={targetValue}
                  onChange={(e) => setTargetValue(e.target.value)}
                  className="bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-zinc-700 font-mono"
                  required
                />
              </div>

              <div className="flex items-center gap-2.5 mt-2 bg-zinc-950/40 p-2.5 rounded border border-zinc-800/60">
                <input
                  type="checkbox"
                  id="cors"
                  checked={corsEnabled}
                  onChange={(e) => setCorsEnabled(e.target.checked)}
                  className="w-4 h-4 accent-white rounded border-zinc-800 bg-zinc-950 text-white cursor-pointer"
                />
                <label htmlFor="cors" className="text-xs text-zinc-400 cursor-pointer select-none">
                  Inject CORS Access Headers (Allows cross-origin API request resource sharing)
                </label>
              </div>

              <div className="flex justify-end gap-3 mt-4 border-t border-zinc-800 pt-4 bg-zinc-950/20 -mx-4 -mb-4 p-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-sm text-zinc-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="bg-white text-black px-4 py-2 text-sm font-semibold rounded hover:bg-zinc-200 transition-colors disabled:opacity-50"
                >
                  {loading ? "Adding..." : "Add Route"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

