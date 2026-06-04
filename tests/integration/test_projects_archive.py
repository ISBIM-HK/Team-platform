"""Project archive — soft delete + restore (2026-06-03)."""

import uuid

from sqlalchemy import func, select

from src.models.ai_suggestion import AISuggestion
from src.models.audit_log import AuditLog
from src.models.common import EventSource, EventType, ReportKind, SuggestionType, utcnow
from src.models.event_cache import EventCache
from src.models.project import Project
from src.models.report import Report
from src.models.task import Task, TaskHistory
from src.repositories.project_member_repo import ProjectMemberRepository
from src.repositories.project_repo import ProjectRepository
from src.repositories.user_repo import UserRepository


async def _register_login(client, email, pw="pw12345678", name="U"):
    await client.post("/api/v1/auth/register", json={"email": email, "display_name": name, "password": pw})
    r = await client.post("/api/v1/auth/login", json={"email": email, "password": pw})
    assert r.status_code == 200, r.text


async def _create_project(client, name="PX") -> str:
    r = await client.post("/api/v1/projects", json={"name": name, "description": ""})
    assert r.status_code == 201, r.text
    return r.json()["id"]


async def _create_task(client, project_id: str, title="task") -> str:
    r = await client.post("/api/v1/tasks", json={"project_id": project_id, "title": title})
    assert r.status_code == 201, r.text
    return r.json()["id"]


async def _count(session, model, cond) -> int:
    return (await session.execute(select(func.count()).select_from(model).where(cond))).scalar_one()


async def test_archive_hides_from_default_list_but_keeps_project_data_readable(client, session):
    await _register_login(client, "admin@example.com")
    user = await UserRepository(session).get_by_email("admin@example.com")
    pid = await _create_project(client, "Archive me")
    tid = await _create_task(client, pid)
    project_uuid = uuid.UUID(pid)
    task_uuid = uuid.UUID(tid)

    session.add(
        TaskHistory(
            task_id=task_uuid,
            field_name="status",
            old_value="todo",
            new_value="in_progress",
            changed_by=user.id,
        )
    )
    session.add(
        EventCache(
            tenant_id=user.tenant_id,
            project_id=project_uuid,
            source=EventSource.agent,
            event_type=EventType.manual_log,
            actor_user_id=user.id,
            external_id=f"archive-test:{pid}",
            payload={"content": "kept"},
            occurred_at=utcnow(),
        )
    )
    session.add(
        Report(
            tenant_id=user.tenant_id,
            user_id=user.id,
            project_id=project_uuid,
            kind=ReportKind.project_brief,
            report_date=user.created_at.date(),
            content={"summary": "kept"},
        )
    )
    await session.flush()

    r = await client.patch(f"/api/v1/projects/{pid}", json={"status": "archived"})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "archived"

    default_ids = {p["id"] for p in (await client.get("/api/v1/projects")).json()}
    assert pid not in default_ids
    all_projects = (await client.get("/api/v1/projects?include_archived=true")).json()
    assert any(p["id"] == pid and p["status"] == "archived" for p in all_projects)

    assert (await client.get(f"/api/v1/projects/{pid}")).status_code == 200
    tasks = (await client.get(f"/api/v1/projects/{pid}/tasks")).json()
    assert [t["id"] for t in tasks] == [tid]
    share = (await client.get(f"/api/v1/projects/{pid}/share")).json()
    assert share["project"]["id"] == pid
    assert [t["id"] for t in share["tasks"]] == [tid]
    assert await _count(session, Task, Task.project_id == project_uuid) == 1
    assert await _count(session, TaskHistory, TaskHistory.task_id == task_uuid) == 1
    assert await _count(session, EventCache, EventCache.project_id == project_uuid) == 1
    assert await _count(session, Report, Report.project_id == project_uuid) == 1


async def test_restore_shows_project_again_and_audits_lifecycle_once(client, session):
    await _register_login(client, "admin@example.com")
    user = await UserRepository(session).get_by_email("admin@example.com")
    pid = await _create_project(client, "Lifecycle")
    project_uuid = uuid.UUID(pid)

    assert (await client.patch(f"/api/v1/projects/{pid}", json={"status": "archived"})).status_code == 200
    assert (await client.patch(f"/api/v1/projects/{pid}", json={"status": "archived"})).status_code == 200
    assert (await client.patch(f"/api/v1/projects/{pid}", json={"status": "active"})).status_code == 200

    default_ids = {p["id"] for p in (await client.get("/api/v1/projects")).json()}
    assert pid in default_ids
    rows = (
        (
            await session.execute(
                select(AuditLog)
                .where(AuditLog.target_type == "project", AuditLog.target_id == project_uuid)
                .order_by(AuditLog.created_at.asc())
            )
        )
        .scalars()
        .all()
    )
    assert [r.action for r in rows] == ["project.archive", "project.restore"]
    assert [r.actor_id for r in rows] == [user.id, user.id]
    assert rows[0].tenant_id == user.tenant_id
    assert rows[0].detail == {"name": "Lifecycle"}


