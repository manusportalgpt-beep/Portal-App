from __future__ import annotations

import threading
import time
import webbrowser
from dataclasses import dataclass
from http.server import BaseHTTPRequestHandler, HTTPServer
from typing import Callable
from urllib.parse import urlparse

import keyring
import minecraft_launcher_lib


SERVICE_NAME = "VoxelVanillaLauncher"
TOKEN_KEY = "minecraft_refresh_token"


@dataclass
class Account:
    name: str
    uuid: str
    access_token: str
    refresh_token: str


class TokenVault:
    @staticmethod
    def load() -> str | None:
        try:
            return keyring.get_password(SERVICE_NAME, TOKEN_KEY)
        except Exception:
            return None

    @staticmethod
    def save(refresh_token: str) -> bool:
        try:
            keyring.set_password(SERVICE_NAME, TOKEN_KEY, refresh_token)
            return True
        except Exception:
            return False

    @staticmethod
    def clear() -> None:
        try:
            keyring.delete_password(SERVICE_NAME, TOKEN_KEY)
        except Exception:
            pass


class CallbackServer:
    def __init__(self, redirect_uri: str) -> None:
        parsed = urlparse(redirect_uri)
        self.host = parsed.hostname or "localhost"
        self.port = parsed.port or 53618
        self.path = parsed.path or "/callback"
        self.callback_url: str | None = None
        self.error: str | None = None
        self.event = threading.Event()
        self.server: HTTPServer | None = None

    def start(self) -> None:
        owner = self

        class Handler(BaseHTTPRequestHandler):
            def do_GET(self) -> None:  # noqa: N802
                current = urlparse(self.path)
                if current.path != owner.path:
                    self.send_response(404)
                    self.end_headers()
                    return
                owner.callback_url = f"http://{owner.host}:{owner.port}{self.path}"
                if current.query:
                    owner.callback_url += f"?{current.query}"
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.end_headers()
                self.wfile.write(
                    "<html><body style='font-family:Segoe UI;background:#101114;color:#f2f2f2;padding:36px'>"
                    "<h2>Вход завершён</h2><p>Вернитесь в Voxel Vanilla Launcher.</p></body></html>".encode("utf-8")
                )
                owner.event.set()

            def log_message(self, *_: object) -> None:
                return

        self.server = HTTPServer((self.host, self.port), Handler)
        threading.Thread(target=self.server.serve_forever, daemon=True).start()

    def wait(self, seconds: int = 300) -> str:
        if not self.event.wait(seconds):
            raise TimeoutError("Время ожидания Microsoft-входа истекло.")
        if not self.callback_url:
            raise RuntimeError("Microsoft не вернул код авторизации.")
        return self.callback_url

    def close(self) -> None:
        if self.server:
            self.server.shutdown()
            self.server.server_close()


def microsoft_login(client_id: str, redirect_uri: str, status: Callable[[str], None]) -> Account:
    if not client_id.strip():
        raise ValueError("Добавьте Client ID своего Azure-приложения в настройках лаунчера.")
    server = CallbackServer(redirect_uri)
    server.start()
    try:
        login_url, state, verifier = minecraft_launcher_lib.microsoft_account.get_secure_login_data(client_id, redirect_uri)
        status("Открываем защищённый вход Microsoft в браузере…")
        webbrowser.open(login_url)
        callback_url = server.wait()
        status("Проверяем авторизацию Microsoft и лицензию Minecraft…")
        auth_code = minecraft_launcher_lib.microsoft_account.parse_auth_code_url(callback_url, state)
        response = minecraft_launcher_lib.microsoft_account.complete_login(client_id, None, redirect_uri, auth_code, verifier)
        TokenVault.save(response["refresh_token"])
        return Account(
            name=response["name"],
            uuid=response["id"],
            access_token=response["access_token"],
            refresh_token=response["refresh_token"],
        )
    finally:
        server.close()


def refresh_account(client_id: str) -> Account:
    token = TokenVault.load()
    if not client_id.strip() or not token:
        raise ValueError("Войдите через Microsoft перед запуском игры.")
    response = minecraft_launcher_lib.microsoft_account.complete_refresh(client_id, token)
    TokenVault.save(response["refresh_token"])
    return Account(
        name=response["name"],
        uuid=response["id"],
        access_token=response["access_token"],
        refresh_token=response["refresh_token"],
    )
