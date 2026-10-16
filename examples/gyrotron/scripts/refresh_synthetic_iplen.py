"""Refresh only explicitly labelled synthetic pulse widths; never real experiment rows.

All values are 1..1500 seconds converted to the iplen storage unit of milliseconds.
Dry run by default. Execute from the project root with --apply after backing up DB.
"""

from __future__ import annotations

import argparse
import random
from decimal import Decimal

from gyrotron import create_app
from gyrotron.models import Shot

PREFIX = "TEST-SYNTH-GYRO-"
MARKER = "【模拟测试数据】"
SEED = 20261016
LOW_MS = Decimal(1000)
HIGH_MS = Decimal(1500000)


def synthetic_pulse_ms(serial: str, shot: int) -> Decimal:
    """Return stable random pulse width in milliseconds for this synthetic shot."""
    rng = random.Random(f"{SEED}:{serial}:{shot}")
    seconds = Decimal(f"{rng.uniform(1, 1500):.3f}")
    return seconds * 1000


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="Write validated changes")
    arguments = parser.parse_args()

    app = create_app()
    with app.app_context():
        db = app.extensions["gyrotron_session"]
        records = (
            db.query(Shot)
            .filter(Shot.Serial.startswith(PREFIX))
            .order_by(Shot.Serial, Shot.shot)
            .all()
        )
        if len(records) < 2:
            raise SystemExit("REFUSING: at least two explicitly synthetic rows required")
        for record in records:
            if not record.remark or MARKER not in record.remark:
                raise SystemExit(
                    f"REFUSING: synthetic prefix without test-only remark, id={record.id}"
                )

        widths = [synthetic_pulse_ms(row.Serial, row.shot) for row in records]
        # Include exact endpoints so chart covers 1 through 1500 seconds.
        widths[0], widths[-1] = LOW_MS, HIGH_MS
        assert all(LOW_MS <= value <= HIGH_MS for value in widths)
        print(
            f"SYNTHETIC_ROWS={len(records)} RANGE_MS={min(widths)}..{max(widths)} "
            f"MODE={'APPLY' if arguments.apply else 'DRY_RUN'}",
            flush=True,
        )
        if not arguments.apply:
            print("No rows updated. Pass --apply to change synthetic pulses.")
            return

        for row, width in zip(records, widths, strict=True):
            row.iplen = width
        db.commit()
        print(
            f"UPDATED_ONLY_SYNTHETIC={len(records)} OTHER_FIELDS_UNCHANGED=YES",
            flush=True,
        )


if __name__ == "__main__":
    main()
