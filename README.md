# Windows 12 Launcher

Локальный Windows x64-лаунчер в стиле Liquid Glass / Seelen UI. Приложение не содержит телеметрии и сетевых запросов: настройки хранятся только локально, а запуск программ выполняется через безопасный IPC-слой Electron.

## Запуск

```bash
npm install
npm start
```

## Windows x64

```bash
npm install
npm run build:win
```

Для гарантированной Windows-сборки также доступен workflow `.github/workflows/windows-build.yml`.
