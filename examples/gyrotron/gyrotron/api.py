"""JSON API for the modern Chinese experiment data console.

The API shares SQLAlchemy entities with legacy Flask-Admin. It does not expose
authentication: restrict network access at the reverse proxy / SSH boundary.
"""
from __future__ import annotations

import re
from datetime import date
from decimal import Decimal, InvalidOperation
from typing import Any

from flask import Blueprint, jsonify, request
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import selectinload

from .models import CustomParameter, Shot
from .validation import BIGINT_MAX, BIGINT_MIN, RecordValidationError, validate_shot

api = Blueprint("api", __name__, url_prefix="/api/v1")
NUMERIC_FIELDS = ("iplen", "Uc", "Ua", "Ib", "Im", "Pf", "Ic", "Pw", "Pc")
BASE_INPUTS = frozenset(("Serial", "shot", "date", "remark", "custom_parameters", *NUMERIC_FIELDS))


def session():
    from .webapp import db

    return db.session


def fail(message: str, code: int = 400):
    return jsonify({"error": message}), code


@api.after_request
def no_cache(response):
    response.headers["Cache-Control"] = "no-store"
    return response


def serialize(shot: Shot, *, include_parameters: bool = True) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "id": shot.id,
        "Serial": shot.Serial,
        "shot": str(shot.shot),
        "date": shot.date.isoformat() if shot.date else None,
        "remark": shot.remark,
    }
    payload.update(
        {field: str(getattr(shot, field)) if getattr(shot, field) is not None else None
         for field in NUMERIC_FIELDS}
    )
    if include_parameters:
        payload["custom_parameters"] = [
            {
                "id": param.id,
                "name": param.name,
                "description": param.description,
                "unit": param.unit,
                "data_type": param.data_type,
                "value": param.value,
            }
            for param in shot.custom_parameters
        ]
    return payload


def nonempty_string(value: Any, key: str, limit: int) -> str:
    if not isinstance(value, str) or not value.strip():
        raise RecordValidationError(f"{key} 不能为空")
    clean = value.strip()
    if len(clean) > limit:
        raise RecordValidationError(f"{key} 不能超过 {limit} 个字符")
    return clean


def optional_string(value: Any, key: str, limit: int | None = None) -> str | None:
    if value is None or value == "":
        return None
    if not isinstance(value, str):
        raise RecordValidationError(f"{key} 必须为文本")
    if limit is not None and len(value) > limit:
        raise RecordValidationError(f"{key} 不能超过 {limit} 个字符")
    return value


def parse_bigint(value: Any, key: str) -> int:
    if isinstance(value, bool) or not re.fullmatch(r"[+-]?\d+", str(value or "")):
        raise RecordValidationError(f"{key} 必须是整数")
    parsed = int(str(value))
    if not BIGINT_MIN <= parsed <= BIGINT_MAX:
        raise RecordValidationError(f"{key} 超出 64 位整数范围")
    return parsed


def parse_decimal(value: Any, key: str) -> Decimal | None:
    if value in (None, ""):
        return None
    if isinstance(value, bool) or not isinstance(value, (int, float, str)):
        raise RecordValidationError(f"{key} 必须是数值")
    try:
        number = Decimal(str(value))
    except InvalidOperation as exc:
        raise RecordValidationError(f"{key} 必须是有效小数") from exc
    if not number.is_finite():
        raise RecordValidationError(f"{key} 不能为 NaN 或无穷大")
    # Matches SQLAlchemy Numeric(28, 10). Avoid PostgreSQL overflow or rounding.
    if abs(number) >= Decimal("1e18") or number.as_tuple().exponent < -10:
        raise RecordValidationError(f"{key} 超出数值精度范围（最多 10 位小数）")
    return number


def parse_date(value: Any) -> date | None:
    if value in (None, ""):
        return None
    if not isinstance(value, str):
        raise RecordValidationError("实验日期格式必须是 YYYY-MM-DD")
    try:
        parsed = date.fromisoformat(value)
    except ValueError as exc:
        raise RecordValidationError("实验日期格式必须是 YYYY-MM-DD") from exc
    if parsed.isoformat() != value:
        raise RecordValidationError("实验日期格式必须是 YYYY-MM-DD")
    return parsed


def validated_form(data: Any) -> dict[str, Any]:
    if not isinstance(data, dict):
        raise RecordValidationError("请提交有效的 JSON 对象")
    if set(data) - BASE_INPUTS:
        raise RecordValidationError("提交了不支持的字段")
    parsed: dict[str, Any] = {
        "Serial": nonempty_string(data.get("Serial"), "回旋管序列号", 120),
        "shot": parse_bigint(data.get("shot"), "炮号"),
        "date": parse_date(data.get("date")),
        "remark": optional_string(data.get("remark"), "备注"),
    }
    for field in NUMERIC_FIELDS:
        parsed[field] = parse_decimal(data.get(field), field)
    params = data.get("custom_parameters", [])
    if not isinstance(params, list) or len(params) > 100:
        raise RecordValidationError("每炮最多支持 100 条自定义参数")
    parsed_params: list[dict[str, Any]] = []
    for row in params:
        if not isinstance(row, dict) or set(row) - {
            "id", "name", "description", "unit", "data_type", "value"
        }:
            raise RecordValidationError("自定义参数数据格式错误")
        raw_id = row.get("id")
        if raw_id is not None and (
            isinstance(raw_id, bool) or not isinstance(raw_id, int) or raw_id <= 0
        ):
            raise RecordValidationError("自定义参数 ID 格式错误")
        parsed_params.append(
            {
                "id": raw_id,
                "name": nonempty_string(row.get("name"), "参数名称", 120),
                "description": nonempty_string(row.get("description"), "参数含义", 255),
                "unit": optional_string(row.get("unit"), "单位", 60),
                "data_type": nonempty_string(row.get("data_type"), "数据类型", 24),
                "value": optional_string(row.get("value"), "参数值"),
            }
        )
    parsed["custom_parameters"] = parsed_params
    # Validate before any database write, including case-insensitive collisions.
    proposal = Shot(**{k: v for k, v in parsed.items() if k != "custom_parameters"})
    proposal.custom_parameters = [
        CustomParameter(**{k: v for k, v in p.items() if k != "id"}) for p in parsed_params
    ]
    validate_shot(proposal)
    return parsed


