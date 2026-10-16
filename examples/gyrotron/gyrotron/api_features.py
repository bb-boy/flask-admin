"""Query, dashboard, export and safe bulk operations for gyrotron records.

Import this module after the API blueprint has been created.
"""

from __future__ import annotations

import csv
import hashlib
import io
import json
import zipfile
from collections import defaultdict
from datetime import date
from typing import Any

from flask import Response, jsonify, request
from sqlalchemy import and_, func, select
from sqlalchemy.orm import selectinload

from .api import api, fail, session
from .field_definitions import FIXED_FIELDS, FIXED_NAMES
from .models import CustomParameter, Shot
from .validation import RecordValidationError


def filters_from_args(args: Any):
    """Use one filtering contract for listing, exports and batch operations."""
    stmt = select(Shot)
    if args.get("ids") is not None:
        ids = args["ids"]
        if (
            not isinstance(ids, list)
            or len(ids) > 10000
            or not all(isinstance(x, int) and x > 0 for x in ids)
        ):
            raise RecordValidationError("所选炮次 ID 格式错误")
        stmt = stmt.where(Shot.id.in_(ids))
    if term := str(args.get("search", "")).strip():
        if len(term) > 120:
            raise RecordValidationError("检索关键词过长")
        escaped = term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        stmt = stmt.where(Shot.Serial.ilike("%" + escaped + "%", escape="\\"))
    if serial := str(args.get("serial", "")).strip():
        stmt = stmt.where(Shot.Serial == serial)
    if shot_number := str(args.get("shot", "")).strip():
        from .api import parse_bigint

        stmt = stmt.where(Shot.shot == parse_bigint(shot_number, "炮号"))
    for name, op in (("date_from", ">="), ("date_to", "<=")):
        value = args.get(name)
        if value:
            try:
                parsed = date.fromisoformat(value)
                if parsed.isoformat() != value:
                    raise ValueError()
            except (TypeError, ValueError) as exc:
                raise RecordValidationError("日期筛选格式必须是 YYYY-MM-DD") from exc
            stmt = stmt.where(Shot.date >= parsed if op == ">=" else Shot.date <= parsed)
    missing = args.get("iplen_state", "")
    if missing == "missing":
        stmt = stmt.where((Shot.iplen.is_(None)) | (Shot.iplen <= 0))
    elif missing == "positive":
        stmt = stmt.where(Shot.iplen > 0)
    elif missing:
        raise RecordValidationError("脉宽筛选条件错误")
    from .api import parse_decimal

    for field in FIXED_NAMES:
        for suffix, op in (("_min", ">="), ("_max", "<=")):
            if (value := args.get(field + suffix)) not in (None, ""):
                parsed = parse_decimal(value, field + suffix)
                column = getattr(Shot, field)
                stmt = stmt.where(column >= parsed if op == ">=" else column <= parsed)
    raw_filters = args.get("custom_filters")
    if raw_filters:
        try:
            custom_filters = (
                json.loads(raw_filters) if isinstance(raw_filters, str) else raw_filters
            )
        except (ValueError, TypeError) as exc:
            raise RecordValidationError("自定义参数筛选格式错误") from exc
        if not isinstance(custom_filters, list) or len(custom_filters) > 10:
            raise RecordValidationError("自定义参数筛选最多 10 项")
        for item in custom_filters:
            if not isinstance(item, dict):
                raise RecordValidationError("自定义参数筛选格式错误")
            name = item.get("name")
            operator = item.get("operator", "contains")
            value = item.get("value", "")
            if not isinstance(name, str) or not name.strip() or not isinstance(value, str):
                raise RecordValidationError("自定义参数筛选的名称和值必须为文本")
            if operator not in ("contains", "eq", "gt", "gte", "lt", "lte"):
                raise RecordValidationError("自定义参数筛选运算符错误")
            criterion = [CustomParameter.name == name]
            if operator == "contains":
                escaped = value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
                criterion.append(CustomParameter.value.ilike("%" + escaped + "%", escape="\\"))
            elif operator == "eq":
                criterion.append(CustomParameter.value == value)
            else:
                from .api import parse_decimal

                number = parse_decimal(value, "筛选数值")
                if number is None:
                    raise RecordValidationError("数值筛选不能留空")
                # Narrow to validated DECIMAL/BIGINT rows before casting, not free text.
                from sqlalchemy import Numeric, cast

                criterion.append(CustomParameter.data_type.in_(("DECIMAL", "BIGINT")))
                comparator = cast(CustomParameter.value, Numeric(28, 10))
                criterion.append(
                    {
                        "gt": comparator > number,
                        "gte": comparator >= number,
                        "lt": comparator < number,
                        "lte": comparator <= number,
                    }[operator]
                )
            stmt = stmt.where(Shot.custom_parameters.any(and_(*criterion)))
    return stmt


