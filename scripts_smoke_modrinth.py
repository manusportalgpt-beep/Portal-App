import io

import minecraft_launcher_lib
from PIL import Image

from voxel_launcher.services.modrinth import ModrinthService

latest = minecraft_launcher_lib.utils.get_latest_version()["release"]
service = ModrinthService()
packs = service.search_resourcepacks("Faithful", latest, limit=5)
print(f"version={latest}; results={len(packs)}")
if packs:
    compatible = service.compatible_file(packs[0].project_id, latest)
    icon_bytes = service.fetch_icon(packs[0].icon_url)
    icon_format = Image.open(io.BytesIO(icon_bytes)).format if icon_bytes else "none"
    print(f"first={packs[0].title}; compatible={bool(compatible)}; icon_bytes={len(icon_bytes or b'')}; icon_format={icon_format}")
