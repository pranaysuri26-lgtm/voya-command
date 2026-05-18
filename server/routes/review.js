const express = require('express')
const router = express.Router()
const { requireAuth } = require('../middleware/auth')
const agentManager = require('../agents/agentManager')
const broadcast = require('../ws/broadcast')

// ─── App context sent to every agent ─────────────────────────────────────────
// Keep this up to date as the app evolves.

const APP_CONTEXT = `
## App under review: vondrer.com
*Last updated: May 2026*

**What Vondrer is:** AI-first travel planner covering the full trip lifecycle — destination discovery → day-by-day itinerary generation → in-trip smart replanning → day-of live planner → post-trip passport stamps. Not just a discovery app.

**Stack (production):**
- Next.js 16.2 (App Router, React 19) on Vercel
- Supabase (auth + Postgres + RLS)
- AI split: Claude Haiku 4.5 (itinerary generation, visa intel, trip chat, inspiration extraction) + GPT-4o (destination recommendations via SSE streaming, local guide, daily deals) + GPT-4o-mini (activity alternatives, smart day planner)
- Free external APIs: Nominatim geocoding, Open-Meteo weather, Wikipedia images, sunrise-sunset.org (golden hour)
- Tailwind CSS 4, Cormorant Garamond + Raleway fonts
- Domain: vondrer.com | Hub: hub.vondrer.com
- PWA: service worker, offline fallback, installable

**Full user flow (live today):**
1. vondrer.com → landing page → /login or /signup
2. /signup → 7-step onboarding: account → location (live currency detection) → budget → duration → group type → interests → dietary/offbeat/timing/past trips
3. /discover → SSE-streamed destination cards ranked by match score. Cards: name, country, match %, gem score, budget/day in local currency, best time. First 3 free, rest locked.
4. /plan/new → multi-step trip creation (destinations, dates, budget, group, accessibility)
5. /plan/ask → conversational day planner with Leaflet map, golden hour times, dietary badges
6. /trip/[token] → shareable itinerary: day-by-day tabs (morning/afternoon/dinner/evening), insider tips, costs, map pins, activity swap (3 alternatives per slot), trip-specific AI chat
7. /trips → trip list, mark complete, delete
8. /guide → local intel (airports, neighbourhoods, food, accommodation, tips) — GPT-4o + Wikipedia images
9. /deals → 12 AI-generated personalised deals daily (flights, hotels, cards, alerts)
10. /passport → stamp collection UI (placeholder — logic not yet built)
11. /developer → API key management (Pro only), Bearer auth, SHA-256 hashing

**What IS built (complete):**
- Full itinerary generation (Claude Haiku) with pre-trip flight/hotel recommendations
- Inline activity swap — 3 alternatives per slot (GPT-4o-mini)
- Visa intelligence — Claude-powered per passport + destination
- Budget tracker — planned vs actual per category
- Trip-specific AI chat (Claude Haiku streaming)
- Smart day planner with real-time weather + time budget (GPT-4o-mini)
- Inspiration extractor — paste URL/text/image → auto-fill trip form (Claude Haiku vision)
- Shareable trip links (public, no login required)
- Developer API with Bearer key auth (Pro only, SHA-256 hashed, 5 keys max)
- PWA service worker + offline fallback

**What is NOT fully built yet:**
- Stripe /pro/checkout (dead link — the single biggest revenue blocker)
- Trip limit enforcement (free cap = 5 trips, NOT enforced in code — unlimited itinerary generation at full AI cost)
- Pro gates on Budget Tracker + Visa Intel (currently accessible by free users)
- Passport stamp triggers (beautiful UI exists, zero logic)
- Real-time collaboration (Supabase Realtime not yet wired)
- Live trip mode (stub only)

**Pricing (DECIDED — do not reopen):**
- Free: 3 destination recs, 5 trips total (unenforced)
- Pro: $4.99/month
- Annual: $29/year (~$2.42/month, save 52%)
- API access: Pro+ only (or Annual plan)

**AI cost per call (actual):**
- Itinerary (Claude Haiku): ~$0.006 per generation (3K in + 4K out)
- Recommendations (GPT-4o): ~$0.027 per call (1K in + 1.5K out)
- Combined active session with chat: ~$0.04–0.12

**Admin accounts (always Pro, no locks):** pranaysuri26@gmail.com, sehgalnavina09@gmail.com
`

