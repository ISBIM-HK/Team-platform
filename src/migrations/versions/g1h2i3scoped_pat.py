"""Add scopes, agent_name, description to personal_access_tokens.

Revision ID: g1h2i3scoped_pat
Revises: f2a3b4members
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import ARRAY

revision = "g1h2i3scoped_pat"
down_revision = "f2a3b4members"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "personal_access_tokens",
        sa.Column("scopes", ARRAY(sa.String), nullable=False, server_default="{*}"),
    )
    op.add_column(
        "personal_access_tokens",
        sa.Column("agent_name", sa.String(100), nullable=True),
    )
    op.add_column(
        "personal_access_tokens",
        sa.Column("description", sa.String(500), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("personal_access_tokens", "description")
    op.drop_column("personal_access_tokens", "agent_name")
    op.drop_column("personal_access_tokens", "scopes")
