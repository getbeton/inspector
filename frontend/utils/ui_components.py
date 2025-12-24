"""
Unified UI components for consistent styling across all pages.
"""

import streamlit as st
from utils.data_handler import is_mock_mode, set_mock_mode


def render_page_header(title: str, show_data_toggle: bool = True):
    """
    Render a unified page header with optional data mode toggle.

    Args:
        title: Page title (without emoji - emoji comes from page_icon)
        show_data_toggle: Whether to show the mock/real data toggle
    """
    # CSS to ensure toggle label stays on one line
    st.markdown("""
    <style>
        /* Keep Demo toggle label on one line */
        [data-testid="stToggle"] label {
            white-space: nowrap !important;
            min-width: 60px;
        }
        [data-testid="stToggle"] > div {
            flex-wrap: nowrap !important;
        }
    </style>
    """, unsafe_allow_html=True)

    if show_data_toggle:
        col1, col2 = st.columns([0.8, 0.2])
        with col1:
            st.title(title)
        with col2:
            # Use container to control layout
            st.markdown('<div style="padding-top: 0.5rem;">', unsafe_allow_html=True)
            mode = st.toggle(
                "Demo",
                value=is_mock_mode(),
                key=f"mode_toggle_{title.replace(' ', '_')}",
                help="Toggle between demo data and real data"
            )
            st.markdown('</div>', unsafe_allow_html=True)
            if mode != is_mock_mode():
                set_mock_mode(mode)
                st.toast(f"Switched to {'Demo' if mode else 'Real'} data")
                st.rerun()
    else:
        st.title(title)


def render_mock_data_banner():
    """Show a clean banner indicating demo data is active."""
    if is_mock_mode():
        st.info(
            "Using demo data. Switch to real data in Setup to connect your integrations.",
            icon="ℹ️"
        )


def apply_compact_button_styles():
    """Apply compact button styling via CSS."""
    st.markdown("""
    <style>
        /* Compact buttons */
        .stButton > button {
            font-size: 0.85rem;
            padding: 0.4rem 0.8rem;
        }

        /* Even smaller for buttons in columns */
        div[data-testid="column"] .stButton > button {
            font-size: 0.8rem;
            white-space: nowrap;
        }

        /* Button hover effects */
        .stButton > button:hover:not(:disabled) {
            border-color: #0173B2;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            transform: translateY(-1px);
            transition: all 0.2s ease;
        }

        /* Primary button hover */
        .stButton > button[kind="primary"]:hover:not(:disabled) {
            filter: brightness(1.1);
        }

        /* Active/pressed state */
        .stButton > button:active:not(:disabled) {
            transform: translateY(0);
            box-shadow: none;
        }

        /* Disabled state */
        .stButton > button:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }
    </style>
    """, unsafe_allow_html=True)


def apply_global_styles():
    """Apply global UI improvements that work in both light and dark mode."""
    st.markdown("""
    <style>
        /* Metric cards - theme-aware */
        [data-testid="stMetric"] {
            padding: 1rem;
            border-radius: 8px;
            border: 1px solid rgba(128, 128, 128, 0.2);
        }

        /* Light mode metric cards */
        @media (prefers-color-scheme: light) {
            [data-testid="stMetric"] {
                background-color: #f8f9fa;
            }
        }

        /* Dark mode metric cards - transparent background to inherit theme */
        @media (prefers-color-scheme: dark) {
            [data-testid="stMetric"] {
                background-color: rgba(255, 255, 255, 0.05);
            }
        }

        /* Force inherit theme for Streamlit's dark mode */
        .stApp[data-theme="dark"] [data-testid="stMetric"] {
            background-color: rgba(255, 255, 255, 0.05) !important;
            border-color: rgba(255, 255, 255, 0.1) !important;
        }

        /* Better expander styling */
        .streamlit-expanderHeader {
            font-size: 0.9rem;
            font-weight: 500;
        }

        /* Tighter table spacing */
        .stDataFrame {
            font-size: 0.85rem;
        }

        /* Metric label styling */
        [data-testid="stMetricLabel"] {
            font-size: 0.85rem;
        }

        /* Metric value styling */
        [data-testid="stMetricValue"] {
            font-size: 1.5rem;
            font-weight: 600;
        }

        /* Delta indicator styling */
        [data-testid="stMetricDelta"] {
            font-size: 0.8rem;
        }
    </style>
    """, unsafe_allow_html=True)


def render_section_header(title: str, subtitle: str = None):
    """Render a section header with optional subtitle."""
    st.markdown(f"### {title}")
    if subtitle:
        st.caption(subtitle)


def render_stat_row(stats: list):
    """
    Render a row of stat cards.

    Args:
        stats: List of dicts with 'label', 'value', and optional 'delta', 'help'
    """
    cols = st.columns(len(stats))
    for col, stat in zip(cols, stats):
        with col:
            st.metric(
                label=stat.get("label", ""),
                value=stat.get("value", ""),
                delta=stat.get("delta"),
                help=stat.get("help")
            )


def render_action_buttons(buttons: list, key_prefix: str = "action"):
    """
    Render a row of action buttons.

    Args:
        buttons: List of dicts with 'label', 'type' (primary/secondary), 'disabled', 'help'
        key_prefix: Prefix for button keys

    Returns:
        Dict mapping button labels to their clicked state
    """
    cols = st.columns(len(buttons))
    results = {}

    for i, (col, btn) in enumerate(zip(cols, buttons)):
        with col:
            clicked = st.button(
                btn.get("label", f"Button {i}"),
                type=btn.get("type", "secondary"),
                use_container_width=True,
                disabled=btn.get("disabled", False),
                help=btn.get("help"),
                key=f"{key_prefix}_{i}_{btn.get('label', '').replace(' ', '_')}"
            )
            results[btn.get("label", f"Button {i}")] = clicked

    return results