// ─── Per-agent review focus ───────────────────────────────────────────────────

const REVIEW_PROMPTS = {
  CPO: `Review the Vondrer app from your CPO lens. The core product is substantially built — itinerary generation, activity swaps, visa intel, budget tracker, day planner, API access, and PWA are all live. Focus on: (1) whether the free→Pro conversion funnel is working given the current feature set, (2) which of the unbuilt features (passport stamps, live trip mode, real-time collab) has the highest retention impact, (3) the biggest UX risk in the current trip creation flow. Do not raise Stripe — that's a known blocker. Flag the product risks nobody is talking about.`,

  CMO: `Review the Vondrer app from your CMO lens. The product is now a full AI travel planner — not just a discovery app. Shareable trip links, passport stamps (UI exists), and AI itineraries are the viral loops. Focus on: (1) whether the current positioning at vondrer.com reflects the full product or just the discovery feature, (2) the strongest organic acquisition hook in what's already built, (3) what a user would share and why. Be specific about what needs to change in copy or UX to make the product feel premium rather than a prototype.`,

  CTO: `Review the Vondrer app from your CTO lens. The stack is Next.js 16 + Supabase + Claude Haiku (structured JSON) + GPT-4o (recommendations/guide/deals) + GPT-4o-mini (alternatives/day planner). Focus on: (1) the biggest unaddressed security or performance risk now that the product has API key auth and public shareable trip links, (2) whether the AI model split is optimal for cost vs quality, (3) what breaks first under real user load. Do not raise trip limit enforcement — that's already flagged. Find the technical debt nobody is watching.`,

  CFO: `Review the Vondrer app from your CFO lens. Pricing is decided: $4.99/month, $29/year. AI costs are: ~$0.006/itinerary (Claude Haiku), ~$0.027/recommendations call (GPT-4o). The critical exposure is that free users can generate unlimited itineraries at full AI cost with zero revenue — trip limits are unenforced. Focus on: (1) what the actual burn looks like at 100/1,000 free users given current unlimited access, (2) whether $4.99/month holds as the right price given the feature depth now shipped, (3) the annual plan unit economics at $29/year. Give numbers.`,

  COO: `Review the Vondrer app from your COO lens. The product is feature-complete enough to charge. The gap to first revenue is: (1) Stripe /pro/checkout not built, (2) trip limit unenforced, (3) Pro gates missing on Budget Tracker + Visa Intel. Give a crisp prioritised execution plan for the next 2 weeks with clear owners and what unblocks what. End with your single most important call for the Chairman to make this week.`,
}

// ─── POST /review/app ─────────────────────────────────────────────────────────
// Triggers all 5 agents to review vondrer.com simultaneously.
// Streams each response to the hub via WebSocket as it arrives.

router.post('/app', requireAuth, async (req, res) => {
  const agents = ['CPO', 'CMO', 'CTO', 'CFO', 'COO']

  // Acknowledge immediately — reviews stream async
  res.json({ status: 'started', agents })

  broadcast.broadcast('review-started', {
    message: 'Board app review initiated — all agents reviewing vondrer.com',
    agents,
    timestamp: new Date().toISOString(),
  })

  // Run all agents in parallel
  await Promise.allSettled(
    agents.map(async (agent) => {
      try {
        broadcast.broadcast('review-agent-thinking', { agent, timestamp: new Date().toISOString() })

        const prompt = `${APP_CONTEXT}\n\n---\n\nYOUR REVIEW TASK:\n${REVIEW_PROMPTS[agent]}`
        const result = await agentManager.sendMessage(agent, prompt, 'review', [], 'chairman', null, 'review')

        broadcast.broadcast('agent-message', {
          agent,
          content: result.content,
          role: 'agent',
          source: 'review',
          isShared: true,
          timestamp: new Date().toISOString(),
        })
      } catch (err) {
        console.error(`[Review] ${agent} failed:`, err.message)
        broadcast.broadcast('review-agent-error', { agent, error: err.message })
      }
    })
  )

  broadcast.broadcast('review-complete', {
    message: 'Board review complete.',
    timestamp: new Date().toISOString(),
  })
})

module.exports = router