async def test_patch_cannot_set_deleted(client):
    await _register_login(client, "admin@example.com")
    pid = await _create_project(client, "No patch delete")
    r = await client.patch(f"/api/v1/projects/{pid}", json={"status": "deleted"})
    assert r.status_code == 422


async def test_cannot_archive_inbox_even_when_renaming_in_same_patch(client, session):
    await _register_login(client, "admin@example.com")
    user = await UserRepository(session).get_by_email("admin@example.com")
    inbox = await ProjectRepository(session).get_inbox(user.tenant_id, user.id)
    assert inbox is not None

    r = await client.patch(f"/api/v1/projects/{inbox.id}", json={"status": "archived"})
    assert r.status_code == 400
    bypass = await client.patch(f"/api/v1/projects/{inbox.id}", json={"name": "renamed", "status": "archived"})
    assert bypass.status_code == 400


async def test_archive_requires_project_lead_or_privileged_user(client, session):
    await _register_login(client, "admin@example.com")
    pid = await _create_project(client)

    await _register_login(client, "bob@example.com")
    r = await client.patch(f"/api/v1/projects/{pid}", json={"status": "archived"})
    assert r.status_code == 404

    bob = await UserRepository(session).get_by_email("bob@example.com")
    await ProjectMemberRepository(session).add(bob.tenant_id, uuid.UUID(pid), bob.id, role="member")
    await session.flush()
    r = await client.patch(f"/api/v1/projects/{pid}", json={"status": "archived"})
    assert r.status_code == 403


async def test_archived_project_suggestions_are_hidden_and_cannot_be_accepted(client, session):
    await _register_login(client, "admin@example.com")
    user = await UserRepository(session).get_by_email("admin@example.com")
    pid = await _create_project(client, "Suggested")
    tid = await _create_task(client, pid, "assignable")
    project_uuid = uuid.UUID(pid)
    task_uuid = uuid.UUID(tid)
    original_owner = (await session.get(Task, task_uuid)).owner_user_id

    decompose = AISuggestion(
        tenant_id=user.tenant_id,
        suggestion_type=SuggestionType.decompose,
        target_user_id=user.id,
        target_ref={
            "project_id": pid,
            "title": "Goal",
            "description": "",
            "priority": 1,
            "subtasks": [{"title": "Child", "description": "", "priority": 1}],
        },
        rationale="r",
        confidence=0.9,
    )
    assign = AISuggestion(
        tenant_id=user.tenant_id,
        suggestion_type=SuggestionType.assign,
        target_user_id=user.id,
        target_ref={"task_id": tid},
        rationale="r",
        confidence=0.9,
    )
    session.add_all([decompose, assign])
    await session.flush()

    assert (await client.patch(f"/api/v1/projects/{pid}", json={"status": "archived"})).status_code == 200

    listed = (await client.get("/api/v1/suggestions?status=pending")).json()["items"]
    listed_ids = {i["id"] for i in listed}
    assert str(decompose.id) not in listed_ids
    assert str(assign.id) not in listed_ids

    before_tasks = await _count(session, Task, Task.project_id == project_uuid)
    r = await client.post(f"/api/v1/suggestions/{decompose.id}/accept")
    assert r.status_code == 422
    assert await _count(session, Task, Task.project_id == project_uuid) == before_tasks

    r = await client.post(f"/api/v1/suggestions/{assign.id}/accept")
    assert r.status_code == 422
    task = await session.get(Task, task_uuid)
    assert task.owner_user_id == original_owner

    assert (await client.patch(f"/api/v1/projects/{pid}", json={"status": "active"})).status_code == 200
    r = await client.post(f"/api/v1/suggestions/{decompose.id}/accept")
    assert r.status_code == 200, r.text
    assert len(r.json()["created_tasks"]) == 2


async def test_delete_soft_hides_non_empty_project_keeps_data_and_audits(client, session):
    await _register_login(client, "admin@example.com")
    user = await UserRepository(session).get_by_email("admin@example.com")
    pid = await _create_project(client, "Delete softly")
    tid = await _create_task(client, pid)
    project_uuid = uuid.UUID(pid)
    task_uuid = uuid.UUID(tid)
    pending = AISuggestion(
        tenant_id=user.tenant_id,
        suggestion_type=SuggestionType.decompose,
        target_user_id=user.id,
        target_ref={"project_id": pid, "title": "unused", "subtasks": []},
        rationale="r",
        confidence=0.9,
    )
    session.add(pending)
    await session.flush()

    r = await client.delete(f"/api/v1/projects/{pid}")
    assert r.status_code == 204, r.text

    default_ids = {p["id"] for p in (await client.get("/api/v1/projects")).json()}
    archived_ids = {p["id"] for p in (await client.get("/api/v1/projects?include_archived=true")).json()}
    assert pid not in default_ids
    assert pid not in archived_ids
    project = await session.get(Project, project_uuid)
    assert project is not None and project.status == "deleted"
    assert await _count(session, Task, Task.id == task_uuid) == 1
    assert await _count(session, AISuggestion, AISuggestion.id == pending.id) == 1
    rows = (
        (
            await session.execute(
                select(AuditLog)
                .where(AuditLog.target_type == "project", AuditLog.target_id == project_uuid)
                .order_by(AuditLog.created_at.asc())
            )
        )
        .scalars()
        .all()
    )
    assert [row.action for row in rows] == ["project.delete"]
    assert rows[0].actor_id == user.id
    assert rows[0].tenant_id == user.tenant_id
    assert rows[0].detail == {"name": "Delete softly"}


