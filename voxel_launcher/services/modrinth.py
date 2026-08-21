from __future__ import annotations

import hashlib
import json
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable

import requests


API_ROOT = "https://api.modrinth.com/v2"
HEADERS = {
    "Accept": "application/json",
    "User-Agent": "VoxelVanillaLauncher/1.1.0 (Vanilla resource-pack browser)",
}


class ModrinthError(RuntimeError):
    """Readable error returned to the launcher UI for public Modrinth operations."""


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
    exact_version_match: bool = True


@dataclass
class CompatibleFile:
    version_name: str
    filename: str
    url: str
    sha1: str | None
    size: int


class ModrinthService:
    def __init__(self, timeout: int = 35) -> None:
        self.timeout = timeout
        self.session = requests.Session()
        self.session.headers.update(HEADERS)

    def _get(self, path_or_url: str, *, params: dict[str, Any] | None = None, stream: bool = False, timeout: int | None = None) -> requests.Response:
        url = path_or_url if path_or_url.startswith("http") else f"{API_ROOT}{path_or_url}"
        last_error: Exception | None = None
        for attempt in range(2):
            try:
                response = self.session.get(url, params=params, stream=stream, timeout=timeout or self.timeout)
                if response.status_code == 429 or response.status_code >= 500:
                    if attempt == 0:
                        time.sleep(1.0)
                        continue
                if not response.ok:
                    detail = ""
                    try:
                        body = response.json()
                        detail = body.get("description") or body.get("error") or ""
                    except (ValueError, AttributeError):
                        detail = response.text[:160]
                    raise ModrinthError(f"Modrinth вернул HTTP {response.status_code}. {detail}".strip())
                return response
            except requests.RequestException as error:
                last_error = error
                if attempt == 0:
                    time.sleep(1.0)
                    continue
        raise ModrinthError(f"Не удалось подключиться к Modrinth: {last_error}")

    def _search(self, query: str, facets: list[list[str]], limit: int) -> list[dict[str, Any]]:
        response = self._get(
            "/search",
            params={"query": query, "facets": json.dumps(facets), "limit": limit, "index": "downloads"},
        )
        try:
            payload = response.json()
        except ValueError as error:
            raise ModrinthError("Modrinth вернул непонятный ответ; попробуйте ещё раз.") from error
        return list(payload.get("hits", []))

    @staticmethod
    def _pack_from_hit(hit: dict[str, Any], exact_version_match: bool) -> ResourcePack:
        return ResourcePack(
            project_id=hit["project_id"],
            slug=hit.get("slug", hit["project_id"]),
            title=hit.get("title", "Без названия"),
            description=hit.get("description", ""),
            icon_url=hit.get("icon_url"),
            downloads=int(hit.get("downloads", 0)),
            categories=list(hit.get("categories", [])),
            supported_versions=list(hit.get("versions", [])),
            exact_version_match=exact_version_match,
        )

    def search_resourcepacks(self, query: str, minecraft_version: str, limit: int = 24) -> list[ResourcePack]:
        """Search exact compatible packs first; fall back to the public catalogue if its search index lags a new Minecraft version."""
        normalized_query = query.strip()
        exact_facets = [["project_type:resourcepack"], [f"versions:{minecraft_version}"]]
        hits = self._search(normalized_query, exact_facets, limit)
        exact_match = True
        if not hits:
            # Modrinth search tags can lag right after a Minecraft release. The install step always performs an exact version check.
            hits = self._search(normalized_query, [["project_type:resourcepack"]], limit)
            exact_match = False
        return [self._pack_from_hit(hit, exact_match) for hit in hits]

    def compatible_file(self, project_id: str, minecraft_version: str) -> CompatibleFile | None:
        response = self._get(
            f"/project/{project_id}/version",
            params={"game_versions": json.dumps([minecraft_version]), "loaders": json.dumps(["minecraft"]), "include_changelog": "false"},
        )
        try:
            versions = response.json()
        except ValueError as error:
            raise ModrinthError("Modrinth вернул непонятный список версий ресурс-пака.") from error
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
            raise ModrinthError(f"«{pack.title}» пока не имеет файла для Minecraft {minecraft_version}. Выберите другой набор.")
        target_directory = Path(minecraft_directory) / "resourcepacks"
        target_directory.mkdir(parents=True, exist_ok=True)
        target = target_directory / Path(file.filename).name
        temporary = target.with_suffix(target.suffix + ".part")
        status(f"Скачиваем {pack.title} · {file.version_name}…")
        digest = hashlib.sha1()
        downloaded = 0
        with self._get(file.url, stream=True, timeout=90) as response:
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
            raise ModrinthError("Проверка SHA-1 не прошла; ресурс-пак не установлен.")
        temporary.replace(target)
        status(f"Ресурс-пак установлен: {target.name}")
        return target

    def fetch_icon(self, icon_url: str | None) -> bytes | None:
        if not icon_url:
            return None
        try:
            return self._get(icon_url, timeout=15).content
        except ModrinthError:
            return None
