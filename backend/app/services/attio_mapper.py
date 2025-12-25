"""
Attio Field Mapper Service.

Maps Beton Signal model fields to Attio CRM attributes.
Handles attribute auto-creation and field transformation.
"""
import logging
from datetime import datetime
from typing import Optional, List, Dict, Any
from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.models import Signal, Account, AttioFieldMapping
from app.integrations.attio_client import AttioClient, AttioAttribute

logger = logging.getLogger(__name__)


@dataclass
class BetonAttribute:
    """Definition of a Beton-managed Attio attribute."""
    api_slug: str
    title: str
    type: str
    description: str


# Standard Beton attributes to create in Attio
BETON_ATTRIBUTES = [
    BetonAttribute(
        api_slug="beton_score",
        title="Beton Score",
        type="number",
        description="Overall health/opportunity score from Beton (0-100)"
    ),
    BetonAttribute(
        api_slug="beton_signal",
        title="Beton Signal",
        type="text",
        description="Latest signal type detected by Beton"
    ),
    BetonAttribute(
        api_slug="beton_signal_value",
        title="Beton Signal Value",
        type="number",
        description="Quantitative value of the latest signal"
    ),
    BetonAttribute(
        api_slug="beton_scored_at",
        title="Beton Scored At",
        type="date",
        description="Timestamp of last Beton scoring"
    ),
    BetonAttribute(
        api_slug="beton_health_score",
        title="Beton Health Score",
        type="number",
        description="Account health score (0-100)"
    ),
    BetonAttribute(
        api_slug="beton_fit_score",
        title="Beton Fit Score",
        type="number",
        description="ICP fit score (0-100)"
    ),
    BetonAttribute(
        api_slug="beton_signal_source",
        title="Beton Signal Source",
        type="text",
        description="Source of the signal (posthog, stripe, etc.)"
    ),
    BetonAttribute(
        api_slug="beton_last_activity",
        title="Beton Last Activity",
        type="date",
        description="Last activity timestamp from Beton"
    ),
]


@dataclass
class MappedRecord:
    """A Signal/Account transformed into Attio record format."""
    matching_value: str  # Domain for matching
    values: Dict[str, Any]  # Attio attribute values
    signal_id: int
    account_id: int


