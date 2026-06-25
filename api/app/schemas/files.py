from pydantic import BaseModel, Field

class CreateDirRequest(BaseModel):
    path: str = Field(..., description="Relative path of the new directory to create")

class WriteFileRequest(BaseModel):
    path: str = Field(..., description="Relative path of the file to write to")
    content: str = Field("", description="Text content to write into the file")

class ZipRequest(BaseModel):
    path: str = Field(..., description="Relative path of target item (file/directory) to compress or unzip")
