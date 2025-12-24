"""
Empty states and skeleton loaders for consistent loading/empty UX.
"""

import streamlit as st


# Empty state configurations
EMPTY_STATE_CONFIGS = {
    "no_signals": {
        "icon": "🎯",
        "title": "No signals yet",
        "message": "Signals will appear here once discovered from your data.",
        "cta_label": "Run Discovery",
        "cta_page": "pages/03_Backtest.py"
    },
    "no_playbooks": {
        "icon": "📋",
        "title": "No playbooks configured",
        "message": "Create automation rules to act on your signals.",
        "cta_label": "Create Playbook",
        "cta_page": None
    },
    "no_identities": {
        "icon": "👤",
        "title": "No identities resolved",
        "message": "User identities will appear after syncing your data sources.",
        "cta_label": "Sync Now",
        "cta_page": "Home.py"
    },
    "no_results": {
        "icon": "🔍",
        "title": "No results match your filters",
        "message": "Try adjusting your search criteria.",
        "cta_label": "Clear Filters",
        "cta_page": None
    },
    "connection_required": {
        "icon": "🔌",
        "title": "Connection required",
        "message": "Connect your data sources to see real data.",
        "cta_label": "Set Up Connections",
        "cta_page": "Home.py"
    },
    "error": {
        "icon": "⚠️",
        "title": "Something went wrong",
        "message": "We couldn't load this data. Please try again.",
        "cta_label": "Retry",
        "cta_page": None
    },
    "no_data": {
        "icon": "📊",
        "title": "No data available",
        "message": "Data will appear here once synced from your sources.",
        "cta_label": "Go to Setup",
        "cta_page": "Home.py"
    }
}


def render_empty_state(
    state_type: str,
    custom_message: str = None,
    custom_title: str = None,
    on_cta_click=None,
    show_cta: bool = True
):
    """
    Render a consistent empty state.

    Args:
        state_type: Key from EMPTY_STATE_CONFIGS
        custom_message: Override the default message
        custom_title: Override the default title
        on_cta_click: Callback function for CTA button
        show_cta: Whether to show the CTA button
    """
    config = EMPTY_STATE_CONFIGS.get(state_type, EMPTY_STATE_CONFIGS["error"])

    col1, col2, col3 = st.columns([0.25, 0.5, 0.25])
    with col2:
        st.markdown(f"""
        <div style="text-align: center; padding: 3rem 1rem;">
            <div style="font-size: 3rem; margin-bottom: 1rem;">{config['icon']}</div>
            <h3 style="margin-bottom: 0.5rem; color: inherit;">{custom_title or config['title']}</h3>
            <p style="color: #666; margin-bottom: 1.5rem;">
                {custom_message or config['message']}
            </p>
        </div>
        """, unsafe_allow_html=True)

        if show_cta and config.get("cta_label"):
            if st.button(config["cta_label"], use_container_width=True, type="primary"):
                if on_cta_click:
                    on_cta_click()
                elif config.get("cta_page"):
                    st.switch_page(config["cta_page"])


def _get_skeleton_css():
    """Return the CSS for skeleton animations."""
    return """
    <style>
        @keyframes shimmer {
            0% { background-position: -200% 0; }
            100% { background-position: 200% 0; }
        }
        .skeleton-shimmer {
            background: linear-gradient(90deg, #f0f0f0 25%, #e8e8e8 50%, #f0f0f0 75%);
            background-size: 200% 100%;
            animation: shimmer 1.5s infinite;
        }
    </style>
    """


def skeleton_card(height: int = 80, key: str = None):
    """
    Render a single skeleton card placeholder.

    Args:
        height: Height of the skeleton card in pixels
        key: Optional unique key for the element
    """
    st.markdown(f"""
    {_get_skeleton_css()}
    <div class="skeleton-shimmer" style="
        height: {height}px;
        border-radius: 8px;
        margin-bottom: 12px;
    "></div>
    """, unsafe_allow_html=True)


def skeleton_table(rows: int = 5, cols: int = 4):
    """
    Render a skeleton table placeholder.

    Args:
        rows: Number of data rows
        cols: Number of columns
    """
    st.markdown(_get_skeleton_css(), unsafe_allow_html=True)

    # Header row
    header_cols = st.columns(cols)
    for col in header_cols:
        with col:
            st.markdown("""
            <div style="
                background: #e0e0e0;
                height: 20px;
                border-radius: 4px;
                margin-bottom: 16px;
            "></div>
            """, unsafe_allow_html=True)

    # Data rows
    for row_idx in range(rows):
        row_cols = st.columns(cols)
        for col in row_cols:
            with col:
                st.markdown(f"""
                <div class="skeleton-shimmer" style="
                    height: 40px;
                    border-radius: 4px;
                    margin-bottom: 8px;
                "></div>
                """, unsafe_allow_html=True)


def skeleton_metrics(count: int = 4):
    """
    Render skeleton metric cards.

    Args:
        count: Number of metric cards
    """
    st.markdown(_get_skeleton_css(), unsafe_allow_html=True)

    cols = st.columns(count)
    for col in cols:
        with col:
            st.markdown("""
            <div class="skeleton-shimmer" style="
                padding: 1rem;
                border-radius: 8px;
                border: 1px solid #eee;
            ">
                <div style="background: #e0e0e0; height: 14px; width: 60%; border-radius: 4px; margin-bottom: 8px;"></div>
                <div style="background: #e0e0e0; height: 28px; width: 80%; border-radius: 4px;"></div>
            </div>
            """, unsafe_allow_html=True)


def skeleton_chart(height: int = 300):
    """
    Render a skeleton chart placeholder.

    Args:
        height: Height of the chart skeleton
    """
    st.markdown(f"""
    {_get_skeleton_css()}
    <div class="skeleton-shimmer" style="
        height: {height}px;
        border-radius: 8px;
        margin: 1rem 0;
    "></div>
    """, unsafe_allow_html=True)


def render_loading_state(message: str = "Loading..."):
    """
    Render a simple loading state with spinner.

    Args:
        message: Loading message to display
    """
    col1, col2, col3 = st.columns([0.4, 0.2, 0.4])
    with col2:
        st.spinner(message)
