from pathlib import Path

from voxel_launcher.services.minecraft import MinecraftService

service = MinecraftService(str(Path("/tmp/voxel-minecraft-smoke")))
versions = service.available_versions()
print(f"versions={len(versions)}; first={versions[0].version_id}:{versions[0].version_type}")
print(f"latest_release={service.resolve_version('latest-release')}")