def filtered_ids(filters: dict[str, Any]) -> list[int]:
    return (
        session()
        .scalars(filters_from_args(filters).with_only_columns(Shot.id).order_by(Shot.id))
        .all()
    )


def snapshot(ids: list[int]) -> str:
    return hashlib.sha256(",".join(str(id_) for id_ in ids).encode("ascii")).hexdigest()


def dashboard_payload(serial: str = "") -> dict[str, Any]:
    db = session()
    all_serials = db.execute(
        select(Shot.Serial, func.count(Shot.id), func.max(Shot.date))
        .group_by(Shot.Serial)
        .order_by(func.count(Shot.id).desc(), Shot.Serial)
    ).all()
    stmt = select(Shot.id, Shot.Serial, Shot.shot, Shot.date, Shot.iplen)
    if serial:
        stmt = stmt.where(Shot.Serial == serial)
    points = []
    daily: dict[str, int] = defaultdict(int)
    missing = 0
    last_date = None
    for id_, sn, number, dt, pulse in db.execute(stmt):
        if dt:
            key = dt.isoformat()
            daily[key] += 1
            if last_date is None or dt > last_date:
                last_date = dt
        if pulse is None or pulse <= 0:
            missing += 1
        else:
            points.append(
                {
                    "id": id_,
                    "Serial": sn,
                    "shot": str(number),
                    "date": dt.isoformat() if dt else None,
                    "iplen": str(pulse),
                }
            )
    total = len(points) + missing
    return {
        "shots": total,
        "serials": len(all_serials),
        "parameters": db.scalar(select(func.count(CustomParameter.id))) or 0,
        "latest_date": last_date.isoformat() if last_date else None,
        "by_serial": [{"name": sn, "count": count} for sn, count, _ in all_serials],
        "points": points,
        "missing_iplen": missing,
        "daily": [{"date": day, "count": count} for day, count in sorted(daily.items())],
    }


@api.get("/serials")
def serials():
    db = session()
    results = db.execute(
        select(Shot.Serial, func.max(Shot.date))
        .group_by(Shot.Serial)
        .order_by(func.max(Shot.date).desc(), Shot.Serial)
    ).all()
    return jsonify(
        [{"name": name, "latest_date": dt.isoformat() if dt else None} for name, dt in results]
    )


@api.get("/next-shot")
def next_shot():
    serial = request.args.get("serial", "").strip()
    if not serial:
        return fail("请先选择 Serial")
    maximum = session().scalar(select(func.max(Shot.shot)).where(Shot.Serial == serial))
    value = (maximum or 0) + 1
    if value > 2**63 - 1:
        return fail("炮号超过 BIGINT 最大值")
    return jsonify({"shot": str(value)})


@api.get("/parameter-suggestions")
def parameter_suggestions():
    serial = request.args.get("serial", "").strip()
    rows = session().execute(
        select(
            CustomParameter.name,
            CustomParameter.description,
            CustomParameter.unit,
            CustomParameter.data_type,
            Shot.Serial,
        )
        .join(Shot, Shot.id == CustomParameter.shot_id)
        .order_by(Shot.id.desc(), CustomParameter.id.desc())
    )
    entries: dict[str, dict[str, Any]] = {}
    for name, meaning, unit, kind, source in rows:
        if name not in entries or (source == serial and entries[name]["source"] != serial):
            entries[name] = {
                "name": name,
                "description": meaning,
                "unit": unit,
                "data_type": kind,
                "source": source,
            }
    return jsonify(sorted(entries.values(), key=lambda row: (row["source"] != serial, row["name"])))


