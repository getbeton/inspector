"""
Utility functions for displaying scores with concrete quality grading theme.
Beton (concrete) quality grades as a pun on the company name.
"""
from typing import Dict, Tuple


def get_concrete_grade(score: float) -> str:
    """
    Convert numerical score (0-100) to concrete quality grade.
    Uses standard concrete compressive strength grade nomenclature (M-grade).
    
    M100 = Premium grade (like M40-M50 concrete - high strength)
    M75 = Good quality (like M25-M30 concrete)
    M50 = Standard (like M15-M20 concrete)
    M25 = Below standard (like M10 concrete)
    M10 = Poor quality (low grade concrete)
    
    Args:
        score: Health score from 0-100
    
    Returns:
        Concrete grade string (e.g., "M100", "M75")
    """
    if score >= 80:
        return "M100"
    elif score >= 60:
        return "M75"
    elif score >= 40:
        return "M50"
    elif score >= 20:
        return "M25"
    else:
        return "M10"


def get_grade_label(score: float) -> str:
    """
    Get descriptive label for concrete grade.
    
    Args:
        score: Health score from 0-100
    
    Returns:
        Quality description
    """
    if score >= 80:
        return "Premium Grade"
    elif score >= 60:
        return "Good Quality"
    elif score >= 40:
        return "Standard"
    elif score >= 20:
        return "Below Standard"
    else:
        return "Poor Quality"


def get_grade_emoji(score: float) -> str:
    """
    Get emoji representing concrete grade quality.
    
    Args:
        score: Health score from 0-100
    
    Returns:
        Emoji string
    """
    if score >= 80:
        return "🏗️"  # Building construction (premium)
    elif score >= 60:
        return "✅"  # Check mark (good)
    elif score >= 40:
        return "⚠️"  # Warning (standard)
    elif score >= 20:
        return "⚡"  # Lightning (below standard)
    else:
        return "🚧"  # Construction warning (poor)


def get_grade_color(score: float) -> str:
    """
    Get color code for concrete grade display.
    
    Args:
        score: Health score from 0-100
    
    Returns:
        Hex color code
    """
    if score >= 80:
        return "#10b981"  # Green (premium)
    elif score >= 60:
        return "#3b82f6"  # Blue (good)
    elif score >= 40:
        return "#f59e0b"  # Amber (standard)
    elif score >= 20:
        return "#ef4444"  # Red (below standard)
    else:
        return "#991b1b"  # Dark red (poor)


def format_score_display(score: float, include_emoji: bool = True) -> Dict[str, str]:
    """
    Format score for display with concrete grading theme.
    
    Args:
        score: Health score from 0-100
        include_emoji: Whether to include emoji in output
    
    Returns:
        Dictionary with formatted display components
    """
    grade = get_concrete_grade(score)
    label = get_grade_label(score)
    emoji = get_grade_emoji(score) if include_emoji else ""
    color = get_grade_color(score)
    
    return {
        'score': round(score, 1),
        'grade': grade,
        'label': label,
        'emoji': emoji,
        'color': color,
        'display': f"{emoji} {grade} - {label}" if include_emoji else f"{grade} - {label}",
        'short': f"{emoji} {grade}" if include_emoji else grade
    }


def get_grade_description(score: float) -> str:
    """
    Get detailed description of what the grade means.
    
    Args:
        score: Health score from 0-100
    
    Returns:
        Description text
    """
    if score >= 80:
        return "Premium grade concrete - exceptional account health. High engagement, strong fit, expansion ready."
    elif score >= 60:
        return "Good quality concrete - healthy account. Solid engagement and potential for growth."
    elif score >= 40:
        return "Standard grade concrete - moderate health. Account is stable but could use attention."
    elif score >= 20:
        return "Below standard concrete - at risk. Account showing warning signs, needs intervention."
    else:
        return "Poor quality concrete - critical condition. High churn risk, immediate action required."


def get_all_grades() -> list:
    """
    Get list of all concrete grades with their ranges and descriptions.
    
    Returns:
        List of grade dictionaries
    """
    return [
        {
            'grade': 'M100',
            'label': 'Premium Grade',
            'min_score': 80,
            'max_score': 100,
            'emoji': '🏗️',
            'color': '#10b981',
            'description': 'Exceptional account health. High engagement, strong fit, expansion ready.'
        },
        {
            'grade': 'M75',
            'label': 'Good Quality',
            'min_score': 60,
            'max_score': 79,
            'emoji': '✅',
            'color': '#3b82f6',
            'description': 'Healthy account. Solid engagement and potential for growth.'
        },
        {
            'grade': 'M50',
            'label': 'Standard',
            'min_score': 40,
            'max_score': 59,
            'emoji': '⚠️',
            'color': '#f59e0b',
            'description': 'Moderate health. Account is stable but could use attention.'
        },
        {
            'grade': 'M25',
            'label': 'Below Standard',
            'min_score': 20,
            'max_score': 39,
            'emoji': '⚡',
            'color': '#ef4444',
            'description': 'At risk. Account showing warning signs, needs intervention.'
        },
        {
            'grade': 'M10',
            'label': 'Poor Quality',
            'min_score': 0,
            'max_score': 19,
            'emoji': '🚧',
            'color': '#991b1b',
            'description': 'Critical condition. High churn risk, immediate action required.'
        }
    ]
