# PostHog Identify Testing Protocol

## Overview

This document describes how to test the PostHog user identification flow after adding debug logging. Run these tests on `test.getbeton.org` after the debug branch is deployed.

---

## Prerequisites

1. **Deploy the debug branch**: Ensure `fix/orphaned-users-rls-policies` is deployed to `test.getbeton.org`
2. **Browser with DevTools**: Chrome or Firefox with access to Console
3. **Test email account**: A Google account you can use to sign up (not already registered)
4. **PostHog dashboard access**: To verify user identification
5. **Vercel logs access**: To check server-side logs

---

## Test 1: New User Signup Flow

### Objective
Verify that a brand new user gets identified in PostHog after OAuth signup.

### Steps

1. **Open an incognito/private browser window**
   - This ensures no existing session cookies

2. **Open DevTools → Console**
   - Clear the console for clean output
   - Filter by `[` to show only our debug logs

3. **Navigate to `https://test.getbeton.org/login`**
   - Observe: No session logs should appear (not authenticated yet)

4. **Click "Sign in with Google"**
   - Sign in with a **NEW** Google account (never used on this app before)
   - Complete the OAuth flow

5. **After redirect to `/?signup=true`**

   **In Browser Console, look for:**
   ```
   [SessionProvider] Fetching session from /api/session...
   [SessionProvider] Response status: 200
   [SessionProvider] Session data received: {hasData: true, sub: "xxx", email: "xxx", workspace_id: "xxx"}
   [SessionProvider] Loading complete
   [PostHog Identify] State: {loading: false, hasSession: true, error: null, sub: "xxx"}
   [PostHog Identify] Pushing identify event for user: xxx
   [PostHog Identify] Event pushed successfully
   ```

6. **Check `window.dataLayer`**
   - In Console, type: `window.dataLayer`
   - Look for an object with `event: "posthog_identify"`
   - Should contain `user_id`, `user_properties_set` with email, workspace_id, etc.

7. **Check Vercel Function Logs** (Vercel Dashboard → Project → Logs)

   Look for:
   ```
   [API /session] Request received
   [getSession] Calling supabase.auth.getUser()...
   [getSession] User found: xxx test@example.com
   [getSession] Querying workspace_members for user: xxx
   [getSession] Membership found: true xxx-workspace-id
   [getSession] Returning session for: xxx workspace: xxx-workspace-id
   [API /session] Session found: {sub: "xxx", email: "xxx", workspace_id: "xxx"}
   ```

8. **Check PostHog Live Events**
   - Go to PostHog → Live Events
   - Look for `$identify` event from the new user
   - Click on the event, verify `distinct_id` matches the user_id

9. **Check PostHog Persons**
   - Go to PostHog → Persons
   - Search for the test email
   - Verify the person has been created with correct properties

### Expected Results

| Check | Expected |
|-------|----------|
| Console shows session fetch | `Response status: 200` with user data |
| Console shows identify push | `Pushing identify event for user: xxx` |
| `window.dataLayer` has identify event | `event: "posthog_identify"` present |
| Vercel logs show session | All `[getSession]` logs with user data |
| PostHog Live Events | `$identify` event for the user |
| PostHog Persons | Person created with email, workspace_id |

---

## Test 2: Existing User Login Flow

### Objective
Verify that an existing user also gets identified (important for cross-device sessions).

### Steps

1. **Use the same account from Test 1** (or another existing account like `v@getbeton.ai`)

2. **Open a NEW incognito window** (or clear cookies)

3. **Open DevTools → Console**

4. **Navigate to `https://test.getbeton.org/login`**

5. **Sign in with Google**

6. **After redirect to `/` (no `?signup=true`)**

   **In Browser Console, look for:**
   ```
   [SessionProvider] Session data received: {hasData: true, sub: "xxx", ...}
   [PostHog Identify] Pushing identify event for user: xxx
   [PostHog Identify] Event pushed successfully
   ```

7. **Verify PostHog Persons** shows the existing user

### Expected Results

| Check | Expected |
|-------|----------|
| Session fetched successfully | Yes, with all fields |
| Identify event pushed | Yes |
| PostHog shows user | Identified (not anonymous) |

---

## Test 3: Session Persistence (Page Refresh)

### Objective
Verify that identify doesn't fire multiple times on refresh.

### Steps

