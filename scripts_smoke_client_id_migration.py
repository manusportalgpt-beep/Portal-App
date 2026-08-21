import json
import os
import shutil
from pathlib import Path

root = Path("/tmp/voxel-client-id-migration")
shutil.rmtree(root, ignore_errors=True)
os.environ["APPDATA"] = str(root)

from voxel_launcher.services.storage import DEFAULT_AZURE_CLIENT_ID, SettingsStore, app_directory

settings_path = app_directory() / "settings.json"
settings_path.write_text(json.dumps({"azure_client_id": "", "selected_version": "latest-release"}), encoding="utf-8")
settings = SettingsStore().load()
assert settings.azure_client_id == DEFAULT_AZURE_CLIENT_ID
print(f"client_id={settings.azure_client_id}; migrated=True")
shutil.rmtree(root, ignore_errors=True)
