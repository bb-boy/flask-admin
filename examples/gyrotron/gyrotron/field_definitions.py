"""Fixed measurement field metadata shared by API clients and validation."""

FIXED_FIELDS = (
    ("iplen", "脉宽", "ms"),
    ("Uc", "阴极电压", "kV"),
    ("Ua", "阳极电压", "kV"),
    ("Ib", "回旋管电流", "A"),
    ("Im", "磁场电流", "A"),
    ("Pf", "灯丝功率", "W"),
    ("Ic", "阴极线圈电流", "A"),
    ("Pw", "水负载功率", "kW"),
    ("Pc", "收集极功率", "kW"),
)
FIXED_NAMES = tuple(item[0] for item in FIXED_FIELDS)
