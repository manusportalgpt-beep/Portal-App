from __future__ import annotations

import queue
import threading
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any


@dataclass
class UiEvent:
    kind: str
    payload: Any = None


class BackgroundTasks:
    def __init__(self) -> None:
        self.events: queue.Queue[UiEvent] = queue.Queue()

    def send(self, kind: str, payload: Any = None) -> None:
        self.events.put(UiEvent(kind, payload))

    def run(self, name: str, task: Callable[[], Any]) -> None:
        def runner() -> None:
            self.send("task-start", name)
            try:
                result = task()
            except Exception as error:  # UI reports all expected networking/auth errors plainly.
                self.send("task-error", (name, str(error)))
            else:
                self.send(name, result)

        threading.Thread(target=runner, name=name, daemon=True).start()
