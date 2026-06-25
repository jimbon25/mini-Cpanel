import React from "react";
import Sparkline from "./Sparkline";

export interface SystemMetrics {
  platform: {
    os: string;
    release: string;
    version: string;
    architecture: string;
    processor: string;
  };
  cpu: {
    percent: number;
    cores_physical: number;
    cores_logical: number;
    temperature: number | null;
  };
  memory: {
    total: number;
    used: number;
    free: number;
    percent: number;
  };
  disk: {
    total: number;
    used: number;
    free: number;
    percent: number;
  };
  uptime: number;
}

export interface TrafficMetrics {
  rps_history: number[];
  status_codes: {
    "2xx": number;
    "3xx": number;
    "4xx": number;
    "5xx": number;
  };
  total_bandwidth_bytes: number;
  top_ips: { ip: string; requests: number; bandwidth: number }[];
  top_paths: { path: string; requests: number }[];
  simulated?: boolean;
}

interface DashboardTabProps {
  metrics: SystemMetrics | null;
  cpuHistory: number[];
  memHistory: number[];
  diskHistory: number[];
  uptimeSeconds: number;
  traffic?: TrafficMetrics | null;
}

const formatUptime = (totalSeconds: number) => {
  const days = Math.floor(totalSeconds / (3600 * 24));
  const hours = Math.floor((totalSeconds % (3600 * 24)) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);

  return parts.join(" ");
};

const formatBytes = (bytes: number) => {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
};

