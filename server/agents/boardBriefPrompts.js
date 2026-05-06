// ─── Board Brief shared prompts ───────────────────────────────────────────────
// Used by both routes/boardbrief.js (on-demand) and agents/scheduler.js (Monday 8am cron).
// Keep BRIEF_APP_CONTEXT in sync with review.js APP_CONTEXT.

const BRIEF_APP_CONTEXT = `
## Current state of Voya — getvoya.net

**What Voya is:** AI-powered travel discovery app. Surfaces hidden-gem destinations matched to the user's budget, travel style, and offbeat preference. Freemium: 3 destinations free, rest locked behind a Pro paywall (not yet live).

**Stack:** Next.js 16 (App Router) · Supabase (auth + Postgres) · Claude Haiku (claude-haiku-4-5) · Tailwind CSS · Vercel (app) · Railway (hub)

**Live user flow:**
1. getvoya.net → landing page → /signup → 8-step onboarding (account, location, budget, duration, group, interests, offbeat 1–5, past trips)
2. /discover → loading screen → 5–10 ranked destination cards (name, country, match %, reasons, budget/day in local currency, best time, gem score)
3. Free: top 3 cards visible. Rest blurred with "coming soon" paywall CTA.
4. /profile → edit preferences → fresh recommendations on next visit.

**Stale-while-revalidate:** Stale results shown instantly; fresh Claude call runs in background and swaps in silently.

**Not built yet:** Stripe paywall · destination detail / itinerary · booking affiliate links · Voya Passport · Google OAuth (broken) · mobile PWA

**Pricing model (UNRESOLVED):** Currently planned as $9/month. All 5 agents have flagged this as structurally wrong — monthly subscription does not fit episodic travel use (1–2 trips/year). Decision between annual ($29/year), per-trip ($4.99 one-time), and per-itinerary pricing is OPEN and unresolved.

**AI cost:** claude-haiku-4-5, max_tokens 1500, target under $0.08/session. Cache hit = $0.

**Known issues:** Google OAuth blocked (redirect URI mismatch). Landing page hero (Santorini) contradicts anti-tourist brand.
`

const BRIEF_PROMPTS = {
  CPO: `This is your weekly board brief — not a review request.

Based on everything you know about Voya's product, user journey, onboarding flow, and roadmap, answer this question honestly:

What is the ONE product assumption, user behaviour hypothesis, or roadmap decision that you believe is wrong or unvalidated — and that the Chairman has not asked you about yet?

Do not summarise what's been done. Do not give a status update. Surface the risk you've been sitting on. Be specific. One to three paragraphs maximum.`,

  CMO: `This is your weekly board brief — not a review request.

Based on everything you know about Voya's brand, positioning, landing page, and go-to-market plan, answer this question honestly:

What is the ONE marketing or brand risk, missed acquisition opportunity, or positioning mistake that you need to raise this week — unprompted, because nobody asked you about it?

Do not summarise campaigns or completed work. Surface what you're worried about. Be specific. One to three paragraphs maximum.`,

  CTO: `This is your weekly board brief — not a review request.

Based on everything you know about Voya's stack, architecture, AI integration, and technical roadmap, answer this question honestly:

What is the ONE technical decision, architectural risk, or cost assumption that is either wrong, underestimated, or heading toward a wall — and that the Chairman hasn't explicitly asked you about?

Do not summarise what's been built. Surface the technical debt or risk you'd flag in a real CTO weekly. Be specific. One to three paragraphs maximum.`,

  CFO: `This is your weekly board brief — not a review request.

Based on everything you know about Voya's cost structure, pricing model, unit economics, and burn, answer this question honestly:

What is the ONE financial assumption, pricing model flaw, or unit economics problem that you need to put on the table this week — without being asked?

Do not summarise burn or costs. Give the Chairman the number or assumption they haven't questioned yet but should. Be specific. One to three paragraphs maximum.`,

  COO: `This is your weekly board brief — not a review request.

Based on everything you know about Voya's execution velocity, cross-functional dependencies, and the gap between what's planned and what's shipped, answer this question honestly:

What is the ONE execution risk, ownership gap, or decision that is currently blocking progress toward the first paying user — and that nobody has formally raised?

Do not give a status update. Identify what's falling through the cracks. Be specific. One to three paragraphs maximum.`,
}

module.exports = { BRIEF_APP_CONTEXT, BRIEF_PROMPTS }
