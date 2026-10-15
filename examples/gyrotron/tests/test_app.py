from gyrotron import create_app

def test_basic_web_routes_without_login():
    app = create_app({"TESTING": True, "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:"})
    client = app.test_client()
    assert client.get("/healthz").json == {"status": "ok"}
    assert client.get("/").status_code == 302
    assert client.get("/admin/").status_code == 200
    assert client.get("/admin/shots/").status_code == 200

def test_shot_create_form_contains_required_fields():
    app = create_app({"TESTING": True, "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:"})
    response = app.test_client().get("/admin/shots/new/")
    assert response.status_code == 200
    assert b"Serial" in response.data
    assert b"shot" in response.data


def test_create_shot_with_inline_parameter_via_web_form():
    from gyrotron.models import Shot
    app = create_app({"TESTING": True, "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:"})
    client = app.test_client()
    result = client.post(
        "/admin/shots/new/",
        data={
            "Serial": "GYRO-WEB-001",
            "shot": "1001",
            "iplen": "1.5",
            "custom_parameters-0-name": "It",
            "custom_parameters-0-description": "钛泵电流",
            "custom_parameters-0-unit": "mA",
            "custom_parameters-0-data_type": "DECIMAL",
            "custom_parameters-0-value": "2.5",
        },
    )
    assert result.status_code in (302, 303), result.get_data(as_text=True)[:700]
    with app.app_context():
        saved = app.extensions["gyrotron_session"].query(Shot).one()
        assert saved.Serial == "GYRO-WEB-001"
        assert saved.shot == 1001
        assert [(p.name, p.unit, p.value) for p in saved.custom_parameters] == [
            ("It", "mA", "2.5"),
        ]

def _data(serial="GYRO-001", shot="1001", name="It", value="2.5", parameter_id=None):
    fields = {
        "Serial": serial,
        "shot": shot,
        "iplen": "1.5",
        "Uc": "80.25",
        "date": "2026-10-15",
    }
    if name is not None:
        fields.update({
            "custom_parameters-0-name": name,
            "custom_parameters-0-description": "钛泵电流",
            "custom_parameters-0-unit": "mA",
            "custom_parameters-0-data_type": "DECIMAL",
            "custom_parameters-0-value": value,
        })
    if parameter_id is not None:
        fields["custom_parameters-0-id"] = str(parameter_id)
    return fields


def test_edit_history_via_web_keeps_other_shot_unchanged():
    from gyrotron.models import Shot

    app = create_app({"TESTING": True, "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:"})
    client = app.test_client()
    assert client.post("/admin/shots/new/", data=_data(shot="1001")).status_code == 302
    assert client.post("/admin/shots/new/", data=_data(shot="1002", value="3.5")).status_code == 302

    with app.app_context():
        db = app.extensions["gyrotron_session"]
        first = db.query(Shot).filter_by(shot=1001).one()
        second = db.query(Shot).filter_by(shot=1002).one()
        first_id, param_id = first.id, first.custom_parameters[0].id
        second_id = second.id
    edit_page = client.get(f"/admin/shots/edit/?id={first_id}")
    assert edit_page.status_code == 200
    assert b"custom_parameters-0-name" in edit_page.data
    data = _data(shot="1001", name="It2", value="8.5", parameter_id=param_id)
    changed = client.post(f"/admin/shots/edit/?id={first_id}", data=data)
    assert changed.status_code == 302, changed.get_data(as_text=True)[:500]
    with app.app_context():
        db = app.extensions["gyrotron_session"]
        first = db.get(Shot, first_id)
        second = db.get(Shot, second_id)
        assert first.custom_parameters[0].name == "It2"
        assert first.custom_parameters[0].value == "8.5"
        assert second.custom_parameters[0].name == "It"
        assert second.custom_parameters[0].value == "3.5"


def test_delete_inline_parameter_via_web_keeps_other_shots():
    from gyrotron.models import Shot

    app = create_app({"TESTING": True, "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:"})
    client = app.test_client()
    client.post("/admin/shots/new/", data=_data(shot="1001"))
    client.post("/admin/shots/new/", data=_data(shot="1002", value="3.5"))
    with app.app_context():
        db = app.extensions["gyrotron_session"]
        first = db.query(Shot).filter_by(shot=1001).one()
        second = db.query(Shot).filter_by(shot=1002).one()
        first_id, param_id = first.id, first.custom_parameters[0].id
        second_id = second.id

    fields = _data(shot="1001", parameter_id=param_id)
    fields["del-custom_parameters-0"] = "on"
    result = client.post(f"/admin/shots/edit/?id={first_id}", data=fields)
    assert result.status_code == 302, result.get_data(as_text=True)[:500]
    with app.app_context():
        db = app.extensions["gyrotron_session"]
        assert db.get(Shot, first_id).custom_parameters == []
        assert db.get(Shot, second_id).custom_parameters[0].value == "3.5"


def test_new_shot_page_does_not_inherit_previous_parameters():
    from gyrotron.models import Shot

    app = create_app({"TESTING": True, "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:"})
    client = app.test_client()
    assert client.post("/admin/shots/new/", data=_data(shot="1001")).status_code == 302
    page = client.get("/admin/shots/new/")
    assert page.status_code == 200
    assert b'value="It"' not in page.data
    result = client.post("/admin/shots/new/", data=_data(shot="1002", name=None))
    assert result.status_code == 302, result.get_data(as_text=True)[:500]
    with app.app_context():
        db = app.extensions["gyrotron_session"]
        a = db.query(Shot).filter_by(shot=1001).one()
        b = db.query(Shot).filter_by(shot=1002).one()
        assert len(a.custom_parameters) == 1
        assert b.custom_parameters == []


def test_duplicate_shot_via_web_does_not_create_record():
    from gyrotron.models import Shot

    app = create_app({"TESTING": True, "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:"})
    client = app.test_client()
    assert client.post("/admin/shots/new/", data=_data()).status_code == 302
    response = client.post("/admin/shots/new/", data=_data())
    assert response.status_code == 200
    with app.app_context():
        assert app.extensions["gyrotron_session"].query(Shot).count() == 1


def test_invalid_parameter_via_web_does_not_save():
    from gyrotron.models import Shot

    app = create_app({"TESTING": True, "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:"})
    client = app.test_client()
    response = client.post("/admin/shots/new/", data=_data(value="not-a-decimal"))
    assert response.status_code == 200
    with app.app_context():
        assert app.extensions["gyrotron_session"].query(Shot).count() == 0