export default function DashboardTab({
  metrics,
  cpuHistory,
  memHistory,
  diskHistory,
  uptimeSeconds,
  traffic,
}: DashboardTabProps) {
  return (
    <>
      {metrics && (
        <section className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 flat-card bg-neutral-50/50 dark:bg-neutral-900/10">
          <div className="flex flex-col">
            <span className="text-[10px] text-neutral-400 font-mono tracking-wider uppercase">Operating System</span>
            <span className="text-xs font-semibold font-mono tracking-tight mt-0.5">{metrics.platform.os} ({metrics.platform.architecture})</span>
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] text-neutral-400 font-mono tracking-wider uppercase">Kernel Release</span>
            <span className="text-xs font-semibold font-mono tracking-tight mt-0.5">{metrics.platform.release}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] text-neutral-400 font-mono tracking-wider uppercase">CPU Topology</span>
            <span className="text-xs font-semibold font-mono tracking-tight mt-0.5">{metrics.cpu.cores_physical} Cores / {metrics.cpu.cores_logical} Threads</span>
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] text-neutral-400 font-mono tracking-wider uppercase">System Uptime</span>
            <span className="text-xs font-mono font-bold text-cobalt mt-0.5">{formatUptime(uptimeSeconds)}</span>
          </div>
        </section>
      )}

      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* CPU */}
        <article className="flat-card p-4 flex flex-col gap-4">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-xs text-neutral-400 font-mono tracking-wider uppercase">CPU Usage</h2>
              <p className="text-lg font-bold font-mono tracking-tight mt-1">
                {metrics ? `${metrics.cpu.percent.toFixed(1)}%` : "0.0%"}
              </p>
            </div>
            {metrics?.cpu.temperature !== null && metrics?.cpu.temperature !== undefined && (
              <span className="text-[10px] font-mono font-medium bg-neutral-100 dark:bg-neutral-900 px-2 py-0.5 rounded text-neutral-500">
                {metrics.cpu.temperature.toFixed(0)}°C
              </span>
            )}
          </div>
          <Sparkline data={cpuHistory} minVal={0} maxVal={100} />
          <footer className="text-[10px] text-neutral-500 font-mono flex justify-between border-t border-neutral-100 dark:border-neutral-900 pt-3">
            <span>CORES: {metrics?.cpu.cores_logical || "N/A"}</span>
            <span>OS PRESET: {metrics?.platform.os || "N/A"}</span>
          </footer>
        </article>

        {/* RAM */}
        <article className="flat-card p-4 flex flex-col gap-4">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-xs text-neutral-400 font-mono tracking-wider uppercase">Memory (RAM)</h2>
              <p className="text-lg font-bold font-mono tracking-tight mt-1">
                {metrics ? `${metrics.memory.percent.toFixed(1)}%` : "0.0%"}
              </p>
            </div>
          </div>
          <Sparkline data={memHistory} minVal={0} maxVal={100} />
          <footer className="text-[10px] text-neutral-500 font-mono flex justify-between border-t border-neutral-100 dark:border-neutral-900 pt-3">
            <span>USED: {metrics ? formatBytes(metrics.memory.used) : "0 GB"}</span>
            <span>TOTAL: {metrics ? formatBytes(metrics.memory.total) : "0 GB"}</span>
          </footer>
        </article>

        {/* Disk */}
        <article className="flat-card p-4 flex flex-col gap-4">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-xs text-neutral-400 font-mono tracking-wider uppercase">Disk Storage</h2>
              <p className="text-lg font-bold font-mono tracking-tight mt-1">
                {metrics ? `${metrics.disk.percent.toFixed(1)}%` : "0.0%"}
              </p>
            </div>
          </div>
          <Sparkline data={diskHistory} minVal={0} maxVal={100} />
          <footer className="text-[10px] text-neutral-500 font-mono flex justify-between border-t border-neutral-100 dark:border-neutral-900 pt-3">
            <span>USED: {metrics ? formatBytes(metrics.disk.used) : "0 GB"}</span>
            <span>TOTAL: {metrics ? formatBytes(metrics.disk.total) : "0 GB"}</span>
          </footer>
        </article>
      </section>

      {traffic && traffic.rps_history && (
        <>
          <div className="border-t border-neutral-200 dark:border-neutral-800 my-6"></div>
          <div className="flex flex-col gap-1">
            <h2 className="text-xs font-bold text-foreground font-mono tracking-wider uppercase flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5 text-current" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 12l3-3 3 3 4-4M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
              Ingress Proxy Traffic & Analytics
            </h2>
            <p className="text-[10px] text-neutral-500 font-mono">Real-time HTTP routing throughput, response codes, and bandwidth metrics</p>
          </div>

          <section className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-4">
            {/* RPS card */}
            <article className="flat-card p-4 flex flex-col gap-4 bg-neutral-50/10 dark:bg-neutral-900/5">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-xs text-neutral-400 font-mono tracking-wider uppercase">Request Rate</h3>
                  <p className="text-lg font-bold font-mono tracking-tight mt-1">
                    {traffic.rps_history && traffic.rps_history.length > 0 ? `${traffic.rps_history[traffic.rps_history.length - 1].toFixed(1)} req/s` : "0.0 req/s"}
                  </p>
                </div>
              </div>
              <Sparkline data={traffic.rps_history || []} />
              <footer className="text-[10px] text-neutral-500 font-mono flex justify-between border-t border-neutral-100 dark:border-neutral-900 pt-3">
                <span>INBOUND PORT: DEFAULT</span>
                <span>TYPE: {traffic.simulated ? "SIMULATED" : "LIVE CADDY"}</span>
              </footer>
            </article>

            {/* HTTP Responses distribution */}
            <article className="flat-card p-4 flex flex-col justify-between gap-4 bg-neutral-50/10 dark:bg-neutral-900/5">
              <div className="flex flex-col gap-2">
                <h3 className="text-xs text-neutral-400 font-mono tracking-wider uppercase">HTTP Responses</h3>
                {(() => {
                  const codes = traffic.status_codes || {};
                  const total = (codes["2xx"] || 0) + (codes["3xx"] || 0) + (codes["4xx"] || 0) + (codes["5xx"] || 0) || 1;
                  const p2 = (((codes["2xx"] || 0) / total) * 100);
                  const p3 = (((codes["3xx"] || 0) / total) * 100);
                  const p4 = (((codes["4xx"] || 0) / total) * 100);
                  const p5 = (((codes["5xx"] || 0) / total) * 100);

                  return (
                    <>
                      {/* Segmented bar */}
                      <div className="flex h-3 rounded-full overflow-hidden bg-neutral-200 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-800 mt-2">
                        {p2 > 0 && <div className="bg-green-500 h-full transition-all" style={{ width: `${p2}%` }} title={`2xx: ${p2.toFixed(1)}%`} />}
                        {p3 > 0 && <div className="bg-blue-500 h-full transition-all" style={{ width: `${p3}%` }} title={`3xx: ${p3.toFixed(1)}%`} />}
                        {p4 > 0 && <div className="bg-yellow-500 h-full transition-all" style={{ width: `${p4}%` }} title={`4xx: ${p4.toFixed(1)}%`} />}
                        {p5 > 0 && <div className="bg-red-500 h-full transition-all" style={{ width: `${p5}%` }} title={`5xx: ${p5.toFixed(1)}%`} />}
                      </div>

                      {/* Legend details */}
                      <div className="grid grid-cols-2 gap-2 mt-2 font-mono text-[10px] text-neutral-400">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-green-500"></span>
                          <span>2xx: {codes["2xx"] || 0} ({p2.toFixed(1)}%)</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                          <span>3xx: {codes["3xx"] || 0} ({p3.toFixed(1)}%)</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-yellow-500"></span>
                          <span>4xx: {codes["4xx"] || 0} ({p4.toFixed(1)}%)</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-red-500"></span>
                          <span>5xx: {codes["5xx"] || 0} ({p5.toFixed(1)}%)</span>
                        </div>
                      </div>
                    </>
                  );
                })()}
              </div>
            </article>

            {/* Ingress Volume & Top Paths */}
            <article className="flat-card p-4 flex flex-col justify-between gap-4 font-mono bg-neutral-50/10 dark:bg-neutral-900/5">
              <div className="flex flex-col gap-2">
                <h3 className="text-xs text-neutral-400 tracking-wider uppercase">Bandwidth & Top Paths</h3>
                <p className="text-lg font-bold tracking-tight text-foreground mt-1">
                  {formatBytes(traffic.total_bandwidth_bytes || 0)}
                </p>
                
                {/* List of top paths */}
                <div className="flex flex-col gap-1.5 border-t border-neutral-100 dark:border-neutral-900 pt-2 mt-1">
                  <span className="text-[10px] text-neutral-500 uppercase tracking-wide">Top Paths:</span>
                  {(traffic.top_paths || []).slice(0, 3).map((item, idx) => (
                    <div key={idx} className="flex justify-between items-center text-[10px] text-neutral-400">
                      <span className="truncate max-w-xs">{item.path}</span>
                      <span className="text-neutral-500 font-bold">{item.requests} reqs</span>
                    </div>
                  ))}
                </div>
              </div>
            </article>
          </section>
        </>
      )}
    </>
  );
}
