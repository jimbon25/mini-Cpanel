import os
import json
import random
import time
import re
import logging
from pathlib import Path
from typing import List, Dict, Any
from datetime import datetime
from sqlalchemy.orm import Session
from app.core.config import settings

logger = logging.getLogger("cpanel_lite.proxy_monitor")

CLF_REGEX = re.compile(
    r'(?P<ip>\S+)\s+\S+\s+\S+\s+\[(?P<date>[^\]]+)\]\s+"(?P<method>\S+)\s+(?P<uri>\S+)\s+\S+"\s+(?P<status>\d+)\s+(?P<size>\d+|-)'
)

def parse_clf_date(date_str: str) -> float:
    try:
        dt = datetime.strptime(date_str, "%d/%b/%Y:%H:%M:%S %z")
        return dt.timestamp()
    except Exception:
        try:
            dt_part = date_str.split(" ")[0]
            dt = datetime.strptime(dt_part, "%d/%b/%Y:%H:%M:%S")
            return dt.timestamp()
        except Exception:
            return time.time()

def generate_mock_traffic() -> Dict[str, Any]:
    """
    Generates realistic-looking mock ingress traffic statistics.
    Used as a fallback when the real reverse proxy log is not present or disabled.
    """
    base_rps = 15.0
    rps_history = []
    current_rps = base_rps
    for _ in range(20):
        current_rps = max(2.0, min(50.0, current_rps + random.uniform(-4.0, 4.0)))
        rps_history.append(round(current_rps, 1))

    status_codes = {
        "2xx": random.randint(4500, 5000),
        "3xx": random.randint(300, 500),
        "4xx": random.randint(50, 150),
        "5xx": random.randint(5, 20)
    }

    total_bandwidth = random.randint(450, 850) * 1024 * 1024

    top_ips = [
        {"ip": "127.0.0.1", "requests": random.randint(1800, 2400), "bandwidth": random.randint(100, 250) * 1024 * 1024},
        {"ip": "192.168.1.45", "requests": random.randint(800, 1200), "bandwidth": random.randint(50, 120) * 1024 * 1024},
        {"ip": "10.0.0.12", "requests": random.randint(400, 600), "bandwidth": random.randint(20, 50) * 1024 * 1024},
        {"ip": "8.8.8.8", "requests": random.randint(150, 300), "bandwidth": random.randint(10, 20) * 1024 * 1024},
        {"ip": "172.16.0.4", "requests": random.randint(50, 120), "bandwidth": random.randint(2, 8) * 1024 * 1024}
    ]
    top_ips.sort(key=lambda x: x["requests"], reverse=True)

    top_paths = [
        {"path": "/api/v1/system/metrics", "requests": random.randint(1500, 2200)},
        {"path": "/", "requests": random.randint(900, 1300)},
        {"path": "/api/v1/projects", "requests": random.randint(600, 800)},
        {"path": "/login", "requests": random.randint(120, 250)},
        {"path": "/assets/index.js", "requests": random.randint(80, 150)}
    ]
    top_paths.sort(key=lambda x: x["requests"], reverse=True)

    return {
        "rps_history": rps_history,
        "status_codes": status_codes,
        "total_bandwidth_bytes": total_bandwidth,
        "top_ips": top_ips,
        "top_paths": top_paths,
        "simulated": True
    }

def read_last_log_lines(log_path: Path, max_lines: int = 10000) -> List[str]:
    lines = []
    try:
        if not log_path.exists():
            return lines
            
        with open(log_path, "r", encoding="utf-8") as f:
            f.seek(0, os.SEEK_END)
            file_size = f.tell()
            
            buffer = ""
            pointer = file_size
            block_size = 4096
            
            while pointer > 0 and len(lines) < max_lines:
                pointer = max(0, pointer - block_size)
                f.seek(pointer)
                chunk = f.read(block_size)
                buffer = chunk + buffer
                
                parts = buffer.split("\n")
                if pointer > 0:
                    buffer = parts[0]
                    new_lines = parts[1:]
                else:
                    new_lines = parts
                
                lines.extend([l.strip() for l in reversed(new_lines) if l.strip()])
    except Exception as e:
        logger.error(f"Failed to read log file {log_path}: {e}")
    return lines[:max_lines]

