# Voxel Vanilla Launcher

**Voxel Vanilla Launcher** — лёгкий Python-лаунчер для официального **Vanilla Minecraft**. Он получает список версий из официального manifest, устанавливает/восстанавливает выбранную игру, использует Minecraft Java Runtime, запускает Java-команду и устанавливает совместимые resource pack из Modrinth.

Интерфейс намеренно построен по принципам [Kill AI Slop](https://killaislop.com/): одна акцентная краска, плоские поверхности, ясная типографика, отсутствие декоративного стекла, градиентов, бейджей и лишней анимации.

## Возможности

| Возможность | Реализация |
|---|---|
| Vanilla-версии | В списке отображаются релизы, снапшоты, beta и alpha из официального Minecraft manifest. |
| Реальная установка | `minecraft-launcher-lib` устанавливает и при необходимости восстанавливает только недостающие или повреждённые игровые файлы. |
| Основной ник | Интерфейс показывает фактический ник лицензионного Minecraft-профиля и запускает игру от него. |
| Реальный запуск | При запуске лаунчер обновляет уже подтверждённую официальную сессию, генерирует Java-команду и запускает Minecraft через `subprocess`. |
| Java Runtime | Нужный runtime определяется для выбранной версии и автоматически устанавливается механизмом Minecraft Launcher Library. |
| Однократное подтверждение | Browser-based OAuth с PKCE нужен лишь для первичного подключения или смены основного ника. Пароль не вводится в лаунчер. |
| Защита токена | Refresh token сохраняется в Windows Credential Manager через `keyring`, а не в JSON-файле. |
| Modrinth | Поиск только `resourcepack`, фильтрация по выбранной Minecraft version, отображение иконки, описания, категорий и числа скачиваний. |
| Установка resource pack | Подбирается файл, чья версия Minecraft совпадает с активным профилем; файл кладётся в `.minecraft/resourcepacks` и проверяется SHA-1, если Modrinth его публикует. |
| Ограничения | Нет offline/cracked-профилей, модов, Forge/Fabric и обхода лицензии. |

## Первый запуск

Установите зависимости и откройте приложение:

```bash
python -m pip install -r requirements.txt
python main.py
```

В разделе **Настройки** проверьте путь к `.minecraft`, выделенную память и Client ID основного профиля. Далее выберите версию в разделе **Игра**, нажмите **«Подключить ник»** один раз и подтвердите аккаунт в системном браузере. После этого лаунчер будет показывать ваш основной ник и запускать Minecraft без повторного браузерного входа, пока сессия действительна.

## Подключение основного ника

Для настоящего запуска лаунчер должен получить начальную официальную сессию законным путём. Создайте своё Azure-приложение для desktop/public client, добавьте redirect URI:

```text
http://localhost:53618/callback
```

Затем внесите Client ID в настройки лаунчера и один раз подключите основной ник. Новым Azure-приложениям необходимо разрешение Microsoft/Minecraft API; без него библиотека честно вернёт ошибку `AzureAppNotPermitted`. Сохранённый refresh token используется для последующих запусков и обновляется через `complete_refresh()`, который также проверяет владение Minecraft. Лаунчер не использует чужой Client ID, не хранит пароль, не читает секреты официального Launcher и не предоставляет неофициальный вход.

> Для запуска требуется учётная запись, владеющая Minecraft: Java Edition. Лаунчер не является средством обхода покупки игры.

## Ресурс-паки Modrinth

Откройте раздел **Ресурс-паки**, введите запрос и выберите нужный результат. Поиск получает только проекты типа `resourcepack`, совместимые с активной Vanilla-версией. Кнопка установки загружает primary-файл совместимой версии и помещает его в папку `resourcepacks`; включите набор в стандартном меню Minecraft.

## Windows x64 `.exe`

На Windows выполните:

```powershell
powershell -ExecutionPolicy Bypass -File build_windows.ps1
```

Готовый файл появится по пути:

```text
dist\VoxelVanillaLauncher.exe
```

В репозитории есть GitHub Actions workflow `.github/workflows/windows-build.yml`, который собирает нативный Windows x64 `.exe` и прикладывает его как artifact.

## Проверки проекта

В проект включены воспроизводимые smoke-тесты:

```bash
python scripts_smoke_minecraft.py
python scripts_smoke_modrinth.py
```

Они проверяют получение всех Vanilla-версий из manifest, актуальный релиз, поиск Modrinth, выбор совместимого файла и декодирование PNG-иконки resource pack.

## Источники

[1]: [minecraft-launcher-lib — Getting Started](https://minecraft-launcher-lib.readthedocs.io/en/stable/tutorial/getting_started.html)
[2]: [minecraft-launcher-lib — Microsoft Login](https://minecraft-launcher-lib.readthedocs.io/en/stable/tutorial/microsoft_login.html)
[3]: [minecraft-launcher-lib — Runtime](https://minecraft-launcher-lib.readthedocs.io/en/stable/modules/runtime.html)
[4]: [Modrinth API — List project versions](https://docs.modrinth.com/api/operations/getprojectversions/)
[5]: [Modrinth API — Search projects](https://docs.modrinth.com/api/operations/searchprojects/)
