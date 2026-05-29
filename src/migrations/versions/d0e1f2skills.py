"""assistant_skills (附录 J.5 — instruction-bundle skills)

Revision ID: d0e1f2skills
Revises: c9d0e1assistant
Create Date: 2026-05-29
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "d0e1f2skills"
down_revision: Union[str, Sequence[str], None] = "c9d0e1assistant"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "assistant_skills",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("workspace_id", sa.Uuid(), nullable=False),
        sa.Column("tenant_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("description", sa.String(length=500), nullable=False, server_default=""),
        sa.Column("instruction_md", sa.String(), nullable=False, server_default=""),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["workspace_id"], ["assistant_workspaces.id"]),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_assistant_skills_workspace_id"), "assistant_skills", ["workspace_id"])
    op.create_index(op.f("ix_assistant_skills_tenant_id"), "assistant_skills", ["tenant_id"])


def downgrade() -> None:
    op.drop_index(op.f("ix_assistant_skills_tenant_id"), table_name="assistant_skills")
    op.drop_index(op.f("ix_assistant_skills_workspace_id"), table_name="assistant_skills")
    op.drop_table("assistant_skills")
