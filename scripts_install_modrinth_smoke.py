import shutil
from pathlib import Path

import minecraft_launcher_lib

from voxel_launcher.services.modrinth import ModrinthService

version = minecraft_launcher_lib.utils.get_latest_version()["release"]
target_root = Path("/tmp/voxel-resourcepack-install-smoke")
shutil.rmtree(target_root, ignore_errors=True)
service = ModrinthService()
packs = service.search_resourcepacks("Fresh Animations", version, limit=5)
pack = next(item for item in packs if item.exact_version_match)
installed = service.download_resourcepack(
    pack,
    version,
    str(target_root),
    status=lambda text: print(f"status={text}"),
    progress=lambda current, maximum: None,
)
print(f"installed={installed}; exists={installed.exists()}; bytes={installed.stat().st_size}")
shutil.rmtree(target_root, ignore_errors=True)
