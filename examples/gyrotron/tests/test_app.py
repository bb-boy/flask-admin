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
