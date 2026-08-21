from __future__ import annotations

import json
import os
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any


APP_NAME = "Voxel Vanilla Launcher"
DEFAULT_AZURE_CLIENT_ID = "c36a9fb6-4f2a-41ff-90bd-ae7cc92031eb"


def app_directory() -> Path:
    root = Path(os.environ.get("APPDATA") or Path.home() / ".voxel_vanilla")
    directory = root / "VoxelVanillaLauncher"
    directory.mkdir(parents=True, exist_ok=True)
    return directory


def default_minecraft_directory() -> str:
    if os.name == "nt":
        return str(Path(os.environ.get("APPDATA", Path.home())) / ".minecraft")
    return str(Path.home() / ".minecraft")


@dataclass
class Settings:
    minecraft_directory: str = default_minecraft_directory()
    selected_version: str = "latest-release"
    memory_mb: int = 4096
    azure_client_id: str = DEFAULT_AZURE_CLIENT_ID
    redirect_uri: str = "http://localhost:53618/callback"
    account_name: str = ""
    account_uuid: str = ""
    last_resourcepack_query: str = ""


class SettingsStore:
    def __init__(self) -> None:
        self.path = app_directory() / "settings.json"

    def load(self) -> Settings:
        if not self.path.exists():
            return Settings()
        try:
            raw: dict[str, Any] = json.loads(self.path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return Settings()
        known = {field: raw[field] for field in Settings.__dataclass_fields__ if field in raw}
        settings = Settings(**known)
        # Migrate previous releases where the field existed but was left blank.
        if not settings.azure_client_id.strip():
            settings.azure_client_id = DEFAULT_AZURE_CLIENT_ID
        return settings

    def save(self, settings: Settings) -> None:
        temporary = self.path.with_suffix(".tmp")
        temporary.write_text(json.dumps(asdict(settings), ensure_ascii=False, indent=2), encoding="utf-8")
        temporary.replace(self.path)
