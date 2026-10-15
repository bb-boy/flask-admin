"""Flask app factory for the gyrotron run log."""

import os
import secrets
from pathlib import Path
from typing import Any

from flask import Flask, redirect, url_for
from flask_admin import Admin, AdminIndexView, expose
from flask_admin.theme import Bootstrap4Theme
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import func
from sqlalchemy.pool import StaticPool

from .admin import ShotAdmin
from .models import Base, CustomParameter, Shot

db = SQLAlchemy(model_class=Base)


class LabDashboard(AdminIndexView):
    """Database-backed overview; record CRUD stays in Flask-Admin."""

    @expose("/")
    def index(self) -> str:
        recent_shots = db.session.query(Shot).order_by(Shot.id.desc()).limit(6).all()
        return self.render(
            "gyrotron/dashboard.html",
            total_shots=db.session.query(func.count(Shot.id)).scalar() or 0,
            total_serials=db.session.query(func.count(func.distinct(Shot.Serial))).scalar() or 0,
            total_parameters=db.session.query(func.count(CustomParameter.id)).scalar() or 0,
            latest_date=db.session.query(func.max(Shot.date)).scalar(),
            recent_shots=recent_shots,
        )


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
        db.create_all()  # MVP startup; future schema changes need Alembic.

    @app.route("/")
    def home():
        return redirect(url_for("admin.index"))

    @app.route("/healthz")
    def health():
        return {"status": "ok"}

    admin = Admin(
        app,
        name="回旋管运行参数记录系统",
        index_view=LabDashboard(name="数据概览"),
        theme=Bootstrap4Theme(base_template="gyrotron/base.html", fluid=True),
    )
    admin.add_view(ShotAdmin(Shot, db, name="炮次记录", endpoint="shots"))
    app.extensions["gyrotron_session"] = db.session
    return app
