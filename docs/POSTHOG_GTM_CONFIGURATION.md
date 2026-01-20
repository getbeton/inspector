# PostHog + GTM Configuration Guide

This document describes the Google Tag Manager configuration required for PostHog analytics in Beton Inspector.

## Overview

Beton Inspector uses GTM as the intermediary for PostHog analytics. The Next.js application pushes events to `dataLayer`, and GTM fires the appropriate PostHog SDK calls.

### Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│  NEXT.JS APP                                                            │
│                                                                         │
│  pushToDataLayer({ event: 'user_signup', user_id: '...', ... })        │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  GOOGLE TAG MANAGER                                                     │
│                                                                         │
│  Universal Trigger → Universal Capture Tag                              │
│  posthog.capture(eventName, properties)                                 │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  POSTHOG                                                                │
│                                                                         │
│  Events tracked with properties, user identification maintained         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Components Summary

| Component | Count | Purpose |
|-----------|-------|---------|
| Variables | 13 | Extract data from dataLayer |
| Triggers | 4 | Fire tags on specific events |
| Tags | 4 | Initialize PostHog + handle identify/reset/capture |

---

## Step 1: Create Variables

### Built-in Variables

Go to **Variables** → **Configure** → Enable:
- `Event`

### Custom Data Layer Variables

Create these Data Layer Variables in GTM:

| Variable Name | Type | Data Layer Variable Name |
|---------------|------|-------------------------|
| `DLV - event` | Data Layer Variable | `event` |
| `DLV - user_id` | Data Layer Variable | `user_id` |
| `DLV - user_properties_set` | Data Layer Variable | `user_properties_set` |
| `DLV - user_properties_set_once` | Data Layer Variable | `user_properties_set_once` |
| `DLV - event_category` | Data Layer Variable | `event_category` |
| `DLV - event_action` | Data Layer Variable | `event_action` |
| `DLV - event_label` | Data Layer Variable | `event_label` |
| `DLV - event_value` | Data Layer Variable | `event_value` |
| `DLV - signup_method` | Data Layer Variable | `signup_method` |
| `DLV - login_method` | Data Layer Variable | `login_method` |
| `DLV - workspace_id` | Data Layer Variable | `workspace_id` |
| `DLV - workspace_name` | Data Layer Variable | `workspace_name` |
| `DLV - email` | Data Layer Variable | `email` |

---

## Step 2: Create Triggers

### Trigger 1: All Pages

- **Name:** `All Pages`
- **Type:** Page View
- **Fires on:** All Pages
- *(This is a built-in trigger)*

### Trigger 2: CE - PostHog Identify

- **Name:** `CE - PostHog Identify`
- **Type:** Custom Event
- **Event name:** `posthog_identify`
- **Fires on:** All Custom Events

### Trigger 3: CE - PostHog Reset

- **Name:** `CE - PostHog Reset`
- **Type:** Custom Event
- **Event name:** `posthog_reset`
- **Fires on:** All Custom Events

### Trigger 4: CE - All Custom Events (Universal)

- **Name:** `CE - All Custom Events`
- **Type:** Custom Event
- **Event name:** `.*` (regex match all)
- **Use regex matching:** ✅ Checked
- **Fires on:** Some Custom Events
- **Conditions:**
  - `Event` does not equal `posthog_identify`
  - AND `Event` does not equal `posthog_reset`
  - AND `Event` does not equal `gtm.js`
  - AND `Event` does not equal `gtm.dom`
  - AND `Event` does not equal `gtm.load`

---

## Step 3: Create Tags

### Tag 1: PostHog - Initialize

**Name:** `PostHog - Initialize`
**Type:** Custom HTML
**Trigger:** All Pages
**Tag firing priority:** 100 (high priority, fires first)

