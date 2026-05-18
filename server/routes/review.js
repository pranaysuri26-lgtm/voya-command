const express = require('express')
const router = express.Router()
const { requireAuth } = require('../middleware/auth')
const agentManager = require('../agents/agentManager')
const broadcast = require('../ws/broadcast')

// ─── App context sent to every agent ─────────────────────────────────────────
// Keep this up to date as the app evolves.

const APP_CONTEXT = `
## App under review: vondrer.com

**What Vondrer is:** AI-powered travel discovery app. Surfaces hidden-gem destinations matched to the user's budget, travel style, and offbeat preference. Freemium: 3 destinations free, rest locked behind a Pro paywall (not yet live).

**Current stack:**
- Next.js 16 (App Router) on Vercel
- Supabase (auth + Postgres DB)
- Claude API (claude-opus-4-5) for AI recommendations
- Tailwind CSS, Cormorant Garamond + Raleway fonts
- Domain: vondrer.com | Hub: hub.vondrer.com

**Full user flow (live today):**
1. vondrer.com → Santorini landing page (concept-7 HTML) with BEGIN CTA
2. /signup → 8-step onboarding: account → location (with live currency detection) → budget (shown in local currency) → trip duration → group type → interests (6 options) → offbeat slider (1–5) → past trips
3. /discover → AI loading screen (animated compass, cycling copy) → 5–10 destination cards ranked by match score. Cards show: name, country, match %, reasons (2-3 tags), budget/day in user's local currency, best time to visit, gem score dots. First 3 unlocked, rest blurred/locked with unlock CTA.
4. /profile → Edit all preferences + past trips. Saving invalidates AI cache, triggering fresh recommendations on next /discover visit.

**What's NOT built yet:**
- Stripe paywall (unlock banner shows "coming soon")
- Destination detail page / AI itinerary
- Booking affiliate links (Booking.com, Skyscanner)
- Vondrer Passport feature
- Google OAuth (broken — redirect_uri_mismatch, fix pending)
- Mobile PWA config

**Known issues:**
- Google OAuth blocked (redirect URI not added to Google Cloud Console yet)
- vondrer.com landing page shows our React fallback instead of Santorini HTML on some cached clients (middleware rewrite deployed, propagating)

**AI recommendation engine:**
- Profile hash (SHA-256) of all onboarding inputs + past trips used as cache key
- Cache invalidated on profile save
- Claude prompt includes: home country, budget (human-readable label), duration, group type, interests, offbeat score description, past trips exclusion list
- Fallback: stale cache served if Claude fails twice

**Business model:**
- Free tier: 3 destination cards visible
- Pro tier (planned): all destinations + itineraries + booking links — $9/month via Stripe
- API cost target: under $0.08/session
`

// ─── Per-agent review focus ───────────────────────────────────────────────────

const REVIEW_PROMPTS = {
  CPO: `Review the Vondrer app from your CPO lens. Focus on: onboarding flow quality, user drop-off risks at each step, the locked/unlocked card UX, whether the free tier delivers enough value to convert, and what's missing before the first paying user. Be direct. Flag what would make you personally bounce as a user.`,

  CMO: `Review the Vondrer app from your CMO lens. Focus on: landing page copy and conversion, whether the brand comes through in the app, the "wow moment" (does it exist? when?), shareability of the discover results, and what the #1 acquisition hook should be. Be brutal about what won't make someone screenshot it.`,

  CTO: `Review the Vondrer app from your CTO lens. Focus on: architectural decisions (Next.js App Router, Supabase, Claude API), the hash-based recommendation cache design, potential security issues, performance risks at scale, and what you'd refactor first. Also flag whether the current stack can support the full roadmap (paywall, itineraries, booking links, passport).`,

  CFO: `Review the Vondrer app from your CFO lens. Focus on: Claude API cost per user session, what the burn looks like at 100 / 1,000 / 10,000 users, whether the free tier is too generous or not generous enough, and the unit economics of $9/month Pro. Give numbers where you can estimate them.`,

  COO: `Review the Vondrer app from your COO lens. Synthesize what's shipped, what's missing, and give a clear prioritised list of what needs to happen before the VP demo is considered a success and before the first paying user can exist. End with your top 3 actions for this week.`,
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
