from pydantic import BaseModel
from typing import Optional

class DockerContainerResponse(BaseModel):
    id: str
    name: str
    image: str
    status: str
    state: str
    ports: str

class DockerContainerStatsResponse(BaseModel):
    cpu: str
    mem_usage: str
    mem_perc: str

class DockerContainerAction(BaseModel):
    action: str

class DockerImageResponse(BaseModel):
    id: str
    repository: str
    tag: str
    size: str
    created: str

class DockerVolumeResponse(BaseModel):
    name: str
    driver: str

class DockerNetworkResponse(BaseModel):
    id: str
    name: str
    driver: str
    scope: str
