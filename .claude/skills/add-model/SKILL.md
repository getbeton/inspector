---
name: add-model
description: Create a new SQLAlchemy model with Alembic migration. Use when adding a new database table or entity.
---

# /add-model - Add New Database Model

Use this skill to add a new SQLAlchemy model and create the corresponding Alembic migration.

## Workflow

### Step 1: Define the model

Add to `backend/app/models.py`:

```python
class <ModelName>(Base):
    """
    <Description of what this model represents>.

    Relationships:
    - <List related models>
    """
    __tablename__ = "<table_name>"

    # Primary key
    id = Column(Integer, primary_key=True, index=True)

    # Foreign keys (for multi-tenancy)
    workspace_id = Column(Integer, ForeignKey("workspaces.id"), nullable=False, index=True)

    # Core fields
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    status = Column(String(50), default="active")

    # JSON fields (for flexible data)
    metadata_json = Column(JSON, default=dict)

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    workspace = relationship("Workspace", back_populates="<table_name>")

    def __repr__(self):
        return f"<<ModelName> {self.id}: {self.name}>"
```

### Step 2: Add relationship to parent model

If adding a relationship to an existing model (e.g., Workspace), update that model:

```python
class Workspace(Base):
    # ... existing fields ...

    # Add relationship
    <table_name> = relationship("<ModelName>", back_populates="workspace")
```

### Step 3: Create the migration

```bash
docker-compose exec backend alembic revision --autogenerate -m "add <model_name> table"
```

### Step 4: Review the migration

Check `backend/alembic/versions/<timestamp>_add_<model_name>_table.py`:

```python
"""add <model_name> table

Revision ID: <revision_id>
Revises: <previous_revision>
Create Date: <date>
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers
revision = '<revision_id>'
down_revision = '<previous_revision>'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        '<table_name>',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('workspace_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        # ... other columns ...
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['workspace_id'], ['workspaces.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_<table_name>_id'), '<table_name>', ['id'], unique=False)
    op.create_index(op.f('ix_<table_name>_workspace_id'), '<table_name>', ['workspace_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_<table_name>_workspace_id'), table_name='<table_name>')
    op.drop_index(op.f('ix_<table_name>_id'), table_name='<table_name>')
    op.drop_table('<table_name>')
```

**Review checklist**:
- [ ] All columns present
- [ ] Correct types and nullability
- [ ] Foreign keys correct
- [ ] Indexes on frequently queried columns
- [ ] `downgrade()` correctly reverses `upgrade()`

### Step 5: Apply the migration locally

```bash
docker-compose exec backend alembic upgrade head
```

### Step 6: Verify

```bash
# Check migration applied
docker-compose exec backend alembic current

# Test table exists (optional)
docker-compose exec backend python -c "
from app.models import <ModelName>
from app.database import SessionLocal
db = SessionLocal()
print(db.query(<ModelName>).count())
"
```

---

## Migration Safety Rules

1. **Always backward-compatible**: Add columns, don't drop/rename
2. **Test in staging first**: Never run untested migrations in production
3. **Atomic migrations**: Keep migrations small and focused
4. **No data migrations in schema files**: Use separate scripts for data changes

---

## Common Column Types

```python
from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, JSON, Float, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, ARRAY

# Standard types
id = Column(Integer, primary_key=True)
name = Column(String(255), nullable=False)
description = Column(Text)
is_active = Column(Boolean, default=True)
score = Column(Float)
created_at = Column(DateTime, default=datetime.utcnow)
config = Column(JSON, default=dict)

# PostgreSQL specific
uuid = Column(UUID(as_uuid=True), default=uuid.uuid4)
tags = Column(ARRAY(String))

# With constraints
email = Column(String(255), unique=True, index=True)
workspace_id = Column(Integer, ForeignKey("workspaces.id"), nullable=False)
```

---

## Relationship Patterns

```python
# One-to-Many
class Workspace(Base):
    accounts = relationship("Account", back_populates="workspace")

class Account(Base):
    workspace_id = Column(Integer, ForeignKey("workspaces.id"))
    workspace = relationship("Workspace", back_populates="accounts")

# Many-to-Many (with association table)
account_tags = Table(
    'account_tags',
    Base.metadata,
    Column('account_id', Integer, ForeignKey('accounts.id')),
    Column('tag_id', Integer, ForeignKey('tags.id'))
)

class Account(Base):
    tags = relationship("Tag", secondary=account_tags, back_populates="accounts")
```

---

## Checklist

- [ ] Added model to `backend/app/models.py`
- [ ] Added relationships to related models
- [ ] Created migration with `alembic revision --autogenerate`
- [ ] Reviewed migration file for correctness
- [ ] Applied migration locally with `alembic upgrade head`
- [ ] Committed both model and migration files
