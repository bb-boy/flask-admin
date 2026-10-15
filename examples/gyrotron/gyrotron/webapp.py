"""Flask app factory for the gyrotron run log."""

import os
import secrets
from pathlib import Path
from typing import Any

from flask import Flask, abort, redirect, send_from_directory
from flask_admin import Admin
from flask_admin.theme import Bootstrap4Theme
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy.pool import StaticPool

from .admin import ShotAdmin
from .models import Base, Shot

db = SQLAlchemy(model_class=Base)


def create_app(test_config: dict[str, Any] | None = None) -> Flask:
    app = Flask(__name__)
    instance_dir = Path(app.instance_path)
    instance_dir.mkdir(parents=True, exist_ok=True)
    app.config.update(
        SECRET_KEY=os.getenv("SECRET_KEY") or secrets.token_hex(32),
        SQLALCHEMY_DATABASE_URI=os.getenv("DATABASE_URL")
        or f"sqlite:///{instance_dir / 'gyrotron.sqlite3'}",
        TESTING=False,
    )
    if test_config:
        app.config.update(test_config)

    database_url = app.config["SQLALCHEMY_DATABASE_URI"]
    engine_options: dict[str, Any] = {"pool_pre_ping": True}
    if database_url in ("sqlite://", "sqlite:///:memory:"):
        engine_options["connect_args"] = {"check_same_thread": False}
        engine_options["poolclass"] = StaticPool
    app.config["SQLALCHEMY_ENGINE_OPTIONS"] = engine_options
    db.init_app(app)
    with app.app_context():
        db.create_all()  # Initial MVP schema; future changes require migrations.

    @app.route("/")
    def home():
        return redirect("/app/")

    @app.route("/app/")
    @app.route("/app/<path:client_path>")
    def frontend(client_path: str = ""):
        # Built by Vite and copied into this package in the production Dockerfile.
        folder = Path(app.static_folder or "") / "app"
        if not (folder / "index.html").is_file():
            return "前端尚未构建，请先运行 npm run build。", 503
        if client_path.startswith(("api/", "static/")):
            abort(404)
        return send_from_directory(folder, "index.html")

    @app.route("/healthz")
    def health():
        return {"status": "ok"}

    from .api import api

    app.register_blueprint(api)
    # Keep legacy URLs for existing bookmarks/tests, but React is the primary UI.
    admin = Admin(app, name="回旋管运行参数记录系统", theme=Bootstrap4Theme())
    admin.add_view(ShotAdmin(Shot, db, name="炮次记录", endpoint="shots"))
    app.extensions["gyrotron_session"] = db.session
    return app
