"""
Daily signal detection cron job.

Scheduled to run daily at 6 AM UTC.
Detects all 8 signal types and stores results.
"""
import logging
import asyncio
from datetime import datetime
from typing import Optional

from app.integrations.posthog_query_client import PostHogQueryClient
from app.integrations.attio_client import AttioClient
from app.dashboards.signal_detector import SignalDetector, DetectionResult
from app.core.config_manager import ConfigManager

logger = logging.getLogger(__name__)


async def run_daily_signal_detection(
    db_session,
    config_manager: Optional[ConfigManager] = None
) -> DetectionResult:
    """
    Main entry point for daily signal detection job.

    Intended to be called by APScheduler or similar cron system.

    Args:
        db_session: Database session
        config_manager: Configuration manager instance

    Returns:
        DetectionResult with job outcome
    """
    logger.info("=" * 60)
    logger.info("STARTING DAILY SIGNAL DETECTION JOB")
    logger.info(f"Time: {datetime.utcnow().isoformat()}")
    logger.info("=" * 60)

    try:
        # Initialize clients
        posthog_client = PostHogQueryClient(db_session, config_manager)
        attio_client = AttioClient(db_session, config_manager) if config_manager else None

        # Create detector
        detector = SignalDetector(posthog_client, attio_client)

        # Run detection
        result = await detector.detect_all_signals()

        # Log results
        logger.info("-" * 60)
        logger.info(f"DETECTION COMPLETE")
        logger.info(f"Success: {result.success}")
        logger.info(f"Signals Detected: {result.signals_detected}")
        logger.info(f"High-Score Signals: {result.signals_high_score}")
        if result.errors:
            logger.info(f"Errors ({len(result.errors)}):")
            for error in result.errors:
                logger.info(f"  - {error}")
        logger.info("-" * 60)

        return result

    except Exception as e:
        logger.error(f"FATAL ERROR in signal detection job: {str(e)}", exc_info=True)
        return DetectionResult(
            success=False,
            signals_detected=0,
            signals_high_score=0,
            errors=[f"Fatal error: {str(e)}"]
        )


# TODO: Wire this up to APScheduler in main.py
#
# Example usage in FastAPI startup:
# from apscheduler.schedulers.asyncio import AsyncIOScheduler
#
# scheduler = AsyncIOScheduler()
# scheduler.add_job(
#     run_daily_signal_detection,
#     trigger="cron",
#     hour=6,  # 6 AM UTC
#     minute=0,
#     args=(db_session, config_manager),
#     name="daily_signal_detection"
# )
# scheduler.start()
