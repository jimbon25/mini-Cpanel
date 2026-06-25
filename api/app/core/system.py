import time
import platform
import psutil
from typing import Dict, Any, Optional

def get_platform_info() -> Dict[str, str]:
    return {
        "os": platform.system(),
        "release": platform.release(),
        "version": platform.version(),
        "architecture": platform.machine(),
        "processor": platform.processor()
    }

def get_cpu_temp() -> Optional[float]:
    """
    Attempts to read CPU temperature. Returns None if unsupported (e.g. on Windows)
    or if sensors are unavailable.
    """
    if platform.system() == "Linux":
        try:
            temps = psutil.sensors_temperatures()
            if not temps:
                return None
            
            for name in ["cpu_thermal", "coretemp", "k10temp", "acpitz"]:
                if name in temps and len(temps[name]) > 0:
                    return temps[name][0].current
            
            for sensor_list in temps.values():
                if len(sensor_list) > 0:
                    return sensor_list[0].current
        except Exception:
            return None
    return None

def get_system_metrics() -> Dict[str, Any]:
    virtual_mem = psutil.virtual_memory()
    memory_metrics = {
        "total": virtual_mem.total,
        "used": virtual_mem.used,
        "free": virtual_mem.free,
        "percent": virtual_mem.percent
    }

    # Disk Metrics (check '/' for root disk)
    # On Windows, we'll check the drive of the current working directory or C:\
    disk_path = "C:\\" if platform.system() == "Windows" else "/"
    try:
        disk_usage = psutil.disk_usage(disk_path)
        disk_metrics = {
            "total": disk_usage.total,
            "used": disk_usage.used,
            "free": disk_usage.free,
            "percent": disk_usage.percent
        }
    except Exception:
        disk_metrics = {
            "total": 0,
            "used": 0,
            "free": 0,
            "percent": 0.0
        }

    cpu_percent = psutil.cpu_percent(interval=None)

    boot_time = psutil.boot_time()
    uptime_seconds = time.time() - boot_time

    return {
        "platform": get_platform_info(),
        "cpu": {
            "percent": cpu_percent,
            "cores_physical": psutil.cpu_count(logical=False),
            "cores_logical": psutil.cpu_count(logical=True),
            "temperature": get_cpu_temp()
        },
        "memory": memory_metrics,
        "disk": disk_metrics,
        "uptime": int(uptime_seconds)
    }
