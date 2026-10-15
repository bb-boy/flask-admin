"""Editable shot records, with per-shot inline custom parameter rows."""

from typing import Any, cast

from flask_admin.contrib.sqla import ModelView
from wtforms import ValidationError

from .models import CustomParameter
from .validation import SUPPORTED_TYPES, RecordValidationError, validate_shot


class ShotAdmin(ModelView):
    list_template = "gyrotron/list.html"
    create_template = "gyrotron/create.html"
    edit_template = "gyrotron/edit.html"
    search_placeholder = "输入回旋管序列号..."
    can_view_details = True
    can_export = True
    export_types = ["csv"]  # noqa: RUF012
    page_size = 25
    column_list = ("Serial", "shot", "date", "iplen", "Uc", "Ib", "Im", "remark")
    column_searchable_list = ("Serial",)
    column_filters = ("Serial", "shot", "date")
    column_default_sort = ("id", True)
    column_labels = {  # noqa: RUF012
        "Serial": "回旋管序列号",
        "shot": "炮号",
        "iplen": "脉宽 (ms)",
        "Uc": "阴极电压 (kV)",
        "Ua": "阳极电压 (kV)",
        "Ib": "阴极电流 (A)",
        "Im": "磁场电流 (A)",
        "Pf": "灯丝功率 (W)",
        "Ic": "阴极线圈电流 (A)",
        "Pw": "水负载功率 (kW)",
        "Pc": "收集极功率 (kW)",
        "remark": "备注",
        "date": "实验日期",
        "custom_parameters": "当前炮次自定义参数",
    }
    form_columns = (
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
        "custom_parameters",
    )
    form_args = {  # noqa: RUF012
        "Serial": {"label": "回旋管序列号"},
        "shot": {"label": "炮号"},
    }
    inline_models = cast(
        Any,
        [
            (
                CustomParameter,
                {
                    "form_columns": ("id", "name", "description", "unit", "data_type", "value"),
                    "form_args": {
                        "name": {"label": "参数名称"},
                        "description": {"label": "参数含义"},
                        "unit": {"label": "单位"},
                        "data_type": {"label": "数据类型"},
                        "value": {"label": "参数值"},
                    },
                    "form_choices": {"data_type": [(t, t) for t in SUPPORTED_TYPES]},
                },
            ),
        ],
    )

    def on_model_change(self, form, model, is_created):
        try:
            validate_shot(model)
        except RecordValidationError as exc:
            raise ValidationError(str(exc)) from exc
