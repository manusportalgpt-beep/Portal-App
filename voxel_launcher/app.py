from __future__ import annotations

import io
import tkinter as tk
from tkinter import messagebox, ttk
from typing import Any

from PIL import Image, ImageTk

from .services.auth import TokenVault, microsoft_login, refresh_account
from .services.minecraft import MinecraftService
from .services.modrinth import ModrinthService, ResourcePack
from .services.storage import Settings, SettingsStore
from .services.workers import BackgroundTasks, UiEvent


BG = "#101114"
PANEL = "#181a1e"
PANEL_2 = "#202329"
TEXT = "#f4f4f1"
MUTED = "#a4a7a2"
LINE = "#30343a"
ACCENT = "#a8ff15"
ACCENT_DARK = "#243a0d"
ERROR = "#ff8178"
FONT = "Segoe UI"


class VoxelVanillaApp(tk.Tk):
    def __init__(self) -> None:
        super().__init__()
        self.title("Voxel Vanilla Launcher")
        self.geometry("1100x700")
        self.minsize(920, 590)
        self.configure(bg=BG)

        self.store = SettingsStore()
        self.settings = self.store.load()
        self.tasks = BackgroundTasks()
        self.minecraft = MinecraftService(self.settings.minecraft_directory)
        self.modrinth = ModrinthService()
        self.versions: list[Any] = []
        self.selected_pack: ResourcePack | None = None
        self.pack_widgets: dict[str, tk.Label] = {}
        self.image_refs: dict[str, ImageTk.PhotoImage] = {}

        self.version_value = tk.StringVar(value=self.settings.selected_version)
        self.version_filter = tk.StringVar(value="Все версии")
        self.pack_query = tk.StringVar(value=self.settings.last_resourcepack_query)
        self.status_value = tk.StringVar(value="Подготавливаем каталог Vanilla…")
        self.account_value = tk.StringVar(value=self.settings.account_name or "Основной ник не подключён")
        self.profile_hint_value = tk.StringVar(value="Подключите основной Minecraft-профиль один раз.")
        self.runtime_value = tk.StringVar(value="Java Runtime определится после выбора версии")
        self.progress_value = tk.DoubleVar(value=0)

        self._style()
        self._build_shell()
        self._update_profile_ui()
        self.show_page("game")
        self.after(80, self._poll_events)
        self.load_versions()

    def _style(self) -> None:
        style = ttk.Style(self)
        style.theme_use("clam")
        style.configure("TCombobox", fieldbackground=PANEL_2, background=PANEL_2, foreground=TEXT, bordercolor=LINE, arrowcolor=TEXT, padding=7)
        style.map("TCombobox", fieldbackground=[("readonly", PANEL_2)], selectbackground=[("readonly", PANEL_2)], selectforeground=[("readonly", TEXT)])
        style.configure("Horizontal.TProgressbar", troughcolor="#262a30", background=ACCENT, bordercolor="#262a30", lightcolor=ACCENT, darkcolor=ACCENT)

    def _label(self, parent: tk.Misc, text: str = "", size: int = 10, color: str = TEXT, weight: str = "normal", **kwargs: Any) -> tk.Label:
        return tk.Label(parent, text=text, font=(FONT, size, weight), fg=color, bg=kwargs.pop("bg", parent.cget("bg")), **kwargs)

    def _button(self, parent: tk.Misc, text: str, command: Any, primary: bool = False, **kwargs: Any) -> tk.Button:
        background = ACCENT if primary else PANEL_2
        foreground = "#0d1307" if primary else TEXT
        active_background = "#c0ff55" if primary else "#2a2f35"
        button_font = kwargs.pop("font", (FONT, 10, "bold" if primary else "normal"))
        return tk.Button(parent, text=text, command=command, font=button_font, fg=foreground, bg=background, activeforeground=foreground, activebackground=active_background, bd=0, relief="flat", cursor="hand2", padx=13, pady=8, **kwargs)

    def _build_shell(self) -> None:
        header = tk.Frame(self, bg="#0c0d0f", height=54)
        header.pack(fill="x")
        header.pack_propagate(False)
        brand = tk.Frame(header, bg="#0c0d0f")
        brand.pack(side="left", padx=22)
        mark = tk.Label(brand, text="V", width=2, height=1, font=(FONT, 15, "bold"), fg="#0e1408", bg=ACCENT)
        mark.pack(side="left", pady=12)
        title = tk.Frame(brand, bg="#0c0d0f")
        title.pack(side="left", padx=9, pady=8)
        self._label(title, "VOXEL", 11, TEXT, "bold").pack(anchor="w")
        self._label(title, "VANILLA LAUNCHER", 7, MUTED).pack(anchor="w")
        self._label(header, "ТОЛЬКО ОФИЦИАЛЬНЫЙ VANILLA", 8, MUTED).pack(side="right", padx=22)

        workspace = tk.Frame(self, bg=BG)
        workspace.pack(fill="both", expand=True)
        sidebar = tk.Frame(workspace, bg="#0c0d0f", width=190)
        sidebar.pack(side="left", fill="y")
        sidebar.pack_propagate(False)
        self.nav_buttons: dict[str, tk.Button] = {}
        for key, title, hint in [("game", "Игра", "Версии и запуск"), ("packs", "Ресурс-паки", "Modrinth каталог"), ("settings", "Настройки", "Путь, Java, профиль")]:
            button = tk.Button(sidebar, text=f"{title}\n{hint}", justify="left", anchor="w", command=lambda page=key: self.show_page(page), font=(FONT, 10, "bold"), fg=TEXT, bg="#0c0d0f", activebackground=PANEL, activeforeground=TEXT, bd=0, padx=20, pady=12, cursor="hand2")
            button.pack(fill="x", pady=(18 if key == "game" else 0, 2))
            self.nav_buttons[key] = button
        spacer = tk.Frame(sidebar, bg="#0c0d0f")
        spacer.pack(fill="both", expand=True)
        self._label(sidebar, "Без offline-режима.\nНужна лицензия Minecraft.", 8, MUTED, justify="left", wraplength=155).pack(anchor="w", padx=20, pady=20)

        self.page_host = tk.Frame(workspace, bg=BG)
        self.page_host.pack(side="left", fill="both", expand=True)
        self.pages = {"game": self._build_game_page(), "packs": self._build_packs_page(), "settings": self._build_settings_page()}

        status = tk.Frame(self, bg="#0c0d0f", height=35)
        status.pack(fill="x")
        status.pack_propagate(False)
        dot = tk.Label(status, text="●", fg=ACCENT, bg="#0c0d0f", font=(FONT, 9))
        dot.pack(side="left", padx=(22, 7))
        self._label(status, textvariable=self.status_value, size=8, color=MUTED, bg="#0c0d0f").pack(side="left")
        self.progress = ttk.Progressbar(status, style="Horizontal.TProgressbar", variable=self.progress_value, maximum=100, length=160)
        self.progress.pack(side="right", padx=22, pady=12)

    def _page(self) -> tk.Frame:
        frame = tk.Frame(self.page_host, bg=BG)
        return frame

    def _build_game_page(self) -> tk.Frame:
        page = self._page()
        content = tk.Frame(page, bg=BG)
        content.pack(fill="both", expand=True, padx=48, pady=42)
        self._label(content, "VANILLA MINECRAFT", 8, ACCENT, "bold").pack(anchor="w")
        self._label(content, "Игра без лишнего.", 28, TEXT, "bold").pack(anchor="w", pady=(6, 4))
        self._label(content, "Официальные версии, Minecraft Java Runtime и запуск от вашего основного ника.", 10, MUTED).pack(anchor="w")

        split = tk.Frame(content, bg=BG)
        split.pack(fill="both", expand=True, pady=(36, 0))
        main = tk.Frame(split, bg=PANEL, highlightbackground=LINE, highlightthickness=1)
        main.pack(side="left", fill="both", expand=True)
        side = tk.Frame(split, bg="#141619", width=260, highlightbackground=LINE, highlightthickness=1)
        side.pack(side="right", fill="y", padx=(18, 0))
        side.pack_propagate(False)

        self._label(main, "ВЕРСИЯ", 8, MUTED, "bold", bg=PANEL).pack(anchor="w", padx=24, pady=(23, 6))
        version_row = tk.Frame(main, bg=PANEL)
        version_row.pack(fill="x", padx=24)
        self.version_combo = ttk.Combobox(version_row, textvariable=self.version_value, state="readonly", width=33)
        self.version_combo.pack(side="left", fill="x", expand=True)
        self.version_combo.bind("<<ComboboxSelected>>", lambda _: self._version_changed())
        self._button(version_row, "Обновить", self.load_versions).pack(side="left", padx=(9, 0))
        filters = tk.Frame(main, bg=PANEL)
        filters.pack(fill="x", padx=24, pady=10)
        for title in ["Все версии", "Релизы", "Снапшоты", "Классика"]:
            self._button(filters, title, lambda value=title: self._filter_versions(value), font=(FONT, 8)).pack(side="left", padx=(0, 5))
        self._label(main, "Проверка версии также устанавливает или восстанавливает только отсутствующие файлы.", 9, MUTED, bg=PANEL, wraplength=540, justify="left").pack(anchor="w", padx=24, pady=(10, 18))
        launch = self._button(main, "УСТАНОВИТЬ И ЗАПУСТИТЬ", self.install_and_launch, primary=True)
        launch.pack(anchor="w", padx=24, pady=(0, 24))

        self._label(side, "ОСНОВНОЙ НИК", 8, MUTED, "bold", bg="#141619").pack(anchor="w", padx=20, pady=(23, 8))
        self._label(side, textvariable=self.account_value, size=13, color=TEXT, weight="bold", bg="#141619", wraplength=210, justify="left").pack(anchor="w", padx=20)
        self._label(side, textvariable=self.profile_hint_value, size=8, color=MUTED, bg="#141619", wraplength=210, justify="left").pack(anchor="w", padx=20, pady=(7, 0))
        profile_actions = tk.Frame(side, bg="#141619")
        profile_actions.pack(anchor="w", padx=20, pady=(13, 24))
        self.profile_button = self._button(profile_actions, "Подключить ник", self.connect_primary_profile)
        self.profile_button.pack(side="left")
        self.disconnect_button = self._button(profile_actions, "Сброс", self.disconnect_profile, font=(FONT, 8))
        self.disconnect_button.pack(side="left", padx=(7, 0))
        tk.Frame(side, bg=LINE, height=1).pack(fill="x", padx=20)
        self._label(side, "JAVA RUNTIME", 8, MUTED, "bold", bg="#141619").pack(anchor="w", padx=20, pady=(23, 7))
        self._label(side, textvariable=self.runtime_value, size=10, color=TEXT, bg="#141619", wraplength=210, justify="left").pack(anchor="w", padx=20)
        self._label(side, "Нужная Java будет определена и поставлена автоматически через официальный Minecraft Runtime.", 8, MUTED, bg="#141619", wraplength=210, justify="left").pack(anchor="w", padx=20, pady=(9, 0))
        return page

    def _build_packs_page(self) -> tk.Frame:
        page = self._page()
        content = tk.Frame(page, bg=BG)
        content.pack(fill="both", expand=True, padx=48, pady=42)
        self._label(content, "MODRINTH", 8, ACCENT, "bold").pack(anchor="w")
        self._label(content, "Ресурс-паки", 28, TEXT, "bold").pack(anchor="w", pady=(6, 4))
        self._label(content, "Показываются только пакеты, совместимые с выбранной Vanilla-версией.", 10, MUTED).pack(anchor="w")

        tools = tk.Frame(content, bg=BG)
        tools.pack(fill="x", pady=(25, 14))
        search = tk.Entry(tools, textvariable=self.pack_query, font=(FONT, 11), fg=TEXT, bg=PANEL_2, insertbackground=TEXT, relief="flat", highlightthickness=1, highlightbackground=LINE)
        self.pack_search_input = search
        search.pack(side="left", fill="x", expand=True, ipady=9)
        search.bind("<Return>", lambda _: self.search_packs())
        self._button(tools, "Искать", self.search_packs, primary=True).pack(side="left", padx=(8, 0))
        self.pack_version_label = self._label(tools, "Версия: —", 8, MUTED)
        self.pack_version_label.pack(side="right", padx=(0, 12))

        body = tk.Frame(content, bg=BG)
        body.pack(fill="both", expand=True)
        list_host = tk.Frame(body, bg=PANEL, highlightbackground=LINE, highlightthickness=1)
        list_host.pack(side="left", fill="both", expand=True)
        detail = tk.Frame(body, bg="#141619", width=265, highlightbackground=LINE, highlightthickness=1)
        detail.pack(side="right", fill="y", padx=(18, 0))
        detail.pack_propagate(False)
        self._build_pack_list(list_host)
        self._label(detail, "ВЫБЕРИТЕ РЕСУРС-ПАК", 8, MUTED, "bold", bg="#141619").pack(anchor="w", padx=20, pady=(23, 9))
        self.pack_title = self._label(detail, "Каталог пуст", 14, TEXT, "bold", bg="#141619", wraplength=220, justify="left")
        self.pack_title.pack(anchor="w", padx=20)
        self.pack_description = self._label(detail, "Введите запрос и нажмите «Искать». Лаунчер применит фильтр совместимости по выбранной версии игры.", 9, MUTED, bg="#141619", wraplength=220, justify="left")
        self.pack_description.pack(anchor="w", padx=20, pady=(9, 18))
        self.pack_meta = self._label(detail, "", 8, MUTED, bg="#141619", wraplength=220, justify="left")
        self.pack_meta.pack(anchor="w", padx=20)
        self.install_pack_button = self._button(detail, "Установить в resourcepacks", self.install_selected_pack, primary=True, state="disabled")
        self.install_pack_button.pack(anchor="w", padx=20, pady=(20, 0))
        return page

    def _build_pack_list(self, host: tk.Frame) -> None:
        canvas = tk.Canvas(host, bg=PANEL, highlightthickness=0, bd=0)
        scrollbar = tk.Scrollbar(host, command=canvas.yview, relief="flat", bg=PANEL_2, troughcolor=PANEL)
        self.pack_list = tk.Frame(canvas, bg=PANEL)
        self.pack_list.bind("<Configure>", lambda _: canvas.configure(scrollregion=canvas.bbox("all")))
        canvas.create_window((0, 0), window=self.pack_list, anchor="nw")
        canvas.configure(yscrollcommand=scrollbar.set)
        canvas.pack(side="left", fill="both", expand=True)
        scrollbar.pack(side="right", fill="y")
        self.pack_canvas = canvas

    def _build_settings_page(self) -> tk.Frame:
        page = self._page()
        content = tk.Frame(page, bg=BG)
        content.pack(fill="both", expand=True, padx=48, pady=42)
        self._label(content, "НАСТРОЙКИ", 8, ACCENT, "bold").pack(anchor="w")
        self._label(content, "Только необходимое.", 28, TEXT, "bold").pack(anchor="w", pady=(6, 25))
        panel = tk.Frame(content, bg=PANEL, highlightbackground=LINE, highlightthickness=1)
        panel.pack(fill="x")
        self.path_input = self._setting_input(panel, "Minecraft directory", "Папка официальной игры и resourcepacks", self.settings.minecraft_directory)
        self.memory_input = self._setting_input(panel, "Память JVM (МБ)", "Минимум 1024, по умолчанию 4096", str(self.settings.memory_mb))
        self.client_input = self._setting_input(panel, "Client ID основного профиля", "Требуется один раз для защищённого подтверждения лицензионного Minecraft-профиля. Не используйте чужой Client ID.", self.settings.azure_client_id)
        self._label(panel, "После подтверждения лаунчер показывает и запускает основной ник без нового браузерного входа. Пароль не попадает в приложение; refresh token хранится в системном Credential Manager, если он доступен.", 9, MUTED, bg=PANEL, wraplength=650, justify="left").pack(anchor="w", padx=24, pady=(7, 18))
        self._button(panel, "Сохранить настройки", self.save_settings, primary=True).pack(anchor="w", padx=24, pady=(0, 24))
        return page

    def _setting_input(self, parent: tk.Frame, title: str, hint: str, value: str) -> tk.Entry:
        row = tk.Frame(parent, bg=PANEL)
        row.pack(fill="x", padx=24, pady=(21, 0))
        self._label(row, title, 10, TEXT, "bold", bg=PANEL).pack(anchor="w")
        self._label(row, hint, 8, MUTED, bg=PANEL).pack(anchor="w", pady=(2, 7))
        field = tk.Entry(row, font=(FONT, 10), fg=TEXT, bg=PANEL_2, insertbackground=TEXT, relief="flat", highlightthickness=1, highlightbackground=LINE)
        field.insert(0, value)
        field.pack(fill="x", ipady=8)
        return field

    def show_page(self, page: str) -> None:
        for key, frame in self.pages.items():
            frame.pack_forget()
            self.nav_buttons[key].configure(bg="#0c0d0f", fg=TEXT)
        self.pages[page].pack(fill="both", expand=True)
        self.nav_buttons[page].configure(bg=ACCENT_DARK, fg=ACCENT)
        if page == "packs":
            self.pack_query.set("")
            self.after_idle(lambda: self.pack_search_input.focus_set())

    def _has_primary_session(self) -> bool:
        return bool(self.settings.account_name and TokenVault.load())

    def _update_profile_ui(self) -> None:
        if self._has_primary_session():
            self.account_value.set(self.settings.account_name)
            self.profile_hint_value.set("Подтверждённый профиль. Запуск использует сохранённую официальную сессию.")
            self.profile_button.configure(text="Сменить ник")
            if not self.disconnect_button.winfo_ismapped():
                self.disconnect_button.pack(side="left", padx=(7, 0))
            self.disconnect_button.configure(state="normal")
        else:
            self.account_value.set("Основной ник не подключён")
            self.profile_hint_value.set("Подключите основной Minecraft-профиль один раз.")
            self.profile_button.configure(text="Подключить ник")
            self.disconnect_button.pack_forget()

    def _filter_versions(self, value: str) -> None:
        self.version_filter.set(value)
        self._render_versions()

    def load_versions(self) -> None:
        def task() -> list[Any]:
            self.minecraft = MinecraftService(self.settings.minecraft_directory)
            return self.minecraft.available_versions()
        self.tasks.run("versions", task)

    def _render_versions(self) -> None:
        choice = self.version_filter.get()
        allowed = {"Все версии": None, "Релизы": "release", "Снапшоты": "snapshot", "Классика": {"alpha", "beta"}}[choice]
        values = ["latest-release", "latest-snapshot"]
        for item in self.versions:
            if allowed is None or item.version_type == allowed or (isinstance(allowed, set) and item.version_type in allowed):
                values.append(item.version_id)
        self.version_combo["values"] = values
        if self.version_value.get() not in values:
            self.version_value.set("latest-release")
        self._version_changed()

    def _version_changed(self) -> None:
        try:
            version = self.minecraft.resolve_version(self.version_value.get())
            self.runtime_value.set(self.minecraft.runtime_label(version))
            self.pack_version_label.configure(text=f"Версия: {version}")
        except Exception:
            self.runtime_value.set("Java Runtime будет определён при установке")

    def save_settings(self) -> None:
        try:
            memory = max(1024, int(self.memory_input.get().strip()))
        except ValueError:
            messagebox.showerror("Память JVM", "Введите целое число в мегабайтах.")
            return
        self.settings.minecraft_directory = self.path_input.get().strip()
        self.settings.memory_mb = memory
        self.settings.azure_client_id = self.client_input.get().strip()
        self.settings.selected_version = self.version_value.get()
        self.settings.last_resourcepack_query = ""
        self.store.save(self.settings)
        self.minecraft = MinecraftService(self.settings.minecraft_directory)
        self.status_value.set("Настройки сохранены локально.")
        self._version_changed()

    def connect_primary_profile(self) -> None:
        self.save_settings()
        if self._has_primary_session():
            if not messagebox.askyesno("Смена основного профиля", "Сбросить сохранённую сессию и подтвердить другой основной ник?"):
                return
            self.disconnect_profile(quiet=True)

        def task() -> dict[str, str]:
            account = microsoft_login(self.settings.azure_client_id, self.settings.redirect_uri, lambda text: self.tasks.send("status", text))
            return {"name": account.name, "uuid": account.uuid}
        self.tasks.run("login", task)

    def disconnect_profile(self, quiet: bool = False) -> None:
        if not quiet and not messagebox.askyesno("Сброс профиля", "Удалить сохранённую сессию основного ника с этого компьютера?"):
            return
        TokenVault.clear()
        self.settings.account_name = ""
        self.settings.account_uuid = ""
        self.store.save(self.settings)
        self._update_profile_ui()
        self.status_value.set("Основной профиль сброшен на этом компьютере.")

    def install_and_launch(self) -> None:
        self.save_settings()
        def task() -> dict[str, str]:
            account = refresh_account(self.settings.azure_client_id)
            self.tasks.send("status", f"Профиль: {account.name}")
            version = self.minecraft.resolve_version(self.version_value.get())
            self.tasks.send("runtime", self.minecraft.runtime_label(version))
            self.minecraft.install(version, lambda text: self.tasks.send("status", text), lambda current, maximum: self.tasks.send("progress", (current, maximum)))
            self.minecraft.launch(version, account, self.settings.memory_mb, lambda text: self.tasks.send("status", text))
            return {"version": version, "name": account.name}
        self.tasks.run("launch", task)

    def search_packs(self) -> None:
        query = self.pack_query.get().strip()
        if not query:
            self.status_value.set("Введите название ресурс-пака.")
            return
        self.save_settings()
        def task() -> tuple[str, list[ResourcePack]]:
            version = self.minecraft.resolve_version(self.version_value.get())
            return version, self.modrinth.search_resourcepacks(query, version)
        self.tasks.run("pack-search", task)

    def _show_packs(self, version: str, packs: list[ResourcePack]) -> None:
        self.selected_pack = None
        self.install_pack_button.configure(state="disabled")
        self.pack_title.configure(text="Каталог пуст" if not packs else "Выберите ресурс-пак")
        self.pack_description.configure(text="Совместимые результаты не найдены." if not packs else "Нажмите на строку слева, чтобы посмотреть информацию и установить совместимый файл.")
        self.pack_meta.configure(text="")
        for child in self.pack_list.winfo_children():
            child.destroy()
        self.pack_widgets.clear()
        self.image_refs.clear()
        self.pack_version_label.configure(text=f"Версия: {version}")
        if not packs:
            self._label(self.pack_list, "Нет совместимых ресурс-паков по этому запросу.", 10, MUTED, bg=PANEL).pack(anchor="w", padx=18, pady=18)
            return
        for pack in packs:
            row = tk.Frame(self.pack_list, bg=PANEL, highlightbackground=LINE, highlightthickness=1, cursor="hand2")
            row.pack(fill="x", padx=10, pady=(10, 0))
            icon = tk.Label(row, text="□", width=4, height=2, font=(FONT, 13), fg=MUTED, bg=PANEL_2)
            icon.pack(side="left", padx=12, pady=11)
            copy = tk.Frame(row, bg=PANEL)
            copy.pack(side="left", fill="both", expand=True, pady=9)
            self._label(copy, pack.title, 10, TEXT, "bold", bg=PANEL, anchor="w").pack(fill="x")
            description = (pack.description or "Без описания").replace("\n", " ")
            self._label(copy, description[:120], 8, MUTED, bg=PANEL, anchor="w").pack(fill="x", pady=(3, 0))
            self._label(copy, f"{pack.downloads:,} скачиваний · {', '.join(pack.categories[:3]) or 'resourcepack'}", 8, MUTED, bg=PANEL, anchor="w").pack(fill="x", pady=(4, 0))
            for widget in (row, icon, copy, *copy.winfo_children()):
                widget.bind("<Button-1>", lambda _, item=pack, frame=row: self._select_pack(item, frame))
            self.pack_widgets[pack.project_id] = icon
        self.tasks.run("pack-icons", lambda: self._load_pack_icons(packs))

    def _load_pack_icons(self, packs: list[ResourcePack]) -> None:
        for pack in packs:
            image = self.modrinth.fetch_icon(pack.icon_url)
            if image:
                self.tasks.send("pack-icon", (pack.project_id, image))

    def _select_pack(self, pack: ResourcePack, frame: tk.Frame) -> None:
        self.selected_pack = pack
        for child in self.pack_list.winfo_children():
            child.configure(bg=PANEL)
            for descendant in child.winfo_children():
                try:
                    descendant.configure(bg=PANEL if descendant is not self.pack_widgets.get(pack.project_id) else PANEL_2)
                except tk.TclError:
                    pass
        frame.configure(bg="#243015")
        self.pack_title.configure(text=pack.title)
        self.pack_description.configure(text=pack.description or "Описание не предоставлено автором.")
        self.pack_meta.configure(text=f"Совместимо с {self.pack_version_label.cget('text').replace('Версия: ', '')}\n{pack.downloads:,} скачиваний\n{', '.join(pack.categories) or 'resourcepack'}")
        self.install_pack_button.configure(state="normal")

    def install_selected_pack(self) -> None:
        if not self.selected_pack:
            return
        selected = self.selected_pack
        def task() -> str:
            version = self.minecraft.resolve_version(self.version_value.get())
            target = self.modrinth.download_resourcepack(selected, version, self.settings.minecraft_directory, lambda text: self.tasks.send("status", text), lambda current, maximum: self.tasks.send("progress", (current, maximum)))
            return str(target)
        self.tasks.run("pack-install", task)

    def _poll_events(self) -> None:
        while not self.tasks.events.empty():
            event = self.tasks.events.get_nowait()
            self._handle_event(event)
        self.after(80, self._poll_events)

    def _handle_event(self, event: UiEvent) -> None:
        if event.kind == "status":
            self.status_value.set(str(event.payload))
        elif event.kind == "progress":
            current, maximum = event.payload
            self.progress["maximum"] = max(1, maximum)
            self.progress_value.set(current)
        elif event.kind == "runtime":
            self.runtime_value.set(str(event.payload))
        elif event.kind == "versions":
            self.versions = event.payload
            self._render_versions()
            self.status_value.set(f"Доступно версий: {len(self.versions)}")
        elif event.kind == "login":
            self.settings.account_name = event.payload["name"]
            self.settings.account_uuid = event.payload["uuid"]
            self.store.save(self.settings)
            self._update_profile_ui()
            self.status_value.set(f"Основной ник «{event.payload['name']}» подключён. Можно запускать игру.")
        elif event.kind == "launch":
            self.settings.account_name = event.payload["name"]
            self.store.save(self.settings)
            self._update_profile_ui()
            self.status_value.set(f"Minecraft {event.payload['version']} запущен как {event.payload['name']}.")
            self.progress_value.set(0)
        elif event.kind == "pack-search":
            version, packs = event.payload
            self._show_packs(version, packs)
            self.status_value.set(f"Найдено совместимых ресурс-паков: {len(packs)}")
        elif event.kind == "pack-icon":
            project_id, raw = event.payload
            label = self.pack_widgets.get(project_id)
            if label:
                try:
                    image = Image.open(io.BytesIO(raw)).convert("RGBA")
                    image.thumbnail((42, 42), Image.Resampling.LANCZOS)
                    photo = ImageTk.PhotoImage(image)
                    self.image_refs[project_id] = photo
                    label.configure(image=photo, text="")
                except Exception:
                    pass
        elif event.kind == "pack-install":
            self.status_value.set(f"Ресурс-пак установлен: {event.payload}")
            self.progress_value.set(0)
        elif event.kind == "task-start":
            self.progress_value.set(0)
        elif event.kind == "task-error":
            name, error = event.payload
            self.progress_value.set(0)
            self.status_value.set("Операция не завершена.")
            messagebox.showerror("Voxel Vanilla Launcher", error)


def main() -> None:
    VoxelVanillaApp().mainloop()


if __name__ == "__main__":
    main()
