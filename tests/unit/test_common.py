"""UUID v7 generation (pure logic, no DB)."""

import time

from src.models.common import new_uuid


def test_uuid_is_version_7():
    assert new_uuid().version == 7


def test_uuids_are_time_sortable():
    a = new_uuid()
    time.sleep(0.005)
    b = new_uuid()
    assert str(a) < str(b)  # v7 is time-ordered


def test_uuids_are_unique():
    assert len({new_uuid() for _ in range(1000)}) == 1000
