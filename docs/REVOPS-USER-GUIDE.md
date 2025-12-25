# Beton RevOps Dashboard User Guide

## Overview

Beton automatically detects **product-qualified signals** from your PostHog analytics and creates **native PostHog dashboards** that prove PQL value to your sales team.

This guide explains what each signal means, how to interpret the dashboards, and how to take action on high-priority signals.

---

## The 8 Signal Types

### 1. 🚀 Usage Spike

**What It Means**: Account activity increased >50% week-over-week

**Why It Matters**:
- Indicates sudden increase in product engagement
- Often precedes expansion purchases or contract renewals
- Shows account is achieving value quickly

**How to Act**:
- Check if new team members joined
- Verify they're using key features (not just trial-running)
- Reach out with case studies of similar companies
- Ask about upcoming budget or project

**Base Score**: 25 points

---

### 2. 💰 Pricing Intent

**What It Means**: User visited pricing/upgrade pages 2+ times in past 7 days

**Why It Matters**:
- Strongest behavioral signal for imminent purchase
- Shows buyer is seriously considering upgrade
- Timing is critical - reach out within 24 hours

**How to Act**:
- IMMEDIATE: Call or email within same business day
- Ask if they have questions about plans
- Offer a custom demo if they visited but didn't click
- Have pricing/ROI docs ready

**Base Score**: 30 points

---

### 3. 📱 Feature Adoption

**What It Means**: Account adopted 3+ new features this week

**Why It Matters**:
- Broad feature adoption = strong product-market fit
- Early adopters are more likely to buy
- Indicates they're exploring advanced capabilities
- Shows engagement across team

**How to Act**:
- Celebrate their progress (send congratulatory note)
- Suggest features that align with their usage pattern
- Ask if there are features they wish existed
- Propose advanced training or professional services

**Base Score**: 20 points

---

### 4. ⛔ Limit Approaching

**What It Means**: Account using >80% of plan limits (seats, API calls, storage, etc.)

**Why It Matters**:
- Hard blocker signal - they MUST upgrade or leave
- Often causes angry support tickets if ignored
- Opportunity to show ROI of paid plan
- Shows strong product engagement

**How to Act**:
- URGENT: Proactive outreach before they hit limit
- Show them cost savings of upgraded plan
- Offer trial of higher tier with no commitment
- Have implementation plan ready if they upgrade

**Base Score**: 35 points

---

### 5. ⏰ Trial Expiring

**What It Means**: Free trial ends within 7 days AND account still has activity

