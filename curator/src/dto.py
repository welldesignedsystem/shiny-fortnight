from typing import Any

from pydantic import BaseModel, Field


class ListFile(BaseModel):
    file: str


class ListRequest(BaseModel):
    metadata: dict[str, Any] = Field(default_factory=dict)
    files: list[ListFile] = Field(default_factory=list)


class ReadFileRequest(BaseModel):
    file: str


class TransferFile(BaseModel):
    file: str
    destination: str | None = None


class TransferRequest(BaseModel):
    destination_folder: str
    files: list[TransferFile] = Field(default_factory=list)