class AttioFieldMapper:
    """
    Maps Beton Signal/Account fields to Attio record attributes.

    Usage:
        mapper = AttioFieldMapper(db, attio_client, object_slug="companies")

        # Ensure Beton attributes exist
        await mapper.ensure_beton_attributes()

        # Transform signals to records
        records = mapper.transform_signals(signals)
    """

    def __init__(
        self,
        db: Session,
        attio_client: AttioClient,
        object_slug: str = "companies"
    ):
        """
        Initialize field mapper.

        Args:
            db: Database session.
            attio_client: Attio API client.
            object_slug: Attio object to map to (default: "companies").
        """
        self.db = db
        self.attio_client = attio_client
        self.object_slug = object_slug
        self._attribute_cache: Dict[str, AttioAttribute] = {}

    def ensure_beton_attributes(self) -> Dict[str, AttioAttribute]:
        """
        Ensure all Beton-managed attributes exist on the Attio object.

        Creates missing attributes and stores mappings in database.

        Returns:
            Dict mapping api_slug to AttioAttribute.
        """
        required = [
            {
                "api_slug": attr.api_slug,
                "title": attr.title,
                "type": attr.type
            }
            for attr in BETON_ATTRIBUTES
        ]

        # Use Attio client to ensure attributes exist
        created_attrs = self.attio_client.ensure_attributes(
            self.object_slug,
            required
        )

        # Store mappings in database
        for api_slug, attr in created_attrs.items():
            self._store_field_mapping(api_slug, attr)

        self._attribute_cache = created_attrs
        logger.info(f"Ensured {len(created_attrs)} Beton attributes on {self.object_slug}")

        return created_attrs

    def _store_field_mapping(self, beton_field: str, attr: AttioAttribute) -> None:
        """Store field mapping in database."""
        existing = self.db.query(AttioFieldMapping).filter(
            AttioFieldMapping.attio_object_slug == self.object_slug,
            AttioFieldMapping.beton_field == beton_field
        ).first()

        if existing:
            existing.attio_attribute_id = attr.id
            existing.attio_attribute_slug = attr.slug
            existing.attio_attribute_type = attr.type
            existing.updated_at = datetime.utcnow()
        else:
            mapping = AttioFieldMapping(
                attio_object_slug=self.object_slug,
                beton_field=beton_field,
                attio_attribute_id=attr.id,
                attio_attribute_slug=attr.slug,
                attio_attribute_type=attr.type,
                is_auto_created=True,
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow()
            )
            self.db.add(mapping)

        self.db.commit()

    def get_field_mappings(self) -> List[AttioFieldMapping]:
        """Get all field mappings for the current object."""
        return self.db.query(AttioFieldMapping).filter(
            AttioFieldMapping.attio_object_slug == self.object_slug
        ).all()

    def transform_signal(
        self,
        signal: Signal,
        account: Optional[Account] = None
    ) -> Optional[MappedRecord]:
        """
        Transform a single Signal (with Account) to Attio record format.

        Args:
            signal: The Signal model instance.
            account: Optional Account (will be loaded if not provided).

        Returns:
            MappedRecord or None if no matching value (domain).
        """
        # Load account if not provided
        if account is None:
            account = signal.account

        if not account:
            logger.warning(f"Signal {signal.id} has no associated account")
            return None

        # Domain is required for matching
        if not account.domain:
            logger.warning(f"Account {account.id} has no domain, skipping")
            return None

        # Build Attio record values
        values = {
            # Primary matching field
            "domains": [account.domain],

            # Beton-managed fields
            "beton_signal": signal.type,
            "beton_signal_value": signal.value if signal.value else 0,
            "beton_signal_source": signal.source or "unknown",
            "beton_scored_at": signal.timestamp.isoformat() if signal.timestamp else None,

            # Account-level fields
            "beton_health_score": account.health_score * 100 if account.health_score else 0,
            "beton_fit_score": account.fit_score * 100 if account.fit_score else 0,
        }

        # Calculate composite Beton score (health + fit weighted)
        health = account.health_score or 0
        fit = account.fit_score or 0
        beton_score = (health * 0.6 + fit * 0.4) * 100
        values["beton_score"] = round(beton_score, 1)

        # Add last activity if available
        if account.last_activity_at:
            values["beton_last_activity"] = account.last_activity_at.isoformat()

        # Add account name if available
        if account.name:
            values["name"] = account.name

        # Clean None values
        values = {k: v for k, v in values.items() if v is not None}

        return MappedRecord(
            matching_value=account.domain,
            values=values,
            signal_id=signal.id,
            account_id=account.id
        )

    def transform_signals(
        self,
        signals: List[Signal],
        include_accounts: bool = True
    ) -> List[MappedRecord]:
        """
        Transform multiple signals to Attio records.

        Args:
            signals: List of Signal model instances.
            include_accounts: Whether to load and include account data.

        Returns:
            List of MappedRecords ready for Attio upsert.
        """
        records = []

        for signal in signals:
            record = self.transform_signal(signal)
            if record:
                records.append(record)

        logger.info(f"Transformed {len(records)} signals out of {len(signals)} total")
        return records

    def transform_account(self, account: Account) -> Optional[MappedRecord]:
        """
        Transform an Account to Attio record format (without signal data).

        Useful for syncing account-level metrics without specific signals.

        Args:
            account: The Account model instance.

        Returns:
            MappedRecord or None if no matching value.
        """
        if not account.domain:
            logger.warning(f"Account {account.id} has no domain, skipping")
            return None

        # Build Attio record values
        values = {
            "domains": [account.domain],
            "beton_health_score": account.health_score * 100 if account.health_score else 0,
            "beton_fit_score": account.fit_score * 100 if account.fit_score else 0,
            "beton_scored_at": datetime.utcnow().isoformat(),
        }

        # Calculate composite score
        health = account.health_score or 0
        fit = account.fit_score or 0
        beton_score = (health * 0.6 + fit * 0.4) * 100
        values["beton_score"] = round(beton_score, 1)

        # Add optional fields
        if account.name:
            values["name"] = account.name

        if account.last_activity_at:
            values["beton_last_activity"] = account.last_activity_at.isoformat()

        return MappedRecord(
            matching_value=account.domain,
            values=values,
            signal_id=0,  # No signal
            account_id=account.id
        )

    def get_required_attributes_spec(self) -> List[Dict[str, Any]]:
        """Get the specification of required Beton attributes."""
        return [
            {
                "api_slug": attr.api_slug,
                "title": attr.title,
                "type": attr.type,
                "description": attr.description
            }
            for attr in BETON_ATTRIBUTES
        ]
