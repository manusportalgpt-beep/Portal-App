import json

import minecraft_launcher_lib
import requests

from voxel_launcher.services.modrinth import API_ROOT, HEADERS

version = minecraft_launcher_lib.utils.get_latest_version()["release"]
checks = {
    "exact_version": [["project_type:resourcepack"], [f"versions:{version}"]],
    "resourcepack_only": [["project_type:resourcepack"]],
}

for name, facets in checks.items():
    response = requests.get(
        f"{API_ROOT}/search",
        params={"query": "Faithful", "facets": json.dumps(facets), "limit": 5, "index": "downloads"},
        headers=HEADERS,
        timeout=30,
    )
    response.raise_for_status()
    payload = response.json()
    print(f"{name}: status={response.status_code}; version={version}; total_hits={payload.get('total_hits')}; returned={len(payload.get('hits', []))}")
