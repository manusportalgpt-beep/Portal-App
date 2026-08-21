from __future__ import annotations

import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

import minecraft_launcher_lib

from .auth import Account


@dataclass
class MinecraftVersion:
    version_id: str
    version_type: str


class MinecraftService:
    def __init__(self, minecraft_directory: str) -> None:
        self.directory = str(Path(minecraft_directory).expanduser())

    def available_versions(self) -> list[MinecraftVersion]:
        raw = minecraft_launcher_lib.utils.get_available_versions(self.directory)
        return [MinecraftVersion(item["id"], item.get("type", "unknown")) for item in raw]

    def resolve_version(self, selected: str) -> str:
        latest = minecraft_launcher_lib.utils.get_latest_version()
        if selected == "latest-release":
            return latest["release"]
        if selected == "latest-snapshot":
            return latest["snapshot"]
        return selected

    def runtime_label(self, version: str) -> str:
        try:
            runtime = minecraft_launcher_lib.runtime.get_version_runtime_information(version, self.directory)
            if runtime:
                return f"Java {runtime['javaMajorVersion']} · {runtime['name']}"
        except Exception:
            pass
        return "Java Runtime будет определён при установке"

    def install(self, version: str, status: Callable[[str], None], progress: Callable[[int, int], None]) -> None:
        maximum = 0

        def set_status(text: str) -> None:
            status(text)

        def set_max(value: int) -> None:
            nonlocal maximum
            maximum = max(int(value), 1)
            progress(0, maximum)

        def set_progress(value: int) -> None:
            progress(int(value), maximum or 1)

        callback = {"setStatus": set_status, "setMax": set_max, "setProgress": set_progress}
        status(f"Проверяем и устанавливаем Vanilla {version}…")
        minecraft_launcher_lib.install.install_minecraft_version(version, self.directory, callback=callback)
        status("Файлы Minecraft и требуемая Java Runtime готовы.")

    def launch(self, version: str, account: Account, memory_mb: int, status: Callable[[str], None]) -> subprocess.Popen[str]:
        options = {
            "username": account.name,
            "uuid": account.uuid,
            "token": account.access_token,
            "jvmArguments": [f"-Xmx{max(1024, memory_mb)}M"],
        }
        command = minecraft_launcher_lib.command.get_minecraft_command(version, self.directory, options)
        status("Запускаем официальный Vanilla Minecraft…")
        return subprocess.Popen(command, cwd=self.directory, text=True)
