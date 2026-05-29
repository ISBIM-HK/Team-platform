"""project_members + ACL backfill (附录 K)

Revision ID: f2a3b4members
Revises: e1f2a3admin
Create Date: 2026-05-29

Creates the project_members table and backfills membership so the ACL cutover
doesn't hide existing projects from the people who already use them:
  1. every project's created_by → lead + member
  2. every task's owner_user_id → member of that task's project
  3. legacy tenant-level Inbox (created_by IS NULL, name='未分类') → all tenant users

Table create + backfill ship together (附录 K §10): the moment the ACL filter
goes live, anyone not backfilled would lose sight of their own projects.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "f2a3b4members"
down_revision: Union[str, Sequence[str], None] = "e1f2a3admin"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "project_members",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("tenant_id", sa.Uuid(), nullable=False),
        sa.Column("project_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("role", sa.String(length=20), nullable=False, server_default="member"),
        sa.Column("added_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"]),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("project_id", "user_id", name="uq_project_member"),
    )
    op.create_index(op.f("ix_project_members_tenant_id"), "project_members", ["tenant_id"])
    op.create_index(op.f("ix_project_members_project_id"), "project_members", ["project_id"])
    op.create_index(op.f("ix_project_members_user_id"), "project_members", ["user_id"])

    # 1. creators → lead + member
    op.execute(
        """
        INSERT INTO project_members (id, tenant_id, project_id, user_id, role, added_at)
        SELECT gen_random_uuid(), p.tenant_id, p.id, p.created_by, 'lead', now()
        FROM projects p
        WHERE p.created_by IS NOT NULL
        ON CONFLICT (project_id, user_id) DO NOTHING
        """
    )
    # 2. task owners → member of that project (skip if already lead via ON CONFLICT)
    op.execute(
        """
        INSERT INTO project_members (id, tenant_id, project_id, user_id, role, added_at)
        SELECT gen_random_uuid(), x.tenant_id, x.project_id, x.owner_user_id, 'member', now()
        FROM (
            SELECT DISTINCT tenant_id, project_id, owner_user_id
            FROM tasks WHERE owner_user_id IS NOT NULL
        ) x
        ON CONFLICT (project_id, user_id) DO NOTHING
        """
    )
    # 3. legacy shared Inbox → all tenant users (transition; new Inboxes are per-user)
    op.execute(
        """
        INSERT INTO project_members (id, tenant_id, project_id, user_id, role, added_at)
        SELECT gen_random_uuid(), p.tenant_id, p.id, u.id, 'member', now()
        FROM projects p
        JOIN users u ON u.tenant_id = p.tenant_id
        WHERE p.name = '未分类' AND p.created_by IS NULL
        ON CONFLICT (project_id, user_id) DO NOTHING
        """
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_project_members_user_id"), table_name="project_members")
    op.drop_index(op.f("ix_project_members_project_id"), table_name="project_members")
    op.drop_index(op.f("ix_project_members_tenant_id"), table_name="project_members")
    op.drop_table("project_members")