**Why It Matters**:
- Final chance to convert before they lose access
- Active usage = they've found value
- Shows clear purchase intent (they're staying engaged)
- Highest urgency of all signals

**How to Act**:
- MOST URGENT: Call within 24 hours of signal
- Ask what their biggest blockers to purchase are
- Offer discount/extended trial if on fence
- Make it super easy to say yes (1-click checkout)

**Base Score**: 30 points

---

### 6. 👥 Team Growth

**What It Means**: 2+ new users added to account this week

**Why It Matters**:
- Expansion across team = deeper product integration
- Shows they're committed (adding more users)
- Indicates they're onboarding new functions/departments
- Buying signal for multi-user plans

**How to Act**:
- Congratulate them on team growth
- Offer bulk licensing discount for growing teams
- Suggest admin/training resources
- Propose team leads program or partner status

**Base Score**: 25 points

---

### 7. 💬 Support Engagement

**What It Means**: 3+ support interactions (Intercom, help articles, etc.) in past 14 days

**Why It Matters**:
- Indicates complex use case (not simple customer)
- More engagement = higher deal value potential
- Shows they're investing time to make it work
- Often precedes upsell discussions

**How to Act**:
- Loop in Customer Success on their next support ticket
- Ask "What would make this easier?" questions
- Propose consulting/implementation services
- Introduce them to power users in your community

**Base Score**: 15 points

---

### 8. 💳 Billing Intent

**What It Means**: User interacted with checkout, upgrade events, or billing pages

**Why It Matters**:
- Strongest intent signal aside from pricing visits
- Actually opened wallet/payment method
- May have failed payment or abandoned cart
- Immediate follow-up usually recovers the sale

**How to Act**:
- IMMEDIATE: Call if payment failed (technical issue?)
- Offer one-click retry with saved payment method
- Ask what went wrong if they abandoned
- May indicate pricing concerns - be ready with ROI conversation

**Base Score**: 40 points

---

## Dashboard Overview

### Dashboard 1: Signal Overview

**Purpose**: At-a-glance view of all signals firing this week

**Key Tiles**:
- **Signals Fired (7 Days)**: Total count of signals detected
  - 0-50: Low activity (may indicate disengaged base)
  - 50-200: Normal (healthy signal volume)
  - 200+: High activity (many opportunities)

- **Signal Distribution by Type**: Which types are most common?
  - If pricing intent is low: May not be ready to buy (nurture longer)
  - If usage spike is high: Your product is delivering value
  - If team growth is high: Land-and-expand motion working

- **Daily Signal Volume Trend**: Are signals increasing or decreasing?
  - Uptrend: More engagement → more revenue
  - Downtrend: Engagement declining → churn risk

- **Top Accounts by Signal Activity**: Which customers generate most signals?
  - These are your hottest leads
  - Prioritize your SDRs here

- **🔥 High Priority Signals (Score > 70)**: Your deal queue
  - Sorted by recency (newest first)
  - Click each to see what triggered it
  - Export to Attio deal queue

- **PQL Score Distribution**: Health of your signal pipeline
  - More in "Hot" (80-100) = more immediate revenue
  - More in "Warm" (60-79) = healthy nurture pipeline
  - Too many "Cold" (0-19) = need to improve activation

---

### Dashboard 2: Account Health & Usage

**Purpose**: Monitor which accounts are healthy (expanding) vs at-risk (churning)

**Key Tiles**:
- **Monthly Active Accounts**: Total engaged accounts
  - Compare to previous months (should trend up)
  - Divide by total customers = engagement rate

- **Weekly Active Accounts Trend**: Is engagement increasing or decreasing?
  - Flat or declining = need to reactivate
  - Increasing = successful activation

- **Accounts by Usage Tier**: Segmentation by team size
  - Enterprise (10+ users) = high ACV opportunity
  - Individual = upsell to team tier
  - Track migration between tiers

- **Top Features by Adoption**: Which features drive engagement?
  - Double down on top features in marketing
  - Under-adopted features need better onboarding
  - Use this to design upgrade value prop

- **📈 Usage Growth Leaders (WoW)**: Your expansion targets
  - These accounts are ready to buy more
  - Often the best candidates for upsell
  - May need custom features/support (services revenue)

- **⚠️ Declining Usage Accounts**: Your churn prevention list
  - Prioritize here for re-engagement campaigns
  - Send personalized check-in emails
  - Offer free training or new features
  - May indicate they found competing product

---

### Dashboard 3: PQL Performance

**Purpose**: Prove to CFO/CEO that PQL leads outperform other sources

**Available in Phase 3 - requires Attio integration**

**Key Tiles**:
- **Win Rate: PQL vs All Sources**
  - PQL target: 28%
  - Benchmark (other sources): 15%
  - Show this in every board meeting

- **Lead Source Comparison Table**
  - Compare: Volume, SQL conversion, win rate, cycle time, deal size
  - PQL should win on: win rate, cycle time, deal size
  - May lose on: volume (but higher quality = better)

- **Sales Cycle by Lead Source**
  - PQL target: 35 days
  - Shows PQL closes 2x faster
  - Means faster revenue realization

- **Pipeline Value by Lead Source**
  - Shows PQL contributes meaningful pipeline
  - Justifies continued investment in product activation

- **Monthly Win Rate Trend**
  - Should be increasing over time (as signals improve)
  - Show this to sales leadership

- **PQL → Closed Won Funnel**
  - Transparency into conversion rates at each stage
  - Identify bottleneck (often Sales stage)

---

### Dashboard 4: Backtesting Results

**Purpose**: Scientifically validate that Beton signals actually predict purchases

**Available in Phase 4**

**Key Metrics**:

| Metric | Definition | Target |
|--------|-----------|--------|
| **Precision** | Of signals we fired, % that became customers | > 60% |
| **Recall** | Of customers, % we identified as signals | > 65% |
| **Conversion by Score** | How well does score predict outcome? | 80-100 score: 40%+ conversion |
| **ROI** | Revenue from PQL vs cost of Beton | > 10x |

**How to Read**:
- High precision = fewer false positives (sales team happy)
- High recall = don't miss opportunities (revenue happy)
- Conversion by score = justifies score thresholds
- ROI = shows business value to CFO

**What You Can Tune**:
- Score buckets (are 60-79 really "warm"?)
- Signal weights (is pricing intent really worth 30?)
- Time windows (7-day window too short?)
- Contact frequency (how often to reach out?)

---

## Taking Action on Signals

### Action Playbook by Signal Type

#### 1. Usage Spike
- [ ] Check if new person logged in
- [ ] Did they use multiple features or just try one?
- [ ] Schedule "expansion check-in" call
- [ ] Send multi-feature case study email
- [ ] If no follow-up in 3 days, check in again

#### 2. Pricing Intent
- [ ] SAME DAY: Call or email
- [ ] Have they requested demo or talked to sales yet?
- [ ] If no, send 1-pager on plans + ROI
- [ ] Offer personalized quote with their usage data
- [ ] 24-hour follow-up if no response

#### 3. Feature Adoption
- [ ] Congrats email with relevant use cases
- [ ] Suggest 2 features they haven't tried yet
- [ ] Offer "advanced features" training
- [ ] Add to "power users" program
- [ ] Monthly tips on advanced features

#### 4. Limit Approaching
- [ ] URGENT: Proactive call before they hit limit
- [ ] Ask "what would you do with 2x more?"
- [ ] Show tier comparison with their usage data
- [ ] Special: Free trial of higher tier for 1 month
- [ ] Remove friction: 1-click upgrade path

#### 5. Trial Expiring
- [ ] MOST URGENT: Call within 24 hours
- [ ] Frame as "I want to make sure X works for you"
- [ ] Ask: biggest blockers to purchasing?
- [ ] If price: offer time-limited discount
- [ ] If feature: timeline on when available?
- [ ] Make buying easy: no long contract, 1-click approval

#### 6. Team Growth
- [ ] Celebrate with "congrats, your team is growing!" email
- [ ] Offer admin/power-user training
- [ ] Introduce team-based licensing discount
- [ ] Invite to customer advisory board
- [ ] Monthly engagement: new features, tips, community

#### 7. Support Engagement
- [ ] Add to high-touch CS track
- [ ] Schedule "how can we help you succeed" call
- [ ] Offer consulting for their use case
- [ ] Connect with customer community
- [ ] Follow up on support tickets with insights

#### 8. Billing Intent
- [ ] SAME DAY if payment failed: troubleshoot
- [ ] If abandoned checkout: "What went wrong?" email
- [ ] Offer "no-questions-asked" extended trial
- [ ] If price concern: ROI conversation
- [ ] Remove payment friction: multiple payment methods

---

## Signal Quality Assurance

### Interpreting Confidence

Beton scores on 0-100 scale:

- **80-100 (Hot 🔥)**: Very likely to buy
  - Action: Immediate sales outreach
  - Timing: Today or tomorrow
  - Approach: Direct value prop

- **60-79 (Warm 🔥)**: Likely to expand or buy
  - Action: Sales or CS outreach
  - Timing: This week
  - Approach: Ask about goals/challenges

- **40-59 (Nurture 📱)**: Shows engagement, not ready yet
  - Action: Content/education
  - Timing: Monthly tips/updates
  - Approach: Celebrate progress, share ideas

- **20-39 (Monitor 👀)**: Light engagement, early stage
  - Action: Automated email nurture
  - Timing: Weekly digest
  - Approach: Onboarding support, tips

- **0-19 (Cold ❄️)**: Minimal engagement
  - Action: Reactivation campaigns
  - Timing: Send only if dormant for 14+ days
  - Approach: "We miss you" style outreach

### Why You Might Disagree With Score

Signal may be wrong if:
- Account is in negotiation (limit approaching signal fired, but already talking to sales)
- Non-buyer person triggered signal (intern vs decision-maker)
- Competitor test (visiting pricing pages, but comparing options)
- False positive (bots, tests, accidental clicks)

**Report Issues**: Send feedback to Beton team on signals that don't result in deals.
We use this to improve signal accuracy.

---

## Best Practices

### Do's ✅

- **Route signals to sales immediately** (within 24 hours for pricing/billing/trial)
- **Personalize every outreach** with specific behavior you observed
- **Share backtesting results** with your sales team to build trust
- **Track signal → deal correlation** to show ROI
- **Adjust signal weights** based on what actually converts for you
- **Use signals to identify expansion** in your installed base
- **Celebrate signal hits** - these prove your product delivers value

### Don'ts ❌

- **Don't cold-call pure usage signals** (not all usage = buying signal)
- **Don't wait to act** on pricing/billing/trial signals (they're time-sensitive)
- **Don't spam** accounts with multiple signals (wait 3-7 days between touches)
- **Don't ignore churn signals** (declining usage is earlier warning than churn emails)
- **Don't blame signal on individuals** (maybe their manager isn't using it yet)
- **Don't expect 100% conversion** (60-70% precision is excellent)

---

## FAQ

**Q: Why is Signal X firing but the customer isn't interested?**
A: Signals are probabilistic, not deterministic. 60-70% precision is excellent. Some false positives are normal. Report patterns to us to improve weights.

**Q: Can we customize signals to our product?**
A: Phase 2 feature. Currently signals are fixed. Coming soon: custom signal builder.

**Q: How do I export signals to Salesforce?**
A: Phase 3: Automatic sync to Attio. Salesforce integration coming Q1 2026.

**Q: What if we don't use PostHog?**
A: Beton works with any analytics that exports to PostHog (Amplitude, Segment, etc.).

**Q: Can we adjust scoring weights?**
A: Phase 4. For now, reach out to Beton team and we'll tune for your use case.

**Q: What if customer has no PostHog data?**
A: Signals require 30+ days of baseline data. New customers won't see signals until data accumulates.

---

## Getting Help

**Questions about signals?** Email signals@getbeton.com

**Found a bug?** File issue at https://github.com/getbeton/inspector/issues

**Want custom signals?** Request feature at https://getbeton.com/feature-requests

---

**Last Updated**: Dec 25, 2025
**Version**: 1.0