def csv_bytes(headers: list[str], records: list[list[Any]]) -> bytes:
    output = io.StringIO(newline="")
    writer = csv.writer(output)
    writer.writerow(headers)
    writer.writerows(records)
    return output.getvalue().encode("utf-8-sig")


def export_rows(filters: dict[str, Any]):
    records = (
        session()
        .scalars(
            filters_from_args(filters)
            .options(selectinload(Shot.custom_parameters))
            .order_by(Shot.Serial, Shot.shot)
        )
        .all()
    )
    fixed_headers = ["Serial", "shot", "date", "remark"] + [
        f"{name} ({unit})" for name, _, unit in FIXED_FIELDS
    ]
    custom_headers = ["Serial", "shot", "参数名称", "参数含义", "单位", "数据类型", "参数值"]
    fixed_rows, custom_rows = [], []
    for shot in records:
        fixed_rows.append(
            [
                shot.Serial,
                str(shot.shot),
                shot.date.isoformat() if shot.date else None,
                shot.remark,
                *[
                    str(getattr(shot, field)) if getattr(shot, field) is not None else None
                    for field in FIXED_NAMES
                ],
            ]
        )
        for param in shot.custom_parameters:
            custom_rows.append(
                [
                    shot.Serial,
                    str(shot.shot),
                    param.name,
                    param.description,
                    param.unit,
                    param.data_type,
                    param.value,
                ]
            )
    return fixed_headers, fixed_rows, custom_headers, custom_rows


@api.get("/shots/export")
def export_shots():
    try:
        fixed_headers, fixed_rows, custom_headers, custom_rows = export_rows(dict(request.args))
        file_type = request.args.get("format", "xlsx")
        if file_type == "csv":
            archive = io.BytesIO()
            with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED) as zip_file:
                zip_file.writestr("shots.csv", csv_bytes(fixed_headers, fixed_rows))
                zip_file.writestr("custom_parameters.csv", csv_bytes(custom_headers, custom_rows))
            return Response(
                archive.getvalue(),
                mimetype="application/zip",
                headers={"Content-Disposition": 'attachment; filename="shots.zip"'},
            )
        if file_type != "xlsx":
            raise RecordValidationError("导出格式只支持 xlsx 或 csv")
        from openpyxl import Workbook

        wb = Workbook()
        first = wb.active
        first.title = "炮次记录"
        first.append(fixed_headers)
        for row in fixed_rows:
            first.append(row)
        second = wb.create_sheet("自定义参数")
        second.append(custom_headers)
        for row in custom_rows:
            second.append(row)
        output = io.BytesIO()
        wb.save(output)
        return Response(
            output.getvalue(),
            mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": 'attachment; filename="shots.xlsx"'},
        )
    except RecordValidationError as exc:
        return fail(str(exc))


@api.post("/shots/delete-preview")
def delete_preview():
    try:
        body = request.get_json(silent=True) or {}
        if not isinstance(body, dict) or not isinstance(body.get("filters"), dict):
            raise RecordValidationError("筛选条件格式错误")
        ids = filtered_ids(body["filters"])
        return jsonify({"count": len(ids), "snapshot": snapshot(ids)})
    except RecordValidationError as exc:
        return fail(str(exc))


@api.post("/shots/bulk-delete")
def bulk_delete():
    try:
        body = request.get_json(silent=True) or {}
        if not isinstance(body, dict) or not isinstance(body.get("filters"), dict):
            raise RecordValidationError("筛选条件格式错误")
        token = body.get("snapshot")
        if not isinstance(token, str) or len(token) != 64:
            raise RecordValidationError("请先预览删除范围")
        db = session()
        ids = filtered_ids(body["filters"])
        if snapshot(ids) != token:
            return fail("筛选结果已经发生变化，请重新确认删除范围", 409)
        if ids:
            for item in db.scalars(select(Shot).where(Shot.id.in_(ids))).all():
                db.delete(item)  # Preserve ORM delete-orphan cascade.
        db.commit()
        return jsonify({"deleted": len(ids)})
    except RecordValidationError as exc:
        session().rollback()
        return fail(str(exc))
