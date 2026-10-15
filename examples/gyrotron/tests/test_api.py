"""HTTP/API regression tests for the React frontend's database-backed JSON service."""

from gyrotron import create_app
from gyrotron.models import CustomParameter, Shot


def app_client():
    app = create_app({"TESTING": True, "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:"})
    return app, app.test_client()


def example(serial="GYRO-API-001", shot="90000000001234", value="2.50"):
    return {
        "Serial": serial,
        "shot": shot,
        "date": "2026-10-15",
        "iplen": "1.5",
        "Uc": "80.25",
        "Ua": None,
        "Ib": "8.125",
        "Im": None,
        "Pf": None,
        "Ic": None,
        "Pw": None,
        "Pc": None,
        "remark": "中文实验备注",
        "custom_parameters": [
            {
                "name": "It",
                "description": "模拟钛泵电流",
                "unit": "mA",
                "data_type": "DECIMAL",
                "value": value,
            },
        ],
    }


def test_api_dashboard_empty_and_no_frontend_build_message():
    _, client = app_client()
    dashboard = client.get("/api/v1/dashboard")
    assert dashboard.status_code == 200
    assert dashboard.json["shots"] == 0
    assert dashboard.json["serials"] == 0
    assert dashboard.json["parameters"] == 0
    assert dashboard.headers["Cache-Control"] == "no-store"


def test_api_create_list_detail_edit_and_cross_shot_independence():
    app, client = app_client()
    first = client.post("/api/v1/shots", json=example())
    second = client.post("/api/v1/shots", json=example(serial="GYRO-API-002", value="3.70"))
    assert first.status_code == 201, first.json
    assert second.status_code == 201, second.json
    a_id, b_id = first.json["id"], second.json["id"]
    assert first.json["shot"] == "90000000001234"
    assert first.json["custom_parameters"][0]["value"] == "2.50"
    assert client.get("/api/v1/shots?search=GYRO-API-001").json["total"] == 1
    assert client.get("/api/v1/shots?search=GYRO-API").json["total"] == 2
    assert client.get("/api/v1/shots?page=1&page_size=1").json["items"][0]["id"] == b_id
    assert client.get(f"/api/v1/shots/{a_id}").json["custom_parameters"][0]["name"] == "It"
    assert client.get("/api/v1/dashboard").json["parameters"] == 2

    payload = example(value="8.75")
    payload["custom_parameters"][0]["id"] = first.json["custom_parameters"][0]["id"]
    payload["custom_parameters"].append(
        {
            "name": "Vacuum",
            "description": "真空度",
            "unit": "Pa",
            "data_type": "DECIMAL",
            "value": "0.25",
        }
    )
    updated = client.put(f"/api/v1/shots/{a_id}", json=payload)
    assert updated.status_code == 200, updated.json
    assert len(updated.json["custom_parameters"]) == 2
    assert updated.json["custom_parameters"][0]["value"] == "8.75"
    assert client.get(f"/api/v1/shots/{b_id}").json["custom_parameters"][0]["value"] == "3.70"

    payload["custom_parameters"] = []
    assert client.put(f"/api/v1/shots/{a_id}", json=payload).status_code == 200
    assert client.get(f"/api/v1/shots/{a_id}").json["custom_parameters"] == []
    assert len(client.get(f"/api/v1/shots/{b_id}").json["custom_parameters"]) == 1

    with app.app_context():
        session = app.extensions["gyrotron_session"]
        assert session.query(Shot).count() == 2
        assert session.query(CustomParameter).count() == 1
    assert client.delete(f"/api/v1/shots/{a_id}").status_code == 204
    assert client.get(f"/api/v1/shots/{a_id}").status_code == 404
    assert client.get("/api/v1/dashboard").json["shots"] == 1


def test_api_unique_constraint_invalid_value_and_validation_messages():
    _, client = app_client()
    assert client.post("/api/v1/shots", json=example()).status_code == 201
    duplicate = client.post("/api/v1/shots", json=example())
    assert duplicate.status_code == 409
    assert "已存在" in duplicate.json["error"]
    invalid = example(shot="90000000001235", value="NaN")
    assert client.post("/api/v1/shots", json=invalid).status_code == 400
    invalid["custom_parameters"][0]["value"] = "1"
    invalid["custom_parameters"][0]["name"] = "Uc"
    assert client.post("/api/v1/shots", json=invalid).status_code == 400
    invalid["custom_parameters"][0]["name"] = "It"
    invalid["custom_parameters"].append(dict(invalid["custom_parameters"][0]))
    assert client.post("/api/v1/shots", json=invalid).status_code == 400
    invalid["custom_parameters"].pop()
    invalid["shot"] = "9223372036854775808"
    assert client.post("/api/v1/shots", json=invalid).status_code == 400
    assert client.get("/api/v1/shots").json["total"] == 1


def test_api_rejects_cross_shot_parameter_id_and_keeps_other_data():
    _, client = app_client()
    first = client.post("/api/v1/shots", json=example()).json
    second = client.post("/api/v1/shots", json=example(serial="GYRO-API-002")).json
    payload = example(value="123")
    payload["custom_parameters"][0]["id"] = second["custom_parameters"][0]["id"]
    response = client.put(f"/api/v1/shots/{first['id']}", json=payload)
    assert response.status_code == 400
    assert (
        client.get(f"/api/v1/shots/{first['id']}").json["custom_parameters"][0]["value"] == "2.50"
    )
    assert (
        client.get(f"/api/v1/shots/{second['id']}").json["custom_parameters"][0]["value"] == "2.50"
    )


def test_api_input_validation_and_search_pagination_limits():
    _, client = app_client()
    assert client.post("/api/v1/shots", json=[]).status_code == 400
    assert client.post("/api/v1/shots", json={"Serial": "", "shot": "1"}).status_code == 400
    invalid = example()
    invalid["iplen"] = "Infinity"
    assert client.post("/api/v1/shots", json=invalid).status_code == 400
    invalid["iplen"] = "1.00000000001"
    assert client.post("/api/v1/shots", json=invalid).status_code == 400
    invalid["iplen"] = "1.0"
    invalid["date"] = "not-date"
    assert client.post("/api/v1/shots", json=invalid).status_code == 400
    invalid["date"] = "2026-10-15"
    invalid["unexpected"] = "no"
    assert client.post("/api/v1/shots", json=invalid).status_code == 400
    for query in ("page=0", "page_size=1000", "page=none"):
        assert client.get("/api/v1/shots?" + query).status_code == 400
    assert client.get("/api/v1/shots/9999").status_code == 404

[executed on device: pangdeMacBook-Neo.local (958dd551-5442-478f-801a-f710221ce740)]