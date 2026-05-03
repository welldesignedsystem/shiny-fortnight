from typing import Any

from pydantic import BaseModel, Field


class ListFile(BaseModel):
    path: str
    absolute_path: str = ""
    extension: str = ""


class ListRequest(BaseModel):
    metadata: dict[str, Any] = Field(default_factory=dict)
    files: list[ListFile] = Field(default_factory=list)
