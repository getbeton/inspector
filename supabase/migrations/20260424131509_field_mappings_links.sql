-- Migration: field_mappings entity-linking support
--
-- Extends field_mappings.source_type with six new variants for linking Attio records
-- to subject-derived Persons/Companies or workspace members. Also adds optional columns
-- for the link_specific_record variant and an accounts.owner_email column so the
-- actor_account_owner variant has somewhere to read from.
--
-- Related PRD: .claude/plans/i-need-your-help-jazzy-robin.md

-- ============================================================
-- 1. Widen source_type for the new variants
-- ============================================================

-- v2 migration sized this VARCHAR(20). The longest new type
-- ("link_subject_company_via_person") is 31 chars.
ALTER TABLE field_mappings ALTER COLUMN source_type TYPE VARCHAR(50);

-- ============================================================
-- 2. Replace source_type CHECK constraint
-- ============================================================

-- The v2 migration created two anonymous CHECK constraints, which Postgres
-- auto-named field_mappings_check and field_mappings_check1. Drop those
-- alongside the named variants so this migration is idempotent regardless
-- of whether v2 was installed with named or unnamed constraints.
ALTER TABLE field_mappings DROP CONSTRAINT IF EXISTS field_mappings_check;
ALTER TABLE field_mappings DROP CONSTRAINT IF EXISTS field_mappings_check1;
ALTER TABLE field_mappings DROP CONSTRAINT IF EXISTS field_mappings_source_type_check;

ALTER TABLE field_mappings
    ADD CONSTRAINT field_mappings_source_type_check
    CHECK (source_type IN (
        -- existing
        'property',
        'formula',
        'option',
        'none',
        -- new: record-reference linking
        'link_subject_person',
        'link_subject_company_by_domain',
        'link_subject_company_via_person',
        'link_specific_record',
        -- new: actor-reference linking
        'actor_subject_email',
        'actor_account_owner'
    ));

-- ============================================================
-- 3. New columns for link_specific_record
-- ============================================================

ALTER TABLE field_mappings
    ADD COLUMN IF NOT EXISTS link_target_object VARCHAR(100),
    ADD COLUMN IF NOT EXISTS link_record_id UUID;

-- ============================================================
-- 4. Replace payload-shape CHECK
-- ============================================================

ALTER TABLE field_mappings DROP CONSTRAINT IF EXISTS field_mappings_source_shape_check;

ALTER TABLE field_mappings
    ADD CONSTRAINT field_mappings_source_shape_check
    CHECK (
        (source_type = 'property' AND source_prop IS NOT NULL AND source_prop_kind IS NOT NULL)
        OR (source_type = 'formula' AND source_formula IS NOT NULL)
        OR (source_type = 'option' AND source_option IS NOT NULL)
        OR (source_type = 'none')
        OR (source_type IN (
                'link_subject_person',
                'link_subject_company_by_domain',
                'link_subject_company_via_person',
                'actor_subject_email',
                'actor_account_owner'
            ))
        OR (source_type = 'link_specific_record'
            AND link_target_object IS NOT NULL
            AND link_record_id IS NOT NULL)
    );

COMMENT ON COLUMN field_mappings.link_target_object IS
    'For source_type=link_specific_record: the ObjectId the pinned record belongs to (deals/people/companies/workspaces).';
COMMENT ON COLUMN field_mappings.link_record_id IS
    'For source_type=link_specific_record: the destination CRM record UUID the user pinned.';

-- ============================================================
-- 5. accounts.owner_email for actor_account_owner variant
-- ============================================================

ALTER TABLE accounts
    ADD COLUMN IF NOT EXISTS owner_email TEXT;

COMMENT ON COLUMN accounts.owner_email IS
    'Email of the account owner (typically a sales rep / CSM). Used by field_mappings actor_account_owner source to stamp CRM records with the owner at sync time.';
