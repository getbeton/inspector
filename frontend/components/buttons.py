"""
Button components with state support (disabled, loading, hover).
"""

import streamlit as st


def action_button(
    label: str,
    key: str,
    disabled: bool = False,
    loading: bool = False,
    button_type: str = "secondary",
    on_click=None,
    help_text: str = None,
    use_container_width: bool = True
) -> bool:
    """
    Unified button with state support.

    States:
    - Normal: Clickable, standard appearance
    - Disabled: Grayed out, not clickable, shows reason
    - Loading: Shows spinner, not clickable

    Args:
        label: Button text
        key: Unique key for the button
        disabled: Whether button is disabled
        loading: Whether to show loading state
        button_type: "primary" or "secondary"
        on_click: Callback function
        help_text: Help text shown when disabled
        use_container_width: Whether to use full container width

    Returns:
        True if button was clicked, False otherwise
    """
    if loading:
        # Show loading state with spinner
        col1, col2 = st.columns([0.15, 0.85])
        with col1:
            st.markdown("""
            <div style="
                width: 20px;
                height: 20px;
                border: 2px solid #f3f3f3;
                border-top: 2px solid #0173B2;
                border-radius: 50%;
                animation: spin 1s linear infinite;
                margin-top: 8px;
            "></div>
            <style>
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
            </style>
            """, unsafe_allow_html=True)
        with col2:
            st.button(
                label,
                disabled=True,
                key=f"{key}_loading",
                use_container_width=use_container_width
            )
        return False

    if disabled:
        # Render disabled-looking button with HTML
        st.markdown(f"""
        <button disabled style="
            width: 100%;
            padding: 0.5rem 1rem;
            background-color: #f0f0f0;
            color: #999;
            border: 1px solid #ddd;
            border-radius: 0.5rem;
            cursor: not-allowed;
            opacity: 0.6;
            font-size: 0.85rem;
        ">{label}</button>
        """, unsafe_allow_html=True)
        if help_text:
            st.caption(f"ℹ️ {help_text}")
        return False

    # Normal button
    return st.button(
        label,
        key=key,
        type=button_type,
        use_container_width=use_container_width,
        on_click=on_click
    )


def apply_button_hover_styles():
    """Add hover effects to all buttons via CSS."""
    st.markdown("""
    <style>
        /* Default button hover */
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


def render_button_group(buttons: list, key_prefix: str = "btn_group") -> dict:
    """
    Render a horizontal group of buttons.

    Args:
        buttons: List of button configs with keys:
            - label: Button text
            - type: "primary" or "secondary"
            - disabled: Whether disabled
            - help: Help text
        key_prefix: Prefix for button keys

    Returns:
        Dict mapping button labels to clicked state
    """
    cols = st.columns(len(buttons))
    results = {}

    for i, (col, btn) in enumerate(zip(cols, buttons)):
        with col:
            label = btn.get("label", f"Button {i}")
            clicked = action_button(
                label=label,
                key=f"{key_prefix}_{i}_{label.replace(' ', '_').lower()}",
                disabled=btn.get("disabled", False),
                button_type=btn.get("type", "secondary"),
                help_text=btn.get("help")
            )
            results[label] = clicked

    return results


def icon_button(icon: str, label: str, key: str, **kwargs) -> bool:
    """
    Render a button with an icon prefix.

    Args:
        icon: Emoji or icon character
        label: Button text
        key: Unique key
        **kwargs: Additional args passed to action_button

    Returns:
        True if clicked
    """
    return action_button(
        label=f"{icon} {label}",
        key=key,
        **kwargs
    )
