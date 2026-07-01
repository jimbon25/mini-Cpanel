import os
import shutil
import asyncio
import logging
from app.models.base import IngressRule, SystemSetting
from sqlalchemy.orm import Session

logger = logging.getLogger("cpanel_lite.ingress")

async def run_command(cmd: list[str]) -> tuple[int, str, str]:
    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        stdout, stderr = await proc.communicate()
        return proc.returncode, stdout.decode('utf-8', errors='ignore'), stderr.decode('utf-8', errors='ignore')
    except Exception as e:
        return -1, "", str(e)

def get_proxy_type(db: Session) -> str:
    setting = db.query(SystemSetting).filter(SystemSetting.key == "proxy_type").first()
    return setting.value if setting else "disabled"

def get_workspace_root() -> str:
    current_dir = os.path.dirname(os.path.abspath(__file__))
    return os.path.abspath(os.path.join(current_dir, "..", "..", ".."))

def get_ingress_config_path(domain_name: str, proxy_type: str) -> str:
    workspace_root = get_workspace_root()
    if proxy_type == "caddy":
        caddy_d = os.path.join(workspace_root, "caddy.d")
        if not os.path.exists(caddy_d):
            os.makedirs(caddy_d, exist_ok=True)
        return os.path.join(caddy_d, f"{domain_name}.caddy")
    elif proxy_type == "nginx":
        if os.name == "nt":
            nginx_d = os.path.join(workspace_root, "nginx", "conf", "conf.d")
            if not os.path.exists(nginx_d):
                os.makedirs(nginx_d, exist_ok=True)
            return os.path.join(nginx_d, f"ingress_{domain_name}.conf")
        else:
            return f"/etc/nginx/sites-enabled/ingress_{domain_name}.conf"
    return ""

def generate_caddy_config(rule: IngressRule) -> str:
    if rule.target_type == "port":
        target = f"localhost:{rule.target_value}"
    else:
        target = rule.target_value
        
    cors_block = ""
    if rule.cors_enabled:
        cors_block = """    @cors_preflight method OPTIONS
    header {
        Access-Control-Allow-Origin *
        Access-Control-Allow-Methods "GET, POST, PUT, DELETE, OPTIONS"
        Access-Control-Allow-Headers "Authorization, Content-Type"
        defer
    }
    respond @cors_preflight 204
"""
        
    config = f"""{rule.domain_name} {{
{cors_block}
    request_body {{
        max_size {rule.max_body_size}
    }}

    reverse_proxy {target}
}}
"""
    return config

def generate_nginx_config(rule: IngressRule) -> str:
    if rule.target_type == "port":
        target = f"http://127.0.0.1:{rule.target_value}"
    else:
        target = rule.target_value
        
    cors_block = ""
    if rule.cors_enabled:
        cors_block = """        if ($request_method = 'OPTIONS') {
            add_header 'Access-Control-Allow-Origin' '*';
            add_header 'Access-Control-Allow-Methods' 'GET, POST, OPTIONS, PUT, DELETE';
            add_header 'Access-Control-Allow-Headers' 'DNT,User-Agent,X-Requested-With,If-Modified-Since,Cache-Control,Content-Type,Range,Authorization';
            add_header 'Access-Control-Max-Age' 1728000;
            add_header 'Content-Type' 'text/plain; charset=utf-8';
            add_header 'Content-Length' 0;
            return 204;
        }
"""
        
    config = f"""server {{
    listen 80;
    server_name {rule.domain_name};

    client_max_body_size {rule.max_body_size};

    location / {{
{cors_block}
        proxy_pass {target};
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }}
}}
"""
    return config

async def apply_ingress_config(rule: IngressRule, db: Session) -> bool:
    proxy_type = get_proxy_type(db)
    if proxy_type == "disabled":
        logger.info("Proxy is disabled. Skipping config write.")
        return True

    file_path = get_ingress_config_path(rule.domain_name, proxy_type)
    if not file_path:
        return False
        
    try:
        if proxy_type == "caddy":
            content = generate_caddy_config(rule)
        elif proxy_type == "nginx":
            content = generate_nginx_config(rule)
        else:
            return False
            
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(content)
            
        logger.info(f"Wrote {proxy_type} config file for domain: {rule.domain_name} to {file_path}")
        return await reload_proxy(proxy_type)
    except Exception as e:
        logger.error(f"Failed to write proxy config for {rule.domain_name}: {e}")
        return False

async def remove_ingress_config(domain_name: str, db: Session) -> bool:
    proxy_type = get_proxy_type(db)
    if proxy_type == "disabled":
        return True
        
    file_path = get_ingress_config_path(domain_name, proxy_type)
    if not file_path:
        return True
        
    try:
        if os.path.exists(file_path):
            os.remove(file_path)
            logger.info(f"Removed proxy config file: {file_path}")
            return await reload_proxy(proxy_type)
        return True
    except Exception as e:
        logger.error(f"Failed to remove proxy config for {domain_name}: {e}")
        return False

async def reload_proxy(proxy_type: str) -> bool:
    logger.info(f"Reloading reverse proxy service: {proxy_type}")
    if proxy_type == "caddy":
        caddy_bin = shutil.which("caddy") or shutil.which("caddy.exe")
        if os.name == "nt":
            if caddy_bin:
                code, out, err = await run_command([caddy_bin, "reload"])
                return code == 0
            return True
        else:
            code, out, err = await run_command(["systemctl", "reload", "caddy"])
            if code != 0:
                if caddy_bin:
                    code, out, err = await run_command([caddy_bin, "reload"])
            return code == 0
    elif proxy_type == "nginx":
        nginx_bin = shutil.which("nginx") or shutil.which("nginx.exe")
        if os.name == "nt":
            if nginx_bin:
                code, out, err = await run_command([nginx_bin, "-s", "reload"])
                return code == 0
            return True
        else:
            code, out, err = await run_command(["systemctl", "reload", "nginx"])
            if code != 0:
                if nginx_bin:
                    code, out, err = await run_command([nginx_bin, "-s", "reload"])
            return code == 0
    return False
