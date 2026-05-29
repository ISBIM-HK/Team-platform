"""project_brief: reports.project_id + ReportKind.project_brief

Revision ID: f6a7b8brief
Revises: e5f6a7pat
Create Date: 2026-05-29

Additive only (附录 H.4 brief persistence): a new nullable FK column on reports
and a new value on the native `reportkind` enum. The enum value is added in an
autocommit block because PostgreSQL forbids using a freshly-added enum value in
the same transaction; adding it standalone keeps this migration safe to re-run.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "f6a7b8brief"
down_revision: Union[str, Sequence[str], None] = "e5f6a7pat"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE reportkind ADD VALUE IF NOT EXISTS 'project_brief'")
    op.add_column("reports", sa.Column("project_id", sa.Uuid(), nullable=True))
    op.create_foreign_key(
        "fk_reports_project_id", "reports", "projects", ["project_id"], ["id"]
    )
    op.create_index(op.f("ix_reports_project_id"), "reports", ["project_id"])


def downgrade() -> None:
    # PostgreSQL cannot drop an enum value cleanly; the 'project_brief' value is
    # left in place (harmless). Only the additive column/index are reverted.
    op.drop_index(op.f("ix_reports_project_id"), table_name="reports")
    op.drop_constraint("fk_reports_project_id", "reports", type_="foreignkey")
    op.drop_column("reports", "project_id")
