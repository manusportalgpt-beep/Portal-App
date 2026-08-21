import minecraft_launcher_lib

from voxel_launcher.services.modrinth import ModrinthService

version = minecraft_launcher_lib.utils.get_latest_version()["release"]
service = ModrinthService()
packs = service.search_resourcepacks("", version, limit=10)
assert packs, "Каталог Modrinth вернул пустую выдачу"
compatible = [pack for pack in packs if pack.exact_version_match]
print(f"version={version}; packs={len(packs)}; exact_matches={len(compatible)}")
selected = compatible[0] if compatible else packs[0]
file = service.compatible_file(selected.project_id, version)
print(f"selected={selected.title}; file_compatible={bool(file)}; filename={file.filename if file else '-'}")
