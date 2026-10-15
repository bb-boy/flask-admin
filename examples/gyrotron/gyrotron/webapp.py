"""Flask application factory with an isolated SQLAlchemy session."""
import os
import secrets
from pathlib import Path
from flask import Flask, redirect, url_for
from flask_admin import Admin
from flask_admin.theme import Bootstrap4Theme
from sqlalchemy import create_engine
from sqlalchemy.orm import scoped_session, sessionmaker
from sqlalchemy.pool import StaticPool
from .admin import ShotAdmin
from .models import Base, Shot

def create_app(test_config: dict | None = None) -> Flask:
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
    url = app.config["SQLALCHEMY_DATABASE_URI"]
    engine_options = {"pool_pre_ping": True}
    if url in ("sqlite://", "sqlite:///:memory:"):
        engine_options.update(connect_args={"check_same_thread": False}, poolclass=StaticPool)
    engine = create_engine(url, **engine_options)
    session = scoped_session(sessionmaker(bind=engine, autoflush=False))
    Base.metadata.create_all(engine)  # MVP only; use Alembic for schema changes.

    @app.teardown_appcontext
    def remove_session(exception=None):
        session.remove()

    @app.route("/")
    def home():
        return redirect(url_for("admin.index"))

    @app.route("/healthz")
    def health():
        return {"status": "ok"}

    admin = Admin(app, name="回旋管运行参数记录系统", theme=Bootstrap4Theme())
    admin.add_view(ShotAdmin(Shot, session, name="炮次记录", endpoint="shots"))
    app.extensions["gyrotron_db_engine"] = engine
    app.extensions["gyrotron_session"] = session
    return app
