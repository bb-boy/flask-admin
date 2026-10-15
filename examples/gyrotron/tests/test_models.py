from datetime import date
from decimal import Decimal
import pytest
from sqlalchemy.exc import IntegrityError
from gyrotron.models import CustomParameter, Shot
from gyrotron.validation import RecordValidationError, validate_parameter, validate_shot

def shot(serial="G-001", number=1):
    return Shot(Serial=serial, shot=number, iplen=Decimal("1.250"), date=date(2026, 10, 15))

def param(name="It", value="2.5", data_type="DECIMAL"):
    return CustomParameter(
        name=name, description="钛泵电流", unit="mA", data_type=data_type, value=value
    )

def test_same_serial_and_shot_must_be_unique(session):
    session.add(shot())
    session.commit()
    session.add(shot())
    with pytest.raises(IntegrityError):
        session.commit()

def test_same_shot_on_different_serial_is_allowed(session):
    session.add_all([shot("G-001", 1), shot("G-002", 1)])
    session.commit()
    assert session.query(Shot).count() == 2

def test_new_shot_does_not_inherit_custom_parameters(session):
    old = shot(number=1001)
    old.custom_parameters.append(param())
    new = shot(number=1002)
    session.add_all([old, new])
    session.commit()
    session.expunge_all()
    restored = session.query(Shot).filter_by(shot=1001).one()
    clean = session.query(Shot).filter_by(shot=1002).one()
    assert [(p.name, p.unit, p.value) for p in restored.custom_parameters] == [
        ("It", "mA", "2.5")
    ]
    assert clean.custom_parameters == []

def test_editing_or_deleting_parameter_affects_only_its_shot(session):
    s1, s2 = shot(number=1), shot(number=2)
    s1.custom_parameters.append(param(value="1"))
    s2.custom_parameters.append(param(value="2"))
    session.add_all([s1, s2])
    session.commit()
    s1.custom_parameters[0].value = "3"
    session.commit()
    assert s2.custom_parameters[0].value == "2"
    s1.custom_parameters.clear()
    session.commit()
    session.expire_all()
    assert session.get(Shot, s1.id).custom_parameters == []
    assert session.get(Shot, s2.id).custom_parameters[0].value == "2"

def test_cannot_reuse_fixed_parameter_name():
    with pytest.raises(RecordValidationError, match="固定字段"):
        validate_parameter(param("Uc"))
    with pytest.raises(RecordValidationError, match="固定字段"):
        validate_parameter(param("serial"))

def test_duplicate_custom_parameter_names_disallowed():
    record = shot()
    record.custom_parameters.extend([param("It"), param("it")])
    with pytest.raises(RecordValidationError, match="不能重复"):
        validate_shot(record)

@pytest.mark.parametrize("value", ["abc", "NaN", "Infinity", "-Inf"])
def test_decimal_rejects_invalid_readings(value):
    with pytest.raises(RecordValidationError):
        validate_parameter(param(value=value))

@pytest.mark.parametrize("value", ["12.3", str(2**63), str(-(2**63) - 1)])
def test_bigint_rejects_invalid_readings(value):
    with pytest.raises(RecordValidationError):
        validate_parameter(param(value=value, data_type="BIGINT"))

def test_date_type_format():
    validate_parameter(param(value="2026-10-15", data_type="DATE"))
    with pytest.raises(RecordValidationError):
        validate_parameter(param(value="2026-02-30", data_type="DATE"))

def test_basic_field_persistence(session):
    record = shot()
    record.remark = "实验记录"
    session.add(record)
    session.commit()
    session.expire_all()
    saved = session.get(Shot, record.id)
    assert saved.iplen == Decimal("1.2500000000")
    assert saved.date == date(2026, 10, 15)
    assert saved.remark == "实验记录"

def test_parameter_name_unique_per_shot_in_db(session):
    record = shot()
    record.custom_parameters.extend([param("It"), param("It")])
    session.add(record)
    with pytest.raises(IntegrityError):
        session.commit()

def test_custom_parameter_cannot_have_unknown_type():
    with pytest.raises(RecordValidationError, match="类型不支持"):
        validate_parameter(param(data_type="UNKNOWN"))

def test_missing_parameter_value_is_allowed():
    validate_parameter(param(value=None))
    validate_parameter(param(value=""))
