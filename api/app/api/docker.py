import shutil
import asyncio
import logging
from fastapi import APIRouter, Depends, HTTPException, status
from app.api.dependencies import get_current_user, RoleChecker
from app.models.base import User
from app.schemas.docker import (
    DockerContainerResponse,
    DockerContainerStatsResponse,
    DockerContainerAction,
    DockerImageResponse,
    DockerVolumeResponse,
    DockerNetworkResponse
)

logger = logging.getLogger("cpanel_lite.docker")
router = APIRouter(dependencies=[Depends(RoleChecker(["super_admin", "developer"]))])

async def run_docker_command(cmd: list[str]) -> tuple[int, str, str]:
    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        stdout, stderr = await proc.communicate()
        return proc.returncode, stdout.decode('utf-8', errors='ignore'), stderr.decode('utf-8', errors='ignore')
    except Exception as e:
        logger.error(f"Failed to run docker command {' '.join(cmd)}: {e}")
        return -1, "", str(e)

@router.get("/containers", response_model=list[DockerContainerResponse])
async def list_containers(
    current_user: User = Depends(get_current_user)
):
    docker_bin = shutil.which("docker")
    if not docker_bin:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Docker CLI is not installed or available on this host."
        )
    
    code, stdout, stderr = await run_docker_command([
        "docker", "ps", "-a", "--format",
        '{"id":"{{.ID}}","name":"{{.Names}}","image":"{{.Image}}","status":"{{.Status}}","state":"{{.State}}","ports":"{{.Ports}}"}'
    ])
    if code != 0:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list containers: {stderr}"
        )
    
    containers = []
    for line in stdout.strip().split("\n"):
        if not line:
            continue
        try:
            import json
            containers.append(json.loads(line))
        except Exception as e:
            logger.warning(f"Error parsing container status line: {e}")
    return containers

@router.get("/containers/{container_id}/stats", response_model=DockerContainerStatsResponse)
async def get_container_stats(
    container_id: str,
    current_user: User = Depends(get_current_user)
):
    docker_bin = shutil.which("docker")
    if not docker_bin:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Docker CLI is not available."
        )
    
    code, stdout, stderr = await run_docker_command([
        "docker", "stats", "--no-stream", "--format",
        '{"cpu":"{{.CPUPerc}}","mem_usage":"{{.MemUsage}}","mem_perc":"{{.MemPerc}}"}',
        container_id
    ])
    if code != 0:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch container stats: {stderr}"
        )
    
    line = stdout.strip()
    if not line:
        return {"cpu": "0.00%", "mem_usage": "0B / 0B", "mem_perc": "0.00%"}
    
    try:
        import json
        return json.loads(line)
    except Exception as e:
        logger.error(f"Error parsing container stats output: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error parsing container stats output."
        )

@router.post("/containers/{container_id}/action")
async def container_action(
    container_id: str,
    payload: DockerContainerAction,
    current_user: User = Depends(get_current_user)
):
    docker_bin = shutil.which("docker")
    if not docker_bin:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Docker CLI is not available."
        )
    
    action = payload.action
    if action not in ("start", "stop", "restart", "remove"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid action: {action}"
        )
    
    if action == "start":
        cmd = ["docker", "start", container_id]
    elif action == "stop":
        cmd = ["docker", "stop", container_id]
    elif action == "restart":
        cmd = ["docker", "restart", container_id]
    elif action == "remove":
        cmd = ["docker", "rm", "-f", container_id]
        
    code, stdout, stderr = await run_docker_command(cmd)
    if code != 0:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Action '{action}' failed: {stderr}"
        )
        
    return {"status": "success", "message": f"Container {container_id} successfully {action}ed."}

@router.get("/containers/{container_id}/logs")
async def get_container_logs(
    container_id: str,
    tail: int = 200,
    current_user: User = Depends(get_current_user)
):
    docker_bin = shutil.which("docker")
    if not docker_bin:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Docker CLI is not available."
        )
        
    code, stdout, stderr = await run_docker_command([
        "docker", "logs", "--tail", str(tail), container_id
    ])
    if code != 0:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch logs: {stderr}"
        )
        
    logs = stdout if stdout else stderr
    return {"logs": logs}

@router.get("/images", response_model=list[DockerImageResponse])
async def list_images(
    current_user: User = Depends(get_current_user)
):
    docker_bin = shutil.which("docker")
    if not docker_bin:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Docker CLI is not available."
        )
        
    code, stdout, stderr = await run_docker_command([
        "docker", "images", "--format",
        '{"id":"{{.ID}}","repository":"{{.Repository}}","tag":"{{.Tag}}","size":"{{.Size}}","created":"{{.CreatedAt}}"'
    ])
    if code != 0:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list images: {stderr}"
        )
        
    images = []
    for line in stdout.strip().split("\n"):
        if not line:
            continue
        try:
            import json
            images.append(json.loads(line))
        except Exception as e:
            logger.warning(f"Error parsing image details line: {e}")
    return images

@router.post("/images/prune")
async def prune_images(
    current_user: User = Depends(get_current_user)
):
    docker_bin = shutil.which("docker")
    if not docker_bin:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Docker CLI is not available."
        )
        
    code, stdout, stderr = await run_docker_command(["docker", "image", "prune", "-f"])
    if code != 0:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Prune failed: {stderr}"
        )
        
    return {"status": "success", "message": stdout.strip()}

@router.get("/volumes", response_model=list[DockerVolumeResponse])
async def list_volumes(
    current_user: User = Depends(get_current_user)
):
    docker_bin = shutil.which("docker")
    if not docker_bin:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Docker CLI is not available."
        )
        
    code, stdout, stderr = await run_docker_command([
        "docker", "volume", "ls", "--format",
        '{"name":"{{.Name}}","driver":"{{.Driver}}"}'
    ])
    if code != 0:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list volumes: {stderr}"
        )
        
    volumes = []
    for line in stdout.strip().split("\n"):
        if not line:
            continue
        try:
            import json
            volumes.append(json.loads(line))
        except Exception as e:
            logger.warning(f"Error parsing volume details line: {e}")
    return volumes

@router.get("/networks", response_model=list[DockerNetworkResponse])
async def list_networks(
    current_user: User = Depends(get_current_user)
):
    docker_bin = shutil.which("docker")
    if not docker_bin:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Docker CLI is not available."
        )
        
    code, stdout, stderr = await run_docker_command([
        "docker", "network", "ls", "--format",
        '{"id":"{{.ID}}","name":"{{.Name}}","driver":"{{.Driver}}","scope":"{{.Scope}}"}'
    ])
    if code != 0:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list networks: {stderr}"
        )
        
    networks = []
    for line in stdout.strip().split("\n"):
        if not line:
            continue
        try:
            import json
            networks.append(json.loads(line))
        except Exception as e:
            logger.warning(f"Error parsing network details line: {e}")
    return networks