1. **While logged in, refresh the page** (Ctrl+R / Cmd+R)

2. **Check Console for:**
   ```
   [PostHog Identify] Already identified this user, skipping
   ```
   OR
   ```
   [PostHog Identify] PostHog says already identified, skipping
   ```

### Expected Results

| Check | Expected |
|-------|----------|
| Identify event NOT re-pushed | One of the "skipping" messages appears |

---

## Test 4: Logout and Reset

### Objective
Verify that PostHog identity is reset on logout.

### Steps

1. **Click the user menu → Sign Out**

2. **Check Console for:**
   ```
   [PostHog Identify] User logged out, resetting PostHog
   ```

3. **Check `window.dataLayer` for:**
   ```javascript
   {event: "posthog_reset"}
   ```

4. **PostHog Live Events** should show a new anonymous distinct_id after logout

---

## Troubleshooting Flowchart

```
Does SessionProvider show "Response status: 200"?
├── NO → Check Vercel logs for [API /session] errors
│        → Possible: Auth cookie not set, Supabase auth issue
│
└── YES → Does SessionProvider show valid session data (sub, email)?
          ├── NO → Check [getSession] logs for auth errors
          │        → Possible: Supabase auth.getUser() failing
          │
          └── YES → Does session data include workspace_id?
                    ├── NO → Check [getSession] workspace membership query error
                    │        → Possible: RLS policy blocking SELECT
                    │        → Check Supabase RLS policies
                    │
                    └── YES → Does PostHog Identify log show "Pushing identify event"?
                              ├── NO → Check for "skipping" messages
                              │        → Possible: Already identified, or session.sub missing
                              │
                              └── YES → Is the event in window.dataLayer?
                                        ├── NO → Check pushToDataLayer function
                                        │
                                        └── YES → Is user identified in PostHog?
                                                  ├── NO → GTM tag issue!
                                                  │        → Check GTM "PostHog - Identify User" tag
                                                  │        → Verify posthog.identify() is called
                                                  │
                                                  └── YES → SUCCESS!
```

---

## Common Issues and Solutions

### Issue: Session returns 401 for new users

**Symptom:** `[SessionProvider] Response status: 401`

**Cause:** Auth cookie not present in the request after OAuth redirect.

**Check:**
1. In DevTools → Application → Cookies, look for `sb-*` cookie
2. Verify cookie domain matches the site domain

**Solution:** May need to check middleware cookie handling or Supabase auth config.

---

### Issue: Session has no workspace_id

**Symptom:**
```
[getSession] Workspace membership query error: PGRST116 "The result contains 0 rows"
```

**Cause:** Workspace was not created for the user, or RLS is blocking the read.

**Check:**
1. In Supabase Dashboard → Table Editor → workspace_members
2. Search for the user_id
3. If no row exists, the auth callback workspace creation failed

**Solution:** Check auth callback logs, verify admin client is being used for workspace creation.

---

### Issue: Identify event pushed but user still anonymous in PostHog

**Symptom:**
- Console shows `[PostHog Identify] Event pushed successfully`
- `window.dataLayer` contains the `posthog_identify` event
- But PostHog shows user as anonymous

**Cause:** GTM is not processing the event correctly.

**Check:**
1. Open GTM Preview mode on test.getbeton.org
2. Look for "PostHog - Identify User" tag firing
3. Check if posthog.identify() is being called in the tag

**Solution:** Verify GTM configuration matches docs/POSTHOG_GTM_CONFIGURATION.md

---

### Issue: `[PostHog Identify] PostHog says already identified, skipping`

**Symptom:** Identify is skipped even for a new user.

**Cause:** PostHog SDK thinks the user is already identified (from a previous session or cookie).

**Check:**
1. In Console, type: `posthog.get_distinct_id()`
2. Check if it's a user ID (UUID) or an anonymous ID

**Solution:** Clear PostHog cookies and retry. The `posthog?._isIdentified?.()` check may be too aggressive.

---

## Reporting Results

After running all tests, document:

1. **Test environment:** URL, date/time, browser
2. **Console output:** Copy/paste relevant debug logs
3. **Screenshots:** DevTools Console, PostHog Persons view
4. **Vercel logs:** Relevant server-side logs (last 10 minutes)
5. **Result:** PASS/FAIL for each test

Share this information for further debugging if issues persist.
