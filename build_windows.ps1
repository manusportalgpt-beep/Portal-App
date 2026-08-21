$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

python -m pip install --upgrade pip
python -m pip install -r requirements.txt

pyinstaller --noconfirm --clean --windowed --onefile `
  --name VoxelVanillaLauncher `
  --collect-all minecraft_launcher_lib `
  --collect-all keyring `
  --hidden-import keyring.backends.Windows.WinVaultKeyring `
  main.py

Write-Host "Готово: dist\VoxelVanillaLauncher.exe"