async def test_deleted_project_can_be_manually_restored_to_active(client):
    await _register_login(client, "admin@example.com")
    pid = await _create_project(client, "Restore deleted")

    assert (await client.delete(f"/api/v1/projects/{pid}")).status_code == 204
    assert pid not in {p["id"] for p in (await client.get("/api/v1/projects")).json()}
    r = await client.patch(f"/api/v1/projects/{pid}", json={"status": "active"})
    assert r.status_code == 200, r.text
    assert pid in {p["id"] for p in (await client.get("/api/v1/projects")).json()}


async def test_deleted_project_suggestions_are_hidden_and_cannot_be_accepted(client, session):
    await _register_login(client, "admin@example.com")
    user = await UserRepository(session).get_by_email("admin@example.com")
    pid = await _create_project(client, "Deleted suggestions")
    tid = await _create_task(client, pid, "assignable")
    project_uuid = uuid.UUID(pid)
    task_uuid = uuid.UUID(tid)
    original_owner = (await session.get(Task, task_uuid)).owner_user_id

    decompose = AISuggestion(
        tenant_id=user.tenant_id,
        suggestion_type=SuggestionType.decompose,
        target_user_id=user.id,
        target_ref={
            "project_id": pid,
            "title": "Goal",
            "description": "",
            "priority": 1,
            "subtasks": [{"title": "Child", "description": "", "priority": 1}],
        },
        rationale="r",
        confidence=0.9,
    )
    assign = AISuggestion(
        tenant_id=user.tenant_id,
        suggestion_type=SuggestionType.assign,
        target_user_id=user.id,
        target_ref={"task_id": tid},
        rationale="r",
        confidence=0.9,
    )
    session.add_all([decompose, assign])
    await session.flush()

    assert (await client.delete(f"/api/v1/projects/{pid}")).status_code == 204

    listed = (await client.get("/api/v1/suggestions?status=pending")).json()["items"]
    listed_ids = {i["id"] for i in listed}
    assert str(decompose.id) not in listed_ids
    assert str(assign.id) not in listed_ids

    before_tasks = await _count(session, Task, Task.project_id == project_uuid)
    r = await client.post(f"/api/v1/suggestions/{decompose.id}/accept")
    assert r.status_code == 422
    assert await _count(session, Task, Task.project_id == project_uuid) == before_tasks

    r = await client.post(f"/api/v1/suggestions/{assign.id}/accept")
    assert r.status_code == 422
    task = await session.get(Task, task_uuid)
    assert task.owner_user_id == original_owner


async def test_delete_project_guards_inbox_and_lead_permission(client, session):
    await _register_login(client, "admin@example.com")
    user = await UserRepository(session).get_by_email("admin@example.com")
    inbox = await ProjectRepository(session).get_inbox(user.tenant_id, user.id)
    assert inbox is not None
    assert (await client.delete(f"/api/v1/projects/{inbox.id}")).status_code == 400

    pid = await _create_project(client, "Lead only")
    await _register_login(client, "bob@example.com")
    assert (await client.delete(f"/api/v1/projects/{pid}")).status_code == 404

    bob = await UserRepository(session).get_by_email("bob@example.com")
    await ProjectMemberRepository(session).add(bob.tenant_id, uuid.UUID(pid), bob.id, role="member")
    await session.flush()
    assert (await client.delete(f"/api/v1/projects/{pid}")).status_code == 403


async def test_empty_inbox_hidden_from_list_but_appears_when_non_empty(client, session):
    await _register_login(client, "admin@example.com")
    projects = (await client.get("/api/v1/projects")).json()
    assert not any(p["name"] == "未分类" for p in projects)  # empty Inbox hidden

    user = await UserRepository(session).get_by_email("admin@example.com")
    inbox = await ProjectRepository(session).ensure_inbox(user.tenant_id, user.id)
    session.add(Task(tenant_id=user.tenant_id, project_id=inbox.id, title="inbox task", created_by=f"user:{user.id}"))
    await session.flush()

    projects = (await client.get("/api/v1/projects")).json()
    inboxes = [p for p in projects if p["name"] == "未分类"]
    assert len(inboxes) == 1 and inboxes[0]["task_count"] > 0  # non-empty → visible
