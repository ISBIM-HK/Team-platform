"""add projects + tasks.project_id (backfill per-tenant Inbox)

Revision ID: c1a2b3projects
Revises: b641cb761765
Create Date: 2026-05-28

"""
import uuid
from datetime import datetime, timezone
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "c1a2b3projects"
down_revision: Union[str, Sequence[str], None] = "b641cb761765"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

INBOX_NAME = "未分类"


def upgrade() -> None:
    # 1. projects 表(status 用 VARCHAR,不用 PG 原生枚举)
    op.create_table(
        "projects",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("tenant_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.String(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("created_by", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"]),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_projects_tenant_id"), "projects", ["tenant_id"], unique=False)

    # 2. tasks.project_id 先可空
    op.add_column("tasks", sa.Column("project_id", sa.Uuid(), nullable=True))

    # 3. 每租户建一个"未分类"项目,回填该租户所有任务
    conn = op.get_bind()
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    tenants = conn.execute(sa.text("SELECT id FROM tenants")).fetchall()
    for (tid,) in tenants:
        pid = str(uuid.uuid4())
        conn.execute(
            sa.text(
                "INSERT INTO projects (id, tenant_id, name, description, status, created_by, created_at) "
                "VALUES (CAST(:id AS uuid), CAST(:tid AS uuid), :name, '', 'active', NULL, :now)"
            ),
            {"id": pid, "tid": str(tid), "name": INBOX_NAME, "now": now},
        )
        conn.execute(
            sa.text(
                "UPDATE tasks SET project_id = CAST(:pid AS uuid) "
                "WHERE tenant_id = CAST(:tid AS uuid) AND project_id IS NULL"
            ),
            {"pid": pid, "tid": str(tid)},
        )

    # 4. 置非空 + 外键 + 索引
    op.alter_column("tasks", "project_id", existing_type=sa.Uuid(), nullable=False)
    op.create_foreign_key("fk_tasks_project_id", "tasks", "projects", ["project_id"], ["id"])
    op.create_index(op.f("ix_tasks_project_id"), "tasks", ["project_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_tasks_project_id"), table_name="tasks")
    op.drop_constraint("fk_tasks_project_id", "tasks", type_="foreignkey")
    op.drop_column("tasks", "project_id")
    op.drop_index(op.f("ix_projects_tenant_id"), table_name="projects")
    op.drop_table("projects")
