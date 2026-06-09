"""Notifications inbox (附录 I.3): claim notifies leads; assign notifies target; owner-only."""

import uuid

from sqlalchemy import select

from src.models.ai_suggestion import AISuggestion
from src.models.common import NotificationKind, SuggestionStatus, SuggestionType
from src.models.notification import Notification
from src.models.project_member import ProjectMember
from src.models.task import Task
from src.models.user import User


async def _alice(session) -> User:
    return (await session.execute(select(User).where(User.email == "alice@example.com"))).scalar_one()


async def _project(client, name="P"):
    return (await client.post("/api/v1/projects", json={"name": name, "description": ""})).json()["id"]


async def _unclaimed_task(session, user, project_id) -> Task:
    t = Task(
        tenant_id=user.tenant_id,
        project_id=uuid.UUID(project_id),
        title="活儿",
        created_by="user:seed",
        owner_user_id=None,
    )
    session.add(t)
    await session.flush()
    return t


async def test_claim_notifies_other_leads(auth_client, session):
    """Claiming a task notifies project leads (excluding the claimer)."""
    user = await _alice(session)
    pid = await _project(auth_client)

    # Add a second lead who should receive the notification
    bob = User(tenant_id=user.tenant_id, email="bob-lead@example.com", display_name="Bob Lead")
    session.add(bob)
    await session.flush()
    session.add(ProjectMember(tenant_id=user.tenant_id, project_id=uuid.UUID(pid), user_id=bob.id, role="lead"))
    await session.flush()

    t = await _unclaimed_task(session, user, pid)
    r = await auth_client.post(f"/api/v1/tasks/{t.id}/claim")
    assert r.status_code == 200, r.text

    # Bob (the other lead) should have the notification, not Alice (the claimer)
    bobs_notifs = (
        (
            await session.execute(
                select(Notification).where(
                    Notification.recipient_user_id == bob.id,
                    Notification.kind == NotificationKind.task_claimed,
                )
            )
        )
        .scalars()
        .all()
    )
    assert len(bobs_notifs) >= 1

    # Alice (claimer) should NOT have a task_claimed notification for herself
    inbox = (await auth_client.get("/api/v1/me/notifications")).json()
    assert not any(n["kind"] == "task_claimed" for n in inbox["items"])


async def test_assign_accept_notifies_target(auth_client, session):
    user = await _alice(session)
    pid = await _project(auth_client)
    t = await _unclaimed_task(session, user, pid)
    sug = AISuggestion(
        tenant_id=user.tenant_id,
        suggestion_type=SuggestionType.assign,
        target_user_id=user.id,
        target_ref={"task_id": str(t.id)},
        rationale="负载最低",
        confidence=0.9,
        status=SuggestionStatus.pending,
    )
    session.add(sug)
    await session.flush()

    r = await auth_client.post(f"/api/v1/suggestions/{sug.id}/accept")
    assert r.status_code == 200, r.text

    inbox = (await auth_client.get("/api/v1/me/notifications")).json()
    assert any(n["kind"] == "task_assigned" for n in inbox["items"])


async def test_notifications_are_owner_only(auth_client, session):
    user = await _alice(session)
    other = User(tenant_id=user.tenant_id, email="bob@example.com", display_name="Bob")
    session.add(other)
    await session.flush()
    session.add(
        Notification(
            tenant_id=user.tenant_id,
            recipient_user_id=other.id,
            kind=NotificationKind.system,
            title="别人的",
        )
    )
    await session.flush()
    inbox = (await auth_client.get("/api/v1/me/notifications")).json()
    assert all(n["title"] != "别人的" for n in inbox["items"])


async def test_mark_read_drops_unread_count(auth_client, session):
    """Create a direct notification for Alice, then mark it read."""
    user = await _alice(session)
    session.add(
        Notification(
            tenant_id=user.tenant_id,
            recipient_user_id=user.id,
            kind=NotificationKind.system,
            title="测试通知",
        )
    )
    await session.flush()
    await session.commit()

    inbox = (await auth_client.get("/api/v1/me/notifications")).json()
    assert len(inbox["items"]) >= 1
    nid = inbox["items"][0]["id"]
    assert (await auth_client.post(f"/api/v1/me/notifications/{nid}/read")).status_code == 200

    count = (await auth_client.get("/api/v1/me/notifications/unread-count")).json()
    assert count["unread"] == 0