def parse_caddy_json_log(lines: List[str]) -> Dict[str, Any]:
    status_counts = {"2xx": 0, "3xx": 0, "4xx": 0, "5xx": 0}
    total_bandwidth = 0
    ip_counts = {}
    ip_bandwidth = {}
    path_counts = {}
    
    now = time.time()
    rps_bins = [0] * 20
    
    for line in lines:
        try:
            req = json.loads(line)
        except json.JSONDecodeError:
            continue
            
        status = req.get("status", 200)
        if 200 <= status < 300:
            status_counts["2xx"] += 1
        elif 300 <= status < 400:
            status_counts["3xx"] += 1
        elif 400 <= status < 500:
            status_counts["4xx"] += 1
        elif 500 <= status < 600:
            status_counts["5xx"] += 1
            
        size = req.get("size", 0)
        total_bandwidth += size
        
        request_block = req.get("request", {})
        ip = request_block.get("remote_ip", "unknown")
        path = request_block.get("uri", "/")
        path = path.split("?")[0]
        
        ip_counts[ip] = ip_counts.get(ip, 0) + 1
        ip_bandwidth[ip] = ip_bandwidth.get(ip, 0) + size
        path_counts[path] = path_counts.get(path, 0) + 1
        
        ts = req.get("ts", now)
        age = int(now - ts)
        if 0 <= age < 20:
            rps_bins[19 - age] += 1
            
    rps_history = [round(count / 1.0, 1) for count in rps_bins]
    
    top_ips = []
    for ip, count in ip_counts.items():
        top_ips.append({
            "ip": ip,
            "requests": count,
            "bandwidth": ip_bandwidth.get(ip, 0)
        })
    top_ips.sort(key=lambda x: x["requests"], reverse=True)
    top_ips = top_ips[:5]
    
    top_paths = []
    for path, count in path_counts.items():
        top_paths.append({
            "path": path,
            "requests": count
        })
    top_paths.sort(key=lambda x: x["requests"], reverse=True)
    top_paths = top_paths[:5]
    
    return {
        "rps_history": rps_history,
        "status_codes": status_counts,
        "total_bandwidth_bytes": total_bandwidth,
        "top_ips": top_ips,
        "top_paths": top_paths,
        "simulated": False
    }

def parse_nginx_clf_log(lines: List[str]) -> Dict[str, Any]:
    status_counts = {"2xx": 0, "3xx": 0, "4xx": 0, "5xx": 0}
    total_bandwidth = 0
    ip_counts = {}
    ip_bandwidth = {}
    path_counts = {}
    
    now = time.time()
    rps_bins = [0] * 20
    
    for line in lines:
        match = CLF_REGEX.match(line)
        if not match:
            continue
            
        gd = match.groupdict()
        
        ip = gd.get("ip", "unknown")
        date_str = gd.get("date", "")
        ts = parse_clf_date(date_str)
        path = gd.get("uri", "/")
        path = path.split("?")[0]
        
        try:
            status = int(gd.get("status", 200))
        except ValueError:
            status = 200
            
        if 200 <= status < 300:
            status_counts["2xx"] += 1
        elif 300 <= status < 400:
            status_counts["3xx"] += 1
        elif 400 <= status < 500:
            status_counts["4xx"] += 1
        elif 500 <= status < 600:
            status_counts["5xx"] += 1
            
        size_str = gd.get("size", "0")
        size = 0 if size_str == "-" else int(size_str)
        total_bandwidth += size
        
        ip_counts[ip] = ip_counts.get(ip, 0) + 1
        ip_bandwidth[ip] = ip_bandwidth.get(ip, 0) + size
        path_counts[path] = path_counts.get(path, 0) + 1
        
        age = int(now - ts)
        if 0 <= age < 20:
            rps_bins[19 - age] += 1
            
    rps_history = [round(count / 1.0, 1) for count in rps_bins]
    
    top_ips = []
    for ip, count in ip_counts.items():
        top_ips.append({
            "ip": ip,
            "requests": count,
            "bandwidth": ip_bandwidth.get(ip, 0)
        })
    top_ips.sort(key=lambda x: x["requests"], reverse=True)
    top_ips = top_ips[:5]
    
    top_paths = []
    for path, count in path_counts.items():
        top_paths.append({
            "path": path,
            "requests": count
        })
    top_paths.sort(key=lambda x: x["requests"], reverse=True)
    top_paths = top_paths[:5]
    
    return {
        "rps_history": rps_history,
        "status_codes": status_counts,
        "total_bandwidth_bytes": total_bandwidth,
        "top_ips": top_ips,
        "top_paths": top_paths,
        "simulated": False
    }

def get_ingress_traffic_stats(db: Session) -> Dict[str, Any]:
    """
    Reads proxy logs dynamically from DB settings (Caddy or Nginx)
    """
    from app.models.base import SystemSetting
    
    try:
        proxy_type_setting = db.query(SystemSetting).filter(SystemSetting.key == "proxy_type").first()
        proxy_log_path_setting = db.query(SystemSetting).filter(SystemSetting.key == "proxy_log_path").first()
        
        proxy_type = proxy_type_setting.value if proxy_type_setting else "disabled"
        proxy_log_path_str = proxy_log_path_setting.value if proxy_log_path_setting else ""
        
        if proxy_type == "disabled" or not proxy_log_path_str:
            return generate_mock_traffic()
            
        log_path = Path(proxy_log_path_str)
        if not log_path.exists():
            logger.warning(f"Configured log file path does not exist: {log_path}")
            return generate_mock_traffic()
            
        lines = read_last_log_lines(log_path, 10000)
        if not lines:
            return generate_mock_traffic()
            
        if proxy_type == "caddy":
            return parse_caddy_json_log(lines)
        elif proxy_type == "nginx":
            return parse_nginx_clf_log(lines)
        else:
            return generate_mock_traffic()
            
    except Exception as e:
        logger.error(f"Error gathering ingress traffic stats: {e}", exc_info=True)
        return generate_mock_traffic()
