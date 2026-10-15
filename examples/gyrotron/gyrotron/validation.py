"""Domain validation shared by UI and tests."""

from __future__ import annotations

from datetime import date
from decimal import Decimal, InvalidOperation

from .models import CustomParameter, Shot

BASE_FIELDS = frozenset(
    {
        "Serial",
        "shot",
        "iplen",
        "Uc",
        "Ua",
        "Ib",
        "Im",
        "Pf",
        "Ic",
        "Pw",
        "Pc",
        "remark",
        "date",
        "id",
        "shot_id",
    }
)
SUPPORTED_TYPES = ("DECIMAL", "BIGINT", "STRING", "TEXT", "DATE")
BIGINT_MIN, BIGINT_MAX = -(2**63), 2**63 - 1


class RecordValidationError(ValueError):
    pass


def validate_parameter(parameter: CustomParameter) -> None:
    name = (parameter.name or "").strip()
    if not name:
        raise RecordValidationError("自定义参数名称不能为空")
    if name.casefold() in {field.casefold() for field in BASE_FIELDS}:
        raise RecordValidationError(f"自定义参数 {name} 与系统固定字段重名")
    if not (parameter.description or "").strip():
        raise RecordValidationError(f"参数 {name} 必须填写中文含义")
    if parameter.data_type not in SUPPORTED_TYPES:
        raise RecordValidationError(f"参数 {name} 的类型不支持: {parameter.data_type}")
    value = parameter.value
    if value is None or str(value).strip() == "":
        return
    value = str(value).strip()
    if parameter.data_type == "DECIMAL":
        try:
            number = Decimal(value)
        except InvalidOperation as exc:
            raise RecordValidationError(f"参数 {name} 必须是有效小数") from exc
        if not number.is_finite():
            raise RecordValidationError(f"参数 {name} 不能为 NaN 或无穷大")
    elif parameter.data_type == "BIGINT":
        if not value.lstrip("+-").isdigit():
            raise RecordValidationError(f"参数 {name} 必须是整数")
        integer_value = int(value)
        if not BIGINT_MIN <= integer_value <= BIGINT_MAX:
            raise RecordValidationError(f"参数 {name} 超出 BIGINT 范围")
    elif parameter.data_type == "DATE":
        try:
            parsed = date.fromisoformat(value)
            if parsed.isoformat() != value:
                raise ValueError("日期不是 YYYY-MM-DD")
        except ValueError as exc:
            raise RecordValidationError(f"参数 {name} 的日期必须为 YYYY-MM-DD") from exc


def validate_shot(shot: Shot) -> None:
    if not (shot.Serial or "").strip():
        raise RecordValidationError("Serial 不能为空")
    if shot.shot is None or not BIGINT_MIN <= shot.shot <= BIGINT_MAX:
        raise RecordValidationError("shot 必须为有效 BIGINT")
    seen: set[str] = set()
    for parameter in shot.custom_parameters:
        validate_parameter(parameter)
        key = parameter.name.strip().casefold()
        if key in seen:
            raise RecordValidationError(f"同一炮次的自定义参数名不能重复: {parameter.name}")
        seen.add(key)
