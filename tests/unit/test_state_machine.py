"""Task state-machine transition rules (pure logic, no DB)."""

from src.api.routes.tasks import VALID_TRANSITIONS
from src.models.common import TaskStatus


def test_todo_can_start_or_archive():
    assert VALID_TRANSITIONS[TaskStatus.todo] == {TaskStatus.in_progress, TaskStatus.archived}


def test_blocked_only_returns_to_in_progress():
    assert VALID_TRANSITIONS[TaskStatus.blocked] == {TaskStatus.in_progress}


def test_in_progress_cannot_skip_to_archived():
    # must go through review/done, not jump straight to archived
    assert TaskStatus.archived not in VALID_TRANSITIONS[TaskStatus.in_progress]


def test_review_goes_back_or_done():
    assert VALID_TRANSITIONS[TaskStatus.review] == {TaskStatus.in_progress, TaskStatus.done}


def test_archived_is_terminal():
    assert VALID_TRANSITIONS[TaskStatus.archived] == set()


def test_every_status_has_a_rule():
    for s in TaskStatus:
        assert s in VALID_TRANSITIONS
