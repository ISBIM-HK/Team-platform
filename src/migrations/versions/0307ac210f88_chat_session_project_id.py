"""chat_session_project_id

Revision ID: 0307ac210f88
Revises: 276b2f20b5fb
Create Date: 2026-06-04 14:31:36.315738

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0307ac210f88'
down_revision: Union[str, Sequence[str], None] = '276b2f20b5fb'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('chat_sessions', sa.Column('project_id', sa.Uuid(), nullable=True))
    op.create_index(op.f('ix_chat_sessions_project_id'), 'chat_sessions', ['project_id'], unique=False)
    op.create_foreign_key('fk_chat_sessions_project_id', 'chat_sessions', 'projects', ['project_id'], ['id'])


def downgrade() -> None:
    op.drop_constraint('fk_chat_sessions_project_id', 'chat_sessions', type_='foreignkey')
    op.drop_index(op.f('ix_chat_sessions_project_id'), table_name='chat_sessions')
    op.drop_column('chat_sessions', 'project_id')
