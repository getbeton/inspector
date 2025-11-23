"""
Utility functions for heuristics module.
"""
import yaml
from pathlib import Path
from typing import Dict, Any
from datetime import datetime, timedelta
import math


def load_scoring_config(config_path: str = None) -> Dict[str, Any]:
    """
    Load scoring rules from YAML configuration file.
    
    Args:
        config_path: Path to scoring_rules.yaml, defaults to config/scoring_rules.yaml
    
    Returns:
        Dictionary containing scoring configuration
    """
    if config_path is None:
        # Default to scoring_rules.yaml in config directory
        current_dir = Path(__file__).parent
        config_path = current_dir / "config" / "scoring_rules.yaml"
    
    with open(config_path, 'r') as f:
        config = yaml.safe_load(f)
    
    return config


def calculate_recency_decay(timestamp: datetime, config: Dict[str, Any]) -> float:
    """
    Calculate recency decay factor for a signal based on its age.
    Older signals have less weight to reflect current state.
    
    Formula: decay = exp(- age_days / decay_days * ln(2))
    This creates a half-life decay where signals lose 50% weight after decay_days.
    
    Args:
        timestamp: When the signal was detected
        config: Scoring configuration with recency_decay_days
    
    Returns:
        Decay multiplier between 0.0 and 1.0
    """
    age_days = (datetime.utcnow() - timestamp).days
    decay_days = config['scoring']['recency_decay_days']
    
    # Half-life exponential decay
    decay = math.exp(- age_days / decay_days * math.log(2))
    
    return max(0.0, min(1.0, decay))  # Clamp between 0 and 1


def calculate_fit_multiplier(fit_score: float, config: Dict[str, Any]) -> float:
    """
    Convert ICP fit score (0-1) to scoring multiplier.
    
    Args:
        fit_score: Account fit score from 0.0 to 1.0
        config: Scoring configuration with fit_multipliers
    
    Returns:
        Multiplier to apply to signal scores
    """
    multipliers = config['fit_multipliers']
    
    if fit_score >= 0.8:
        return multipliers['icp_match']
    elif fit_score >= 0.5:
        return multipliers['near_icp']
    else:
        return multipliers['poor_fit']


def clamp_score(score: float, config: Dict[str, Any]) -> float:
    """
    Clamp score to configured min/max range.
    
    Args:
        score: Raw calculated score
        config: Scoring configuration with scale_min/scale_max
    
    Returns:
        Clamped score within bounds
    """
    min_score = config['scoring']['scale_min']
    max_score = config['scoring']['scale_max']
    
    return max(min_score, min(max_score, score))


def normalize_score(raw_score: float, config: Dict[str, Any]) -> float:
    """
    Normalize a raw score to the configured scale (default 0-100).
    
    Args:
        raw_score: Raw aggregated score (can be negative due to churn signals)
        config: Scoring configuration
    
    Returns:
        Normalized score in scale_min to scale_max range
    """
    scale_max = config['scoring']['scale_max']
    scale_min = config['scoring']['scale_min']
    
    # Map raw score to scale
    # Assume raw scores typically range from -100 to +100
    # Map 0 to middle of scale, positive scores above, negative below
    mid_point = (scale_max + scale_min) / 2
    scale_range = scale_max - scale_min
    
    # Sigmoid-like normalization to map (-inf, +inf) to (scale_min, scale_max)
    # Using tanh for smooth clamping
    normalized = mid_point + (scale_range / 2) * math.tanh(raw_score / 100)
    
    return clamp_score(normalized, config)


def matches_title_pattern(title: str, patterns: list) -> bool:
    """
    Check if a user title matches any of the given patterns.
   
    Args:
        title: User's job title
        patterns: List of pattern strings to match
    
    Returns:
        True if title matches any pattern (case-insensitive)
    """
    if not title:
        return False
    
    title_lower = title.lower()
    for pattern in patterns:
        if pattern.lower() in title_lower:
            return True
    
    return False


def calculate_percentage_change(old_value: float, new_value: float) -> float:
    """
    Calculate percentage change between two values.
    
    Args:
        old_value: Previous value
        new_value: Current value
    
    Returns:
        Percentage change as decimal (e.g., 0.25 = 25% increase)
    """
    if old_value == 0:
        return 1.0 if new_value > 0 else 0.0
    
    return (new_value - old_value) / old_value


def is_director_level(title: str) -> bool:
    """
    Check if a title indicates director level or above.
    
    Args:
        title: User's job title
    
    Returns:
        True if title is director-level or above
    """
    director_patterns = [
        "director", "vp", "vice president", "head of",
        "chief", "c-level", "cto", "ceo", "cfo", "coo", "cmo",
        "svp", "senior vice president", "evp", "executive vp"
    ]
    return matches_title_pattern(title, director_patterns)
