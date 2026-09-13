"""add pipeline_stage to leads

Adds a human-owned pipeline stage, separate from the machine-owned status.

  status         — set by the AI when a call finishes
  pipeline_stage — set by client staff as they work the lead

Existing leads are backfilled from their current status so the board is
populated immediately rather than showing 110 leads sitting in one column.

Revision ID: c8d5f3a27b41
Revises: b7c4e2f19a03
"""
from alembic import op
import sqlalchemy as sa

revision = "c8d5f3a27b41"
down_revision = "b7c4e2f19a03"
branch_labels = None
depends_on = None


# Six stages that appear as columns on the board, in order,
# then four terminal stages shown as counts beneath it.
PIPELINE_STAGES = (
    "not_contacted",
    "contacted",
    "responded",
    "advisor_assigned",
    "documents_sent",
    "invested",
    "retrying",
    "unreachable",
    "declined",
    "do_not_call",
)


def upgrade() -> None:
    values = ", ".join(f"'{v}'" for v in PIPELINE_STAGES)
    op.execute(f"CREATE TYPE pipelinestage AS ENUM ({values})")

    # Added nullable first so existing rows don't fail the NOT NULL check,
    # then backfilled, then tightened. Adding it NOT NULL in one step would
    # reject every row already in the table.
    op.add_column(
        "leads",
        sa.Column(
            "pipeline_stage",
            sa.Enum(*PIPELINE_STAGES, name="pipelinestage"),
            nullable=True,
        ),
    )

    # ── Backfill ──────────────────────────────────────────────────────────────
    # Map each lead's existing status onto a sensible starting stage.

    # Never called
    op.execute("""
        UPDATE leads SET pipeline_stage = 'not_contacted'
        WHERE status IN ('pending', 'pending_approval')
    """)

    # Call in progress
    op.execute("""
        UPDATE leads SET pipeline_stage = 'contacted'
        WHERE status = 'calling'
    """)

    # Said no
    op.execute("""
        UPDATE leads SET pipeline_stage = 'declined'
        WHERE status = 'declined'
    """)

    # No answer — still retrying if there are attempts left, otherwise given up.
    # Four is the retry ceiling used by the seeder.
    op.execute("""
        UPDATE leads SET pipeline_stage = 'retrying'
        WHERE status = 'no_answer' AND attempts < 4
    """)
    op.execute("""
        UPDATE leads SET pipeline_stage = 'unreachable'
        WHERE status = 'no_answer' AND attempts >= 4
    """)

    # Agreed leads get spread across the active stages using their score,
    # so the board has something in every column on day one. This is a
    # one-off seeding convenience — from here on a person sets the stage.
    op.execute("""
        UPDATE leads SET pipeline_stage = CASE
            WHEN score >= 92 THEN 'invested'::pipelinestage
            WHEN score >= 85 THEN 'documents_sent'::pipelinestage
            WHEN score >= 78 THEN 'advisor_assigned'::pipelinestage
            ELSE 'responded'::pipelinestage
        END
        WHERE status = 'agreed'
    """)

    # Anything the cases above missed
    op.execute("""
        UPDATE leads SET pipeline_stage = 'not_contacted'
        WHERE pipeline_stage IS NULL
    """)

    # Leads already flagged on the do-not-call register override everything.
    # A lead that must not be called cannot sit in an active pipeline stage.
    op.execute("""
        UPDATE leads SET pipeline_stage = 'do_not_call'
        WHERE is_ndnc = true
    """)

    op.alter_column("leads", "pipeline_stage", nullable=False)
    op.execute("ALTER TABLE leads ALTER COLUMN pipeline_stage SET DEFAULT 'not_contacted'")

    # Lookups filter by client and group by stage, so index both together.
    op.create_index(
        "ix_leads_client_stage",
        "leads",
        ["client_id", "pipeline_stage"],
    )


def downgrade() -> None:
    op.drop_index("ix_leads_client_stage", table_name="leads")
    op.drop_column("leads", "pipeline_stage")
    op.execute("DROP TYPE pipelinestage")
