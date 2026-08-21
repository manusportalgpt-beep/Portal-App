from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

import requests


API_ROOT = "https://api.modrinth.com/v2"
HEADERS = {"User-Agent": "VoxelVanillaLauncher/0.1.0 (local Minecraft Vanilla launcher)"}


@dataclass
class ResourcePack:
    project_id: str
    slug: str
    title: str
    description: str
    icon_url: str | None
    downloads: int
    categories: list[str]
    supported_versions: list[str]


@dataclass
class CompatibleFile:
    version_name: str
    filename: str
    url: str
    sha1: str | None
    size: int


class ModrinthService:
    def __init__(self, timeout: int = 20) -> None:
        self.timeout = timeout

    def search_resourcepacks(self, query: str, minecraft_version: str, limit: int = 24) -> list[ResourcePack]:
        facets = [["project_type:resourcepack"], [f"versions:{minecraft_version}"]]
        response = requests.get(
            f"{API_ROOT}/search",
            params={"query": query, "facets": json.dumps(facets), "limit": limit, "index": "downloads"},
            headers=HEADERS,
            timeout=self.timeout,
        )
        response.raise_for_status()
        hits = response.json().get("hits", [])
        packs: list[ResourcePack] = []
        for hit in hits:
            packs.append(ResourcePack(
                project_id=hit["project_id"],
                slug=hit.get("slug", hit["project_id"]),
                title=hit.get("title", "Без названия"),
                description=hit.get("description", ""),
                icon_url=hit.get("icon_url"),
                downloads=int(hit.get("downloads", 0)),
                categories=list(hit.get("categories", [])),
                supported_versions=list(hit.get("versions", [])),
            ))
        return packs

    def compatible_file(self, project_id: str, minecraft_version: str) -> CompatibleFile | None:
        response = requests.get(
            f"{API_ROOT}/project/{project_id}/version",
            params={"game_versions": json.dumps([minecraft_version]), "loaders": json.dumps(["minecraft"]), "include_changelog": "false"},
            headers=HEADERS,
            timeout=self.timeout,
        )
        response.raise_for_status()
        versions = response.json()
        for version in versions:
            if minecraft_version not in version.get("game_versions", []):
                continue
            if "minecraft" not in version.get("loaders", ["minecraft"]):
                continue
            files = version.get("files", [])
            if not files:
                continue
            file_data = next((item for item in files if item.get("primary")), files[0])
            return CompatibleFile(
                version_name=version.get("version_number", version.get("name", "Совместимая версия")),
                filename=file_data["filename"],
                url=file_data["url"],
                sha1=file_data.get("hashes", {}).get("sha1"),
                size=int(file_data.get("size", 0)),
            )
        return None

    def download_resourcepack(
        self,
        pack: ResourcePack,
        minecraft_version: str,
        minecraft_directory: str,
        status: Callable[[str], None],
        progress: Callable[[int, int], None],
    ) -> Path:
        file = self.compatible_file(pack.project_id, minecraft_version)
        if not file:
            raise RuntimeError(f"«{pack.title}» не имеет файла для Minecraft {minecraft_version}.")
        target_directory = Path(minecraft_directory) / "resourcepacks"
        target_directory.mkdir(parents=True, exist_ok=True)
        target = target_directory / Path(file.filename).name
        temporary = target.with_suffix(target.suffix + ".part")
        status(f"Скачиваем {pack.title} · {file.version_name}…")
        digest = hashlib.sha1()
        downloaded = 0
        with requests.get(file.url, headers=HEADERS, stream=True, timeout=60) as response:
            response.raise_for_status()
            total = int(response.headers.get("Content-Length") or file.size or 0)
            with temporary.open("wb") as handle:
                for chunk in response.iter_content(chunk_size=128 * 1024):
                    if not chunk:
                        continue
                    handle.write(chunk)
                    digest.update(chunk)
                    downloaded += len(chunk)
                    progress(downloaded, total or max(downloaded, 1))
        if file.sha1 and digest.hexdigest().lower() != file.sha1.lower():
            temporary.unlink(missing_ok=True)
            raise RuntimeError("Проверка SHA-1 не прошла; файл не был установлен.")
        temporary.replace(target)
        status(f"Ресурс-пак установлен: {target.name}")
        return target

    def fetch_icon(self, icon_url: str | None) -> bytes | None:
        if not icon_url:
            return None
        try:
            response = requests.get(icon_url, headers=HEADERS, timeout=self.timeout)
            response.raise_for_status()
            return response.content
        except requests.RequestException:
            return None
