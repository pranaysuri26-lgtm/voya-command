// ─── Board Brief shared prompts ───────────────────────────────────────────────
// Used by both routes/boardbrief.js (on-demand) and agents/scheduler.js (Monday 8am cron).
// Keep BRIEF_APP_CONTEXT in sync with review.js APP_CONTEXT.

const BRIEF_APP_CONTEXT = `
## Current state of Vondrer — vondrer.com
*Last updated: May 2026*

**What Vondrer is:** AI-first travel planner covering the full trip lifecycle — destination discovery → day-by-day itinerary → in-trip replanning → day-of live planner → passport stamps. Not just a discovery app.

**Stack:** Next.js 16.2 (App Router, React 19) · Supabase (auth + Postgres + RLS) · Claude Haiku 4.5 (itinerary, visa, chat) · GPT-4o (recommendations, guide, deals) · GPT-4o-mini (alternatives, day planner) · Tailwind CSS 4 · Vercel (app) · Railway (hub) · PWA with service worker

**What's fully shipped:**
- 7-step onboarding with live currency detection
- SSE-streamed destination recommendations (GPT-4o), first 3 free, rest locked
- Full day-by-day itinerary generation (Claude Haiku) with flight/hotel pre-trip info
- Activity swap — 3 alternatives per slot (GPT-4o-mini)
- Visa intelligence (Claude Haiku per passport + destination)
- Budget tracker (planned vs actual per category)
- Trip-specific AI chat (Claude Haiku streaming)
- Smart day planner with weather + time budget
- Inspiration extractor (URL/text/image → auto-fill trip form)
- Shareable trip links (public, no login)
- Local intel guide (GPT-4o + Wikipedia images)
- Daily deals — 12 personalised AI deals (GPT-4o)
- Developer API with Bearer key auth (Pro only)
- Global AI chat bar (Pro only)
- PWA offline support

**What is NOT yet built:**
- Stripe /pro/checkout — BIGGEST BLOCKER. All upgrade buttons go to 404.
- Trip limit enforcement — free cap is 5 trips but UNENFORCED. Free users generate unlimited itineraries at full AI cost.
- Pro gates on Budget Tracker + Visa Intel — currently free for everyone
- Passport stamp triggers — UI exists, zero logic
- Real-time collaboration — Supabase Realtime not wired
- Live trip mode — stub only

**Pricing (DECIDED — closed, do not reopen):**
- Free: 3 destination recs visible, 5 trips total (unenforced)
- Pro: $4.99/month
- Annual: $29/year (save 52%)

**AI cost (actual measured):**
- Itinerary (Claude Haiku): ~$0.006/generation
- Recommendations (GPT-4o): ~$0.027/call
- Active session with chat: ~$0.04–0.12 total

**Critical financial exposure right now:** Free users can generate unlimited itineraries at full AI cost with zero revenue. This scales badly the moment any marketing drives traffic.
`

const BRIEF_PROMPTS = {
  CPO: `This is your weekly board brief — not a review request.

Based on everything you know about Vondrer's product, user journey, onboarding flow, and roadmap, answer this question honestly:

What is the ONE product assumption, user behaviour hypothesis, or roadmap decision that you believe is wrong or unvalidated — and that the Chairman has not asked you about yet?

Do not summarise what's been done. Do not give a status update. Surface the risk you've been sitting on. Be specific. One to three paragraphs maximum.`,

  CMO: `This is your weekly board brief — not a review request.

Based on everything you know about Vondrer's brand, positioning, landing page, and go-to-market plan, answer this question honestly:

What is the ONE marketing or brand risk, missed acquisition opportunity, or positioning mistake that you need to raise this week — unprompted, because nobody asked you about it?

Do not summarise campaigns or completed work. Surface what you're worried about. Be specific. One to three paragraphs maximum.`,

  CTO: `This is your weekly board brief — not a review request.

Based on everything you know about Vondrer's stack, architecture, AI integration, and technical roadmap, answer this question honestly:

What is the ONE technical decision, architectural risk, or cost assumption that is either wrong, underestimated, or heading toward a wall — and that the Chairman hasn't explicitly asked you about?

Do not summarise what's been built. Surface the technical debt or risk you'd flag in a real CTO weekly. Be specific. One to three paragraphs maximum.`,

  CFO: `This is your weekly board brief — not a review request.

Based on everything you know about Vondrer's cost structure, pricing model, unit economics, and burn, answer this question honestly:

What is the ONE financial assumption, pricing model flaw, or unit economics problem that you need to put on the table this week — without being asked?

Do not summarise burn or costs. Give the Chairman the number or assumption they haven't questioned yet but should. Be specific. One to three paragraphs maximum.`,

  COO: `This is your weekly board brief — not a review request.

Based on everything you know about Vondrer's execution velocity, cross-functional dependencies, and the gap between what's planned and what's shipped, answer this question honestly:

What is the ONE execution risk, ownership gap, or decision that is currently blocking progress toward the first paying user — and that nobody has formally raised?

Do not give a status update. Identify what's falling through the cracks. Be specific. One to three paragraphs maximum.`,
}

module.exports = { BRIEF_APP_CONTEXT, BRIEF_PROMPTS }
