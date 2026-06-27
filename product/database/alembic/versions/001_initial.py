"""Initial product schema."""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "001_initial"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "investigations",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("attack_surface_score", sa.Integer(), nullable=False),
        sa.Column("attack_surface_classification", sa.String(32), nullable=False),
        sa.Column("path_count", sa.Integer(), nullable=False),
        sa.Column("critical_count", sa.Integer(), nullable=False),
        sa.Column("raw_report_path", sa.Text(), nullable=False),
    )
    op.create_table(
        "attack_paths",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("investigation_id", sa.String(36), sa.ForeignKey("investigations.id"), nullable=False),
        sa.Column("stable_id", sa.String(64), nullable=False),
        sa.Column("engine_path_id", sa.String(32), nullable=False),
        sa.Column("confidence", sa.Integer(), nullable=False),
        sa.Column("risk", sa.Float(), nullable=False),
        sa.Column("category", sa.String(64), nullable=False),
        sa.Column("mitre", sa.Text(), nullable=False),
        sa.Column("story", sa.Text(), nullable=False),
        sa.Column("proof", sa.Text(), nullable=False),
    )
    op.create_table(
        "graph_nodes",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("investigation_id", sa.String(36), sa.ForeignKey("investigations.id"), nullable=False),
        sa.Column("node_id", sa.String(512), nullable=False),
        sa.Column("node_type", sa.String(64), nullable=False),
        sa.Column("data", sa.Text(), nullable=False),
    )
    op.create_table(
        "graph_edges",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("investigation_id", sa.String(36), sa.ForeignKey("investigations.id"), nullable=False),
        sa.Column("source", sa.String(512), nullable=False),
        sa.Column("target", sa.String(512), nullable=False),
        sa.Column("data", sa.Text(), nullable=False),
    )
    op.create_table(
        "findings",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("investigation_id", sa.String(36), sa.ForeignKey("investigations.id"), nullable=False),
        sa.Column("finding_id", sa.String(128), nullable=False),
        sa.Column("severity", sa.String(32), nullable=False),
        sa.Column("classification", sa.String(64), nullable=False),
        sa.Column("data", sa.Text(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("findings")
    op.drop_table("graph_edges")
    op.drop_table("graph_nodes")
    op.drop_table("attack_paths")
    op.drop_table("investigations")
