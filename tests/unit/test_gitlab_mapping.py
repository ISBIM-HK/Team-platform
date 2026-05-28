"""GitLab event → EventType mapping + timestamp parse (pure, no network)."""

from datetime import datetime

from src.capture.gitlab import map_event_type, parse_occurred_at
from src.models.common import EventType


def test_push_maps_to_commit():
    assert map_event_type({"action_name": "pushed to", "push_data": {"commit_count": 2}}) == EventType.commit


def test_mr_opened():
    assert map_event_type({"action_name": "opened", "target_type": "MergeRequest"}) == EventType.pr_opened


def test_mr_comment_is_review():
    assert map_event_type({"action_name": "commented on", "target_type": "MergeRequest"}) == EventType.pr_reviewed


def test_generic_comment_is_message():
    assert map_event_type({"action_name": "commented on", "target_type": "Issue"}) == EventType.message


def test_unknown_defaults_to_message():
    assert map_event_type({"action_name": "joined"}) == EventType.message


def test_parse_iso_z_to_naive_utc():
    dt = parse_occurred_at({"created_at": "2026-05-28T09:00:00.000Z"})
    assert dt == datetime(2026, 5, 28, 9, 0, 0)
    assert dt.tzinfo is None
