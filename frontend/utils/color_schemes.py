"""
Color schemes and theming utilities.
Includes colorblind-friendly palettes inspired by Tableau.
"""

import streamlit as st


# Tableau-inspired colorblind-safe palettes
COLORBLIND_PALETTES = {
    "universal": {
        "name": "Universal (Default)",
        "description": "Works well for all types of color vision",
        "primary": ["#0173B2", "#029E73", "#D55E00", "#CC78BC", "#ECE133"],
        "sequential": ["#f7fbff", "#c6dbef", "#6baed6", "#2171b5", "#084594"],
        "diverging": ["#d73027", "#fc8d59", "#fee090", "#91bfdb", "#4575b4"],
        "success": "#029E73",
        "warning": "#ECE133",
        "error": "#D55E00",
        "info": "#0173B2",
        "neutral": "#949494"
    },
    "deuteranopia": {
        "name": "Deuteranopia-friendly",
        "description": "Optimized for red-green color blindness (most common)",
        "primary": ["#0173B2", "#DE8F05", "#CC78BC", "#CA9161", "#949494"],
        "sequential": ["#fff7ec", "#fee8c8", "#fdd49e", "#fdbb84", "#fc8d59"],
        "diverging": ["#8c510a", "#d8b365", "#f6e8c3", "#c7eae5", "#01665e"],
        "success": "#0173B2",
        "warning": "#DE8F05",
        "error": "#CC78BC",
        "info": "#0173B2",
        "neutral": "#949494"
    },
    "protanopia": {
        "name": "Protanopia-friendly",
        "description": "Optimized for red color blindness",
        "primary": ["#332288", "#88CCEE", "#44AA99", "#117733", "#DDCC77"],
        "sequential": ["#f7fcf5", "#c7e9c0", "#74c476", "#31a354", "#006d2c"],
        "diverging": ["#762a83", "#af8dc3", "#e7d4e8", "#d9f0d3", "#1b7837"],
        "success": "#117733",
        "warning": "#DDCC77",
        "error": "#332288",
        "info": "#88CCEE",
        "neutral": "#949494"
    }
}

# Theme configurations for light/dark mode
THEME_CONFIGS = {
    "light": {
        "bg": "#ffffff",
        "paper": "#fafafa",
        "text": "#111111",
        "text_secondary": "#666666",
        "grid": "#eaeaea",
        "border": "#d0d0d0",
        "card_bg": "#f8f9fa"
    },
    "dark": {
        "bg": "#1a1a2e",
        "paper": "#16213e",
        "text": "#eaeaea",
        "text_secondary": "#a0a0a0",
        "grid": "#2d2d44",
        "border": "#3d3d5c",
        "card_bg": "#1f2937"
    }
}


def get_color_palette(palette_name: str = None) -> dict:
    """
    Get the current color palette.

    Args:
        palette_name: Override palette name, or use session state

    Returns:
        Palette configuration dict
    """
    name = palette_name or st.session_state.get("color_palette", "universal")
    return COLORBLIND_PALETTES.get(name, COLORBLIND_PALETTES["universal"])


def get_theme() -> str:
    """
    Detect the current theme (light/dark).

    Returns:
        "light" or "dark"
    """
    try:
        base = st.get_option("theme.base")
        return "dark" if base == "dark" else "light"
    except Exception:
        return st.session_state.get("theme_mode", "light")


def get_theme_config() -> dict:
    """
    Get the current theme configuration.

    Returns:
        Theme configuration dict with colors
    """
    theme = get_theme()
    return THEME_CONFIGS.get(theme, THEME_CONFIGS["light"])


def apply_chart_theme(fig):
    """
    Apply consistent theming to a Plotly figure.

    Args:
        fig: Plotly figure object

    Returns:
        The modified figure
    """
    theme = get_theme()
    palette = get_color_palette()
    config = THEME_CONFIGS[theme]

    fig.update_layout(
        plot_bgcolor=config["bg"],
        paper_bgcolor=config["paper"],
        font=dict(color=config["text"]),
        colorway=palette["primary"]
    )
    fig.update_xaxes(
        gridcolor=config["grid"],
        linecolor=config["border"]
    )
    fig.update_yaxes(
        gridcolor=config["grid"],
        linecolor=config["border"]
    )

    return fig


def get_chart_colors(count: int = 5) -> list:
    """
    Get a list of colors for charts.

    Args:
        count: Number of colors needed

    Returns:
        List of hex color strings
    """
    palette = get_color_palette()
    colors = palette["primary"]

    # Extend if needed
    while len(colors) < count:
        colors = colors + colors

    return colors[:count]


def get_status_color(status: str) -> str:
    """
    Get the color for a status indicator.

    Args:
        status: Status type ("success", "warning", "error", "info", "neutral")

    Returns:
        Hex color string
    """
    palette = get_color_palette()
    return palette.get(status, palette.get("neutral", "#949494"))


def render_palette_selector():
    """
    Render a color palette selector widget.
    Stores selection in session state.
    """
    current = st.session_state.get("color_palette", "universal")

    options = list(COLORBLIND_PALETTES.keys())
    labels = {k: v["name"] for k, v in COLORBLIND_PALETTES.items()}

    selected = st.selectbox(
        "Color palette",
        options=options,
        index=options.index(current),
        format_func=lambda x: labels[x],
        help="Choose a colorblind-friendly palette for all charts"
    )

    if selected != current:
        st.session_state.color_palette = selected
        st.rerun()

    # Show description
    palette = COLORBLIND_PALETTES[selected]
    st.caption(palette["description"])

    # Show color preview
    colors = palette["primary"]
    cols = st.columns(len(colors))
    for col, color in zip(cols, colors):
        with col:
            st.markdown(f"""
            <div style="
                background-color: {color};
                height: 30px;
                border-radius: 4px;
            "></div>
            """, unsafe_allow_html=True)


def get_comparison_colors() -> tuple:
    """
    Get colors for comparison charts (e.g., with signal vs without).

    Returns:
        Tuple of (positive_color, negative_color)
    """
    palette = get_color_palette()
    return (palette["success"], palette["neutral"])


def get_trend_color(value: float) -> str:
    """
    Get color based on trend direction.

    Args:
        value: Trend value (positive = good, negative = bad)

    Returns:
        Hex color string
    """
    palette = get_color_palette()
    if value > 0:
        return palette["success"]
    elif value < 0:
        return palette["error"]
    else:
        return palette["neutral"]
