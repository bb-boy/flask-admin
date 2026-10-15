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
