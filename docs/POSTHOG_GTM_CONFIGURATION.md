# PostHog + GTM Configuration Guide

This document describes the Google Tag Manager configuration required for PostHog user identification in Beton Inspector.

## Overview

Beton Inspector uses GTM as the intermediary for PostHog analytics. The Next.js application pushes events to `dataLayer`, and GTM fires the appropriate PostHog SDK calls.

## Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│  NEXT.JS APP                                                            │
│                                                                         │
│  pushToDataLayer({ event: 'posthog_identify', user_id: '...', ... })   │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  GOOGLE TAG MANAGER                                                     │
│                                                                         │
│  Trigger: Custom Event = 'posthog_identify'                             │
│  Tag: posthog.identify(userId, $set, $set_once)                         │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  POSTHOG                                                                │
│                                                                         │
│  Links anonymous distinct_id → authenticated user_id                    │
│  Stores user properties ($set, $set_once)                               │
└─────────────────────────────────────────────────────────────────────────┘
```

## GTM Configuration Steps

### Step 1: PostHog Initialization Tag (Custom HTML)

**Tag Name:** `PostHog - Initialize`
**Trigger:** All Pages (Page View)

```html
<script>
  !function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.async=!0,p.src=s.api_host.replace('.i.posthog.com','-assets.i.posthog.com')+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture register register_once register_for_session unregister unregister_for_session getFeatureFlag getFeatureFlagPayload isFeatureEnabled reloadFeatureFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSessionId getSurveys getActiveMatchingSurveys renderSurvey canRenderSurvey getNextSurveyStep identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException loadToolbar get_property getSessionProperty createPersonProfile opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing clear_opt_in_out_capturing debug getPageViewId".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);

  posthog.init('{{PostHog API Key}}', {
    api_host: 'https://us.i.posthog.com',  // or eu.i.posthog.com for EU

    // CRITICAL: Create person profiles for ALL users (including anonymous)
    person_profiles: 'always',

    // CRITICAL: Cookie-only persistence for cross-subdomain tracking
    // (getbeton.ai ↔ inspector.getbeton.ai)
    persistence: 'cookie',
    cross_subdomain_cookie: true,

    // Use 2025 defaults for best practices
    defaults: '2025-11-30',

    // Let GTM handle page views
    capture_pageview: false,

    // Enable autocapture for click/form tracking
    autocapture: true,

    // Session recording (optional)
    disable_session_recording: false,
  });
</script>
```

### Step 2: DataLayer Variables

Create these Data Layer Variables in GTM:

| Variable Name | Data Layer Variable Name | Type |
|---------------|-------------------------|------|
| `DLV - user_id` | `user_id` | Data Layer Variable |
| `DLV - user_properties_set` | `user_properties_set` | Data Layer Variable |
| `DLV - user_properties_set_once` | `user_properties_set_once` | Data Layer Variable |
| `DLV - signup_method` | `signup_method` | Data Layer Variable |
| `DLV - login_method` | `login_method` | Data Layer Variable |
| `DLV - workspace_id` | `workspace_id` | Data Layer Variable |
| `DLV - email` | `email` | Data Layer Variable |

### Step 3: Triggers

Create these Custom Event Triggers:

| Trigger Name | Event Name |
|--------------|------------|
| `CE - PostHog Identify` | `posthog_identify` |
| `CE - PostHog Reset` | `posthog_reset` |
| `CE - User Signup` | `user_signup` |
| `CE - User Login` | `user_login` |

### Step 4: Tags

#### Tag: PostHog - Identify User

**Tag Type:** Custom HTML
**Trigger:** CE - PostHog Identify

```html
<script>
  (function() {
    if (!window.posthog) {
      console.warn('[GTM] PostHog not loaded, skipping identify');
      return;
    }

    var userId = {{DLV - user_id}};
    var setProps = {{DLV - user_properties_set}} || {};
    var setOnceProps = {{DLV - user_properties_set_once}} || {};

    if (!userId) {
      console.warn('[GTM] No user_id provided for identify');
      return;
    }

    console.log('[GTM] Identifying user:', userId);
    window.posthog.identify(userId, setProps, setOnceProps);
  })();