```html
<script>
  !function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace('.i.posthog.com','-assets.i.posthog.com')+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture register register_once register_for_session unregister unregister_for_session getFeatureFlag getFeatureFlagPayload isFeatureEnabled reloadFeatureFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSessionId getSurveys getActiveMatchingSurveys renderSurvey canRenderSurvey getNextSurveyStep identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException loadToolbar get_property getSessionProperty createPersonProfile opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing clear_opt_in_out_capturing debug getPageViewId".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);

  posthog.init('YOUR_POSTHOG_PROJECT_API_KEY', {
    api_host: 'https://us.i.posthog.com',

    // Create person profiles for all users (including anonymous)
    person_profiles: 'always',

    // Cookie-only persistence for cross-subdomain (getbeton.ai <-> inspector.getbeton.ai)
    persistence: 'cookie',
    cross_subdomain_cookie: true,

    // 2025 defaults
    defaults: '2025-11-30',

    // Let GTM handle page views
    capture_pageview: false,

    // Enable autocapture
    autocapture: true,

    // Session recording
    disable_session_recording: false
  });

  console.log('[GTM] PostHog initialized');
</script>
```

> **Important:** Replace `YOUR_POSTHOG_PROJECT_API_KEY` with your actual PostHog project API key (starts with `phc_`)

---

### Tag 2: PostHog - Identify User

**Name:** `PostHog - Identify User`
**Type:** Custom HTML
**Trigger:** CE - PostHog Identify

```html
<script>
  (function() {
    if (typeof posthog === 'undefined') {
      console.warn('[GTM] PostHog not loaded, skipping identify');
      return;
    }

    var userId = {{DLV - user_id}};
    var setProps = {{DLV - user_properties_set}} || {};
    var setOnceProps = {{DLV - user_properties_set_once}} || {};

    if (!userId) {
      console.warn('[GTM] No user_id for identify');
      return;
    }

    posthog.identify(userId, setProps, setOnceProps);
    console.log('[GTM] PostHog identify:', userId);
  })();
</script>
```

---

### Tag 3: PostHog - Reset

**Name:** `PostHog - Reset`
**Type:** Custom HTML
**Trigger:** CE - PostHog Reset

```html
<script>
  (function() {
    if (typeof posthog !== 'undefined' && posthog.reset) {
      posthog.reset();
      console.log('[GTM] PostHog reset');
    }
  })();
</script>
```

---

### Tag 4: PostHog - Universal Capture

**Name:** `PostHog - Universal Capture`
**Type:** Custom HTML
**Trigger:** CE - All Custom Events

```html
<script>
  (function() {
    if (typeof posthog === 'undefined') {
      console.warn('[GTM] PostHog not loaded, skipping capture');
      return;
    }

    var eventName = {{DLV - event}};

    // Skip GTM internal events
    if (!eventName || eventName.indexOf('gtm.') === 0) {
      return;
    }

    // Build properties object from all available dataLayer values
    var properties = {};

    // Standard event properties (from trackEvent)
    var category = {{DLV - event_category}};
    var action = {{DLV - event_action}};
    var label = {{DLV - event_label}};
    var value = {{DLV - event_value}};

    if (category) properties.event_category = category;
    if (action) properties.event_action = action;
    if (label) properties.event_label = label;
    if (value !== undefined && value !== null) properties.event_value = value;

    // Auth-related properties
    var userId = {{DLV - user_id}};
    var signupMethod = {{DLV - signup_method}};
    var loginMethod = {{DLV - login_method}};
    var workspaceId = {{DLV - workspace_id}};
    var workspaceName = {{DLV - workspace_name}};
    var email = {{DLV - email}};

    if (userId) properties.user_id = userId;
    if (signupMethod) properties.signup_method = signupMethod;
    if (loginMethod) properties.login_method = loginMethod;
    if (workspaceId) properties.workspace_id = workspaceId;
    if (workspaceName) properties.workspace_name = workspaceName;
    if (email) properties.email = email;

    // Capture the event
    posthog.capture(eventName, properties);
    console.log('[GTM] PostHog capture:', eventName, properties);
  })();
</script>
```

---

## Event Mapping

With this setup, here's how Next.js events map to PostHog:

| Next.js Event | PostHog Event Name | Properties |
|---------------|-------------------|------------|
| `user_signup` | `user_signup` | user_id, signup_method, workspace_id, email |
| `user_login` | `user_login` | user_id, login_method, workspace_id, email |
| `custom_event` | `custom_event` | event_category, event_action, event_label, event_value |
| `user_identified` | `user_identified` | user_id, (any passed properties) |
| `workspace_context_set` | `workspace_context_set` | workspace_id, workspace_slug |
| `virtual_page_view` | `virtual_page_view` | page_path, page_title |

---

## User Properties

Properties set during identification:

| Property | Method | Description |
|----------|--------|-------------|
| `email` | `$set` | User's email address |
| `name` | `$set` | Display name |
| `workspace_id` | `$set` | Current workspace UUID |
| `workspace_name` | `$set` | Workspace display name |
| `role` | `$set` | Workspace role (owner/member) |
| `signed_up_at` | `$set_once` | First signup timestamp (immutable) |

---

## Cross-Subdomain Configuration

The configuration above enables cross-subdomain tracking between:
- `getbeton.ai` (marketing site)
- `inspector.getbeton.ai` (application)

Key settings in PostHog initialization:
- `persistence: 'cookie'` — Stores distinct_id in cookie (not localStorage)
- `cross_subdomain_cookie: true` — Cookie set on `.getbeton.ai`
- `person_profiles: 'always'` — Creates profiles for anonymous users too

---

## Testing

### GTM Preview Mode

1. Enable GTM Preview mode (click Preview in GTM)
2. Load any page on your site
3. Verify these events in the Tag Assistant:

| Action | Expected Tags |
|--------|---------------|
| Page load | PostHog - Initialize |
| User logs in | PostHog - Identify User, PostHog - Universal Capture (user_login or user_signup) |
| User logs out | PostHog - Reset |
| Any custom event | PostHog - Universal Capture |

### PostHog Live Events

1. Open PostHog dashboard → Live Events
2. Perform test actions in the app
3. Verify events appear with correct properties

### Cross-Subdomain Test

1. Visit `getbeton.ai` (note the anonymous distinct_id in cookie)
2. Navigate to `inspector.getbeton.ai`
3. Verify the same distinct_id persists
4. Log in and verify identify links the same distinct_id

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Events not firing | Check GTM Preview mode for trigger conditions |
| PostHog not loaded | Verify initialization tag fires on All Pages with priority 100 |
| Cross-subdomain not working | Ensure `persistence: 'cookie'` and domain matches |
| Duplicate identifies | Check that identify only fires on `posthog_identify` event |
| Wrong user properties | Verify Data Layer Variable mappings match exactly |
| GTM ID has newline | Remove trailing whitespace/newline from `NEXT_PUBLIC_GTM_ID` env var |

---

## Environment Variables

Required in Vercel (or your hosting platform):

| Variable | Example | Description |
|----------|---------|-------------|
| `NEXT_PUBLIC_GTM_ID` | `GTM-KP6MCM7D` | Your GTM container ID (no trailing spaces/newlines!) |

---

## Next.js Code Reference

Events are pushed from these locations:

| File | Function | Event |
|------|----------|-------|
| `src/lib/analytics/gtm.ts` | `trackSignup()` | `user_signup` |
| `src/lib/analytics/gtm.ts` | `trackLogin()` | `user_login` |
| `src/lib/analytics/gtm.ts` | `trackEvent()` | `custom_event` |
| `src/lib/analytics/gtm.ts` | `identifyUser()` | `user_identified` |
| `src/lib/analytics/gtm.ts` | `resetIdentity()` | `posthog_reset` |
| `src/lib/analytics/use-posthog-identify.ts` | `usePostHogIdentify()` | `posthog_identify` |

---

## References

- [PostHog GTM Documentation](https://posthog.com/docs/libraries/google-tag-manager)
- [PostHog Identify Documentation](https://posthog.com/docs/product-analytics/identify)
- [PostHog Persistence Documentation](https://posthog.com/docs/libraries/js/persistence)
- [Cross-Domain Tracking](https://posthog.com/tutorials/cross-domain-tracking)
- [PostHog Person Properties](https://posthog.com/docs/product-analytics/person-properties)
