"""Integration smoke test against a disposable real PostgreSQL instance."""
import os

from gyrotron import create_app
from gyrotron.models import Shot


def main():
    url = os.environ.get("DATABASE_URL", "")
    assert url.startswith("postgresql+psycopg://"), "Set a PostgreSQL DATABASE_URL"
    app = create_app({"TESTING": True})
    client = app.test_client()
    result = client.post(
        "/admin/shots/new/",
        data={
            "Serial": "POSTGRES-CI-001",
            "shot": "123456789012",
            "date": "2026-10-15",
            "Uc": "80.125",
            "custom_parameters-0-name": "It",
            "custom_parameters-0-description": "钛泵电流",
            "custom_parameters-0-unit": "mA",
            "custom_parameters-0-data_type": "DECIMAL",
            "custom_parameters-0-value": "2.50",
        },
    )
    assert result.status_code == 302, result.get_data(as_text=True)[:600]

    another_app = create_app({"TESTING": True})
    with another_app.app_context():
        session = another_app.extensions["gyrotron_session"]
        records = session.query(Shot).filter_by(Serial="POSTGRES-CI-001").all()
        assert len(records) == 1
        record = records[0]
        assert record.shot == 123456789012
        assert str(record.Uc) == "80.1250000000"
        assert [(p.name, p.unit, p.value) for p in record.custom_parameters] == [
            ("It", "mA", "2.50")
        ]

    with another_app.app_context():
        row_id = another_app.extensions["gyrotron_session"].query(Shot).one().id
    page = another_app.test_client().get(f"/admin/shots/edit/?id={row_id}")
    assert page.status_code == 200
    assert b"custom_parameters-0-name" in page.data
    print("PostgreSQL: create, persistence across factories, historic form OK.")


if __name__ == "__main__":
    main()