</script>
```

#### Tag: PostHog - Reset

**Tag Type:** Custom HTML
**Trigger:** CE - PostHog Reset

```html
<script>
  (function() {
    if (window.posthog && window.posthog.reset) {
      console.log('[GTM] Resetting PostHog identity');
      window.posthog.reset();
    }
  })();
</script>
```

#### Tag: PostHog - Track Signup

**Tag Type:** Custom HTML
**Trigger:** CE - User Signup

```html
<script>
  (function() {
    if (!window.posthog) return;

    window.posthog.capture('user_signed_up', {
      signup_method: {{DLV - signup_method}} || 'google_oauth',
      workspace_id: {{DLV - workspace_id}},
      email: {{DLV - email}}
    });
  })();
</script>
```

#### Tag: PostHog - Track Login

**Tag Type:** Custom HTML
**Trigger:** CE - User Login

```html
<script>
  (function() {
    if (!window.posthog) return;

    window.posthog.capture('user_logged_in', {
      login_method: {{DLV - login_method}} || 'google_oauth',
      workspace_id: {{DLV - workspace_id}},
      email: {{DLV - email}}
    });
  })();
</script>
```

## Events Reference

### Events Pushed from Next.js

| Event | When Fired | Properties |
|-------|------------|------------|
| `posthog_identify` | User logs in or page loads with session | `user_id`, `user_properties_set`, `user_properties_set_once` |
| `posthog_reset` | User logs out | (none) |
| `user_signup` | New user completes registration | `user_id`, `signup_method`, `workspace_id`, `email` |
| `user_login` | Returning user logs in (once per session) | `user_id`, `login_method`, `workspace_id`, `email` |

### User Properties

| Property | Method | Description |
|----------|--------|-------------|
| `email` | `$set` | User's email address |
| `name` | `$set` | Display name |
| `workspace_id` | `$set` | Current workspace UUID |
| `workspace_name` | `$set` | Workspace display name |
| `role` | `$set` | Workspace role (owner/member) |
| `signed_up_at` | `$set_once` | First signup timestamp (immutable) |

## Cross-Subdomain Configuration

The configuration above enables cross-subdomain tracking between:
- `getbeton.ai` (marketing site)
- `inspector.getbeton.ai` (application)

Key settings:
- `persistence: 'cookie'` — Stores distinct_id in cookie (not localStorage)
- `cross_subdomain_cookie: true` — Cookie set on `.getbeton.ai`

## Testing

### GTM Preview Mode

1. Enable GTM Preview mode
2. Navigate through signup/login flows
3. Verify these events fire in the Tag Assistant:
   - `posthog_identify` on login
   - `user_signup` for new users
   - `user_login` for returning users
   - `posthog_reset` on logout

### PostHog Live Events

1. Open PostHog dashboard → Live Events
2. Perform test actions in the app
3. Verify events appear with correct properties

### Cross-Subdomain Test

1. Visit `getbeton.ai` (note the anonymous distinct_id in cookie)
2. Navigate to `inspector.getbeton.ai`
3. Verify the same distinct_id persists
4. Log in and verify identify links the same distinct_id

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Events not firing | Check GTM Preview mode for trigger conditions |
| PostHog not loaded | Verify initialization tag fires on All Pages |
| Cross-subdomain not working | Ensure `persistence: 'cookie'` and same domain |
| Duplicate identifies | Check `_isIdentified()` guard in code |
| Wrong user properties | Verify DataLayer Variable mappings |

## References

- [PostHog GTM Documentation](https://posthog.com/docs/libraries/google-tag-manager)
- [PostHog Identify Documentation](https://posthog.com/docs/product-analytics/identify)
- [PostHog Persistence Documentation](https://posthog.com/docs/libraries/js/persistence)
- [Cross-Domain Tracking](https://posthog.com/tutorials/cross-domain-tracking)
