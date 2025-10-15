"""add manual_data table

Revision ID: 133312c6ac74
Revises: df679d6d0ee7
Create Date: 2025-10-15 23:06:13.555602

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '133312c6ac74'
down_revision: Union[str, None] = 'df679d6d0ee7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'manual_data',
        sa.Column('account_id', sa.String(), nullable=False),
        sa.Column('rent_roll', sa.Numeric(precision=18, scale=2), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_by', sa.String(), nullable=True),
        sa.ForeignKeyConstraint(['account_id'], ['accounts.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('account_id')
    )
    op.create_index(op.f('ix_manual_data_updated_at'), 'manual_data', ['updated_at'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_manual_data_updated_at'), table_name='manual_data')
    op.drop_table('manual_data')