def apply_payload(shot: Shot, data: dict[str, Any]) -> None:
    for field, value in data.items():
        if field != "custom_parameters":
            setattr(shot, field, value)
    original_by_id = {p.id: p for p in shot.custom_parameters if p.id is not None}
    original_by_name = {p.name: p for p in shot.custom_parameters}
    replacements: list[CustomParameter] = []
    seen_ids: set[int] = set()
    for row in data["custom_parameters"]:
        param_id = row["id"]
        if param_id is not None:
            if param_id not in original_by_id or param_id in seen_ids:
                raise RecordValidationError("自定义参数不属于当前炮次，或 ID 重复")
            item = original_by_id[param_id]
            seen_ids.add(param_id)
        elif row["name"] in original_by_name and original_by_name[row["name"]] not in replacements:
            # Supports clients that update an existing parameter by name without ID.
            item = original_by_name[row["name"]]
        else:
            item = CustomParameter()
        for key in ("name", "description", "unit", "data_type", "value"):
            setattr(item, key, row[key])
        replacements.append(item)
    shot.custom_parameters = replacements
    validate_shot(shot)


@api.get("/dashboard")
def dashboard():
    db = session()
    total = db.query(func.count(Shot.id)).scalar() or 0
    devices = db.query(func.count(func.distinct(Shot.Serial))).scalar() or 0
    custom = db.query(func.count(CustomParameter.id)).scalar() or 0
    latest_date = db.query(func.max(Shot.date)).scalar()
    recent = db.scalars(select(Shot).order_by(Shot.id.desc()).limit(6)).all()
    groups = db.execute(
        select(Shot.Serial, func.count(Shot.id))
        .group_by(Shot.Serial)
        .order_by(func.count(Shot.id).desc(), Shot.Serial)
        .limit(8)
    ).all()
    return jsonify({
        "shots": total,
        "serials": devices,
        "parameters": custom,
        "latest_date": latest_date.isoformat() if latest_date else None,
        "recent": [serialize(shot, include_parameters=False) for shot in recent],
        "by_serial": [{"name": serial, "count": count} for serial, count in groups],
    })


@api.get("/shots")
def list_shots():
    try:
        page = int(request.args.get("page", "1"))
        size = int(request.args.get("page_size", "20"))
    except ValueError:
        return fail("分页参数必须是整数")
    if page < 1 or page > 100000 or size < 1 or size > 100:
        return fail("分页范围无效")
    search = request.args.get("search", "").strip()
    if len(search) > 120:
        return fail("检索关键词过长")
    db = session()
    stmt = select(Shot)
    if search:
        term = search.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        stmt = stmt.where(Shot.Serial.ilike(f"%{term}%", escape="\\"))
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = db.scalars(stmt.order_by(Shot.id.desc()).offset((page - 1) * size).limit(size)).all()
    return jsonify({
        "items": [serialize(shot, include_parameters=False) for shot in rows],
        "total": total, "page": page, "page_size": size,
    })


@api.get("/shots/<int:shot_id>")
def get_shot(shot_id: int):
    shot = session().scalar(
        select(Shot).options(selectinload(Shot.custom_parameters)).where(Shot.id == shot_id)
    )
    if shot is None:
        return fail("没有找到该炮次", 404)
    return jsonify(serialize(shot))


@api.post("/shots")
def create_shot():
    try:
        data = validated_form(request.get_json(silent=True))
        if any(param["id"] is not None for param in data["custom_parameters"]):
            raise RecordValidationError("新建炮次不能引用已有的参数 ID")
        shot = Shot()
        apply_payload(shot, data)
        db = session()
        db.add(shot)
        db.commit()
        return jsonify(serialize(shot)), 201
    except RecordValidationError as exc:
        session().rollback()
        return fail(str(exc))
    except IntegrityError:
        session().rollback()
        return fail("该回旋管序列号下的炮号已存在，请勿重复录入", 409)


@api.put("/shots/<int:shot_id>")
def update_shot(shot_id: int):
    db = session()
    shot = db.scalar(
        select(Shot).options(selectinload(Shot.custom_parameters)).where(Shot.id == shot_id)
    )
    if shot is None:
        return fail("没有找到该炮次", 404)
    try:
        data = validated_form(request.get_json(silent=True))
        apply_payload(shot, data)
        db.commit()
        return jsonify(serialize(shot))
    except RecordValidationError as exc:
        db.rollback()
        return fail(str(exc))
    except IntegrityError:
        db.rollback()
        return fail("保存失败：炮号或自定义参数名称重复", 409)


@api.delete("/shots/<int:shot_id>")
def delete_shot(shot_id: int):
    db = session()
    shot = db.get(Shot, shot_id)
    if shot is None:
        return fail("没有找到该炮次", 404)
    db.delete(shot)
    db.commit()
    return ("", 204)
