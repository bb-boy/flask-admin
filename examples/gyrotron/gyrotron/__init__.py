"""Gyrotron shot log package."""
from typing import Any


def create_app(test_config: dict[str, Any] | None = None):
    from .webapp import create_app as make_app

    return make_app(test_config)
