-- ============================================================
-- VOYA SUPABASE SCHEMA — FINAL
-- Confirmed: 2026-05-05
-- Onboarding questions locked. All tables complete.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- PROFILES
-- Extended from Supabase auth.users
-- ============================================================
CREATE TABLE profiles (
  id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email           TEXT NOT NULL,
  full_name       TEXT,
  avatar_url      TEXT,
  onboarding_done BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-create profile when a new user signs up
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- SUBSCRIPTIONS
-- One row per user. Free by default. Stripe fields populated on upgrade.
-- ============================================================
CREATE TABLE subscriptions (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id                 UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  stripe_customer_id      TEXT UNIQUE,
  stripe_subscription_id  TEXT UNIQUE,
  stripe_price_id         TEXT,
  plan                    TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro')),
  status                  TEXT NOT NULL DEFAULT 'active'
                            CHECK (status IN ('active', 'canceled', 'past_due', 'trialing', 'incomplete')),
  current_period_start    TIMESTAMPTZ,
  current_period_end      TIMESTAMPTZ,
  cancel_at_period_end    BOOLEAN DEFAULT FALSE,
  trial_end               TIMESTAMPTZ, -- launch promo: 6 months free for first 15 users
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  updated_at              TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-create free subscription on profile creation
CREATE OR REPLACE FUNCTION handle_new_profile()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.subscriptions (user_id, plan, status)
  VALUES (NEW.id, 'free', 'active');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_profile_created
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION handle_new_profile();

-- ============================================================
-- DESTINATIONS
-- Defined BEFORE user_trips to resolve foreign key dependency
-- ============================================================
CREATE TABLE destinations (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name                  TEXT NOT NULL,
  country               TEXT NOT NULL,
  region                TEXT NOT NULL
                          CHECK (region IN ('europe','asia','americas','africa','oceania','middle-east')),
  slug                  TEXT UNIQUE NOT NULL, -- URL: /destination/kotor-montenegro

  -- Budget
  budget_per_day_usd_min  INT,
  budget_per_day_usd_max  INT,

  -- Voya scoring
  hidden_gem_score      INT CHECK (hidden_gem_score BETWEEN 1 AND 10), -- 10 = truly unknown
  popularity_rank       INT, -- lower number = more touristy

  -- Timing
  best_months           TEXT[],  -- ['october','november','march']
  avoid_months          TEXT[],  -- peak crowds or bad weather

  -- Matching tags
  tags                  TEXT[],
  -- valid values: 'adventure','culture','local-food','photography',
  --               'slow-travel','hidden-gem','beaches','mountains',
  --               'architecture','nightlife','budget','luxury'

  -- Content
  tagline               TEXT,       -- "The lake town Europe hasn't ruined yet"
  hero_image_url        TEXT,
  country_flag          TEXT,       -- emoji flag 🇲🇪

  is_active             BOOLEAN DEFAULT TRUE,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ONBOARDING RESPONSES
-- Confirmed 5 questions — 2026-05-05
-- session_id supports pre-auth capture, linked after signup
-- ============================================================
CREATE TABLE onboarding_responses (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID REFERENCES profiles(id) ON DELETE CASCADE,
  session_id      TEXT, -- anonymous session before auth completes

  -- Q1: Daily travel budget (currency shown on frontend, stored as USD range)
  budget_per_day  TEXT NOT NULL
                    CHECK (budget_per_day IN ('under-20','20-50','50-150','150-300','300+')),

  -- Q2: Trip duration
  trip_duration   TEXT NOT NULL
                    CHECK (trip_duration IN ('weekend','1-week','2-weeks','month+')),

  -- Q3: How do you travel
  group_type      TEXT NOT NULL
                    CHECK (group_type IN ('solo','couple','small-group')),

  -- Q4: What matters most (multi-select)
  interests       TEXT[] NOT NULL DEFAULT '{}',
  -- valid values: 'hidden-gems','local-food','adventure',
  --               'culture','slow-travel','photography'

  -- Q5: How far off the beaten path (slider 1–5)
  offbeat_score   INT NOT NULL CHECK (offbeat_score BETWEEN 1 AND 5),
  -- 1 = tourist-friendly, 5 = truly unknown

  created_at      TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id) -- one response set per user, updatable
);

-- ============================================================
-- PAST TRIPS
-- Entered during onboarding Step 3. Separate table keeps the
-- query clean and past_trips MUST be hashed into profile_hash
-- to invalidate recommendations when new trips are added.
-- ============================================================
CREATE TABLE past_trips (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id          UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  destination_name TEXT NOT NULL,
  country          TEXT,
  visited_at       DATE,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_past_trips_user_id ON past_trips(user_id);

-- ============================================================
-- USER TRIPS (live trip tracking — separate from past_trips)
-- Depends on destinations — defined above
-- ============================================================
CREATE TABLE user_trips (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id          UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  destination_id   UUID REFERENCES destinations(id) ON DELETE SET NULL,
  destination_name TEXT NOT NULL,
  country          TEXT,
  region           TEXT,
  status           TEXT NOT NULL DEFAULT 'planned'
                     CHECK (status IN ('planned','booked','completed')),
  travel_date      DATE,
  notes            TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- RECOMMENDATIONS
-- One active set per user. Hash-cached — only regenerates when
-- the user's profile or past trips change. Confirmed architecture.
-- ============================================================
CREATE TABLE recommendations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  destinations  JSONB NOT NULL,
  -- Array of { name, country, match_score, reasons[], budget_per_day_usd,
  --            best_time_to_visit, hidden_gem_score }
  profile_hash  TEXT NOT NULL,
  -- SHA-256 of { budget_per_day, trip_duration, group_type,
  --              interests.sort(), offbeat_score, past_trips.sort() }
  generated_at  TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id) -- one active recommendation set per user
);

CREATE INDEX idx_recommendations_user_hash ON recommendations(user_id, profile_hash);

-- ============================================================
-- ITINERARIES
-- Day-by-day AI plan per destination. Generated on demand
-- when a user opens destination detail. Cached after first gen.
-- ============================================================
CREATE TABLE itineraries (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id          UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  destination_name TEXT NOT NULL,
  country          TEXT NOT NULL,

  duration_days    INT NOT NULL,
  days             JSONB NOT NULL,
  -- [{ "day": 1, "title": "Arrival", "morning": "...", "afternoon": "...", "evening": "..." }]

  booking_links    JSONB,
  -- { "flights": "https://skyscanner.com/...", "hotels": "https://booking.com/..." }

  generated_at     TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, destination_name)
);

-- ============================================================
-- PASSPORT STAMPS
-- Created when a user marks a trip as completed
-- ============================================================
CREATE TABLE passport_stamps (
  id                       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id                  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  destination_id           UUID REFERENCES destinations(id) ON DELETE SET NULL,
  destination_name         TEXT NOT NULL,
  country                  TEXT NOT NULL,
  country_flag             TEXT, -- emoji

  -- Trip link
  trip_id                  UUID REFERENCES user_trips(id) ON DELETE SET NULL,
  visited_date             DATE,

  -- Voya context
  is_hidden_gem            BOOLEAN DEFAULT FALSE,  -- destination gem score >= 8
  was_voya_recommendation  BOOLEAN DEFAULT FALSE,  -- came from a Voya rec

  -- AI memory line
  ai_memory                TEXT,
  -- "You found Kotor before everyone else did."

  -- Phase 2: sharing
  is_public                BOOLEAN DEFAULT FALSE,
  share_token              TEXT UNIQUE DEFAULT gen_random_uuid()::TEXT,

  created_at               TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, destination_id, visited_date) -- no duplicate stamps
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX idx_subscriptions_user_id        ON subscriptions(user_id);
CREATE INDEX idx_subscriptions_stripe_cust    ON subscriptions(stripe_customer_id);
CREATE INDEX idx_subscriptions_status         ON subscriptions(plan, status);
CREATE INDEX idx_onboarding_user_id           ON onboarding_responses(user_id);
CREATE INDEX idx_onboarding_session_id        ON onboarding_responses(session_id);
CREATE INDEX idx_user_trips_user_id           ON user_trips(user_id);
CREATE INDEX idx_user_trips_status            ON user_trips(user_id, status);
CREATE INDEX idx_itineraries_user             ON itineraries(user_id);
CREATE INDEX idx_passport_stamps_user_id      ON passport_stamps(user_id);
CREATE INDEX idx_destinations_region          ON destinations(region);
CREATE INDEX idx_destinations_gem_score       ON destinations(hidden_gem_score DESC);
CREATE INDEX idx_destinations_tags            ON destinations USING GIN(tags);
CREATE INDEX idx_destinations_active          ON destinations(is_active) WHERE is_active = TRUE;

-- ============================================================
-- ROW LEVEL SECURITY
-- Every table locked down. Users only see their own data.
-- ============================================================
ALTER TABLE profiles              ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_responses  ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_trips            ENABLE ROW LEVEL SECURITY;
ALTER TABLE past_trips            ENABLE ROW LEVEL SECURITY;
ALTER TABLE recommendations       ENABLE ROW LEVEL SECURITY;
ALTER TABLE itineraries           ENABLE ROW LEVEL SECURITY;
ALTER TABLE passport_stamps       ENABLE ROW LEVEL SECURITY;
ALTER TABLE destinations          ENABLE ROW LEVEL SECURITY;

-- Profiles: read + update own row only
CREATE POLICY "profiles_own"
  ON profiles FOR ALL USING (auth.uid() = id);

-- Subscriptions: read own only (writes via service role from Stripe webhook)
CREATE POLICY "subscriptions_own"
  ON subscriptions FOR SELECT USING (auth.uid() = user_id);

-- Onboarding: full access to own row
CREATE POLICY "onboarding_own"
  ON onboarding_responses FOR ALL USING (auth.uid() = user_id);

-- User trips: full access to own rows
CREATE POLICY "trips_own"
  ON user_trips FOR ALL USING (auth.uid() = user_id);

-- Past trips: full access to own rows
CREATE POLICY "past_trips_own"
  ON past_trips FOR ALL USING (auth.uid() = user_id);

-- Recommendations: read/write own row only (one row per user)
CREATE POLICY "recs_own"
  ON recommendations FOR ALL USING (auth.uid() = user_id);

-- Itineraries: full access to own
CREATE POLICY "itineraries_own"
  ON itineraries FOR ALL USING (auth.uid() = user_id);

-- Passport stamps: own + public stamps readable by all authenticated users
CREATE POLICY "stamps_own"
  ON passport_stamps FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "stamps_public_read"
  ON passport_stamps FOR SELECT USING (is_public = TRUE);

-- Destinations: readable by all authenticated users, writable by service role only
CREATE POLICY "destinations_authenticated_read"
  ON destinations FOR SELECT USING (auth.role() = 'authenticated');
