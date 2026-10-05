"""Small local config, stored in the user's home directory so the desktop app can
remember the API key without a terminal environment variable."""

from __future__ import annotations

import json
import os
from pathlib import Path

CONFIG = Path.home() / ".mandarin_tutor.json"


def load() -> dict:
    try:
        return json.loads(CONFIG.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}


def save(data: dict) -> None:
    CONFIG.write_text(json.dumps(data), encoding="utf-8")


def get_api_key() -> str:
    """Env var wins, then the saved config."""
    return os.environ.get("ANTHROPIC_API_KEY") or load().get("api_key") or ""


def set_api_key(key: str) -> None:
    data = load()
    data["api_key"] = key.strip()
    save(data)
