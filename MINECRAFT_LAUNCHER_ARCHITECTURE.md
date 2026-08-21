# Архитектура Voxel Vanilla Launcher

## Назначение

Лаунчер запускает **только официальный Vanilla Minecraft**. Он не содержит offline/cracked-режима, модлоадеров, модов или альтернативных источников игровых файлов. Для запуска используется `minecraft-launcher-lib`, который получает официальный manifest, устанавливает выбранную версию и формирует Java-команду.

## Структура

| Компонент | Ответственность |
|---|---|
| `app.py` | Лёгкий интерфейс Tkinter, очередь фоновых задач, выбор версии, запуск, прогресс и окна каталога. |
| `services/minecraft.py` | Версии, установка, Java Runtime, формирование и запуск команды Vanilla. |
| `services/auth.py` | OAuth с PKCE: начало входа, localhost callback, refresh token из системного хранилища. |
| `services/modrinth.py` | Публичный каталог resource pack, фильтрация по активной Minecraft version, загрузка и SHA-1 проверка. |
| `services/storage.py` | Настройки без access/refresh token: путь `.minecraft`, версия, память, Azure Client ID. |
| `services/workers.py` | Выполнение сетевых и установочных операций вне UI-потока. |

## Безопасность

Игровые файлы используются только из официального manifest через библиотеку запуска. Resource pack скачивается только с прямого URL версии Modrinth, отображённой пользователю, и проверяется SHA-1, если он опубликован API. Refresh token не записывается в JSON; при наличии Windows Credential Manager используется `keyring`. Если системное хранилище недоступно, токен не сохраняется, и вход нужно повторять после перезапуска.

## Java

Перед запуском лаунчер вызывает `install_minecraft_version()`. Библиотека сама определяет требуемый runtime и устанавливает официальный Minecraft Java Runtime. UI также показывает соответствующую Java major version по `get_version_runtime_information()`.

## Microsoft-авторизация

Для настоящего игрового запуска нужна купленная лицензия Minecraft и собственное зарегистрированное Azure-приложение с разрешением на Minecraft API. Лаунчер использует client ID, который пользователь задаёт в настройках, и redirect `http://localhost:53618/callback`; он не использует чужие client IDs, не принимает пароль Microsoft и не реализует обход лицензии.
