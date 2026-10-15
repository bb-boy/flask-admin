"""Gyrotron shot log package."""

from typing import Any

from flask import Flask


def create_app(test_config: dict[str, Any] | None = None) -> Flask:
    from .webapp import create_app as make_app

    return make_app(test_config)
