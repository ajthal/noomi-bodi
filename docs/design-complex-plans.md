# Design: Complex / Flexible Plans

## Overview

Support multi-phase nutrition plans with date-based or weight-milestone triggers, and day-specific macro targets (e.g., training vs rest days).

## Data Model

### `meal_plans` table (extends existing)

```sql
CREATE TABLE plan_phases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES user_plans(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phase_name TEXT NOT NULL,           -- e.g., "Cut Phase 1", "Maintenance"
  phase_order INT NOT NULL,           -- display/execution order

  -- Trigger: when does this phase start?
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('date', 'weight', 'manual')),
  trigger_date DATE,                  -- for 'date' trigger
  trigger_weight_kg NUMERIC(5,2),     -- for 'weight' trigger (start when user hits this weight)

  -- Default daily macros for this phase
  calories INT NOT NULL,
  protein_g INT NOT NULL,
  carbs_g INT NOT NULL,
  fat_g INT NOT NULL,

  -- Optional: end condition
  end_date DATE,
  end_weight_kg NUMERIC(5,2),

  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE day_type_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phase_id UUID NOT NULL REFERENCES plan_phases(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day_type TEXT NOT NULL,             -- e.g., "training", "rest", "refeed"
  days_of_week INT[] NOT NULL,        -- 0=Sun, 1=Mon, ..., 6=Sat

  -- Override macros for these days
  calories INT NOT NULL,
  protein_g INT NOT NULL,
  carbs_g INT NOT NULL,
  fat_g INT NOT NULL
);
```

### RLS Policies

- Users can only CRUD their own phases/overrides
- Admin can read all

## Resolution Logic

`resolveCurrentGoals(userId, date)`:

1. Fetch the active plan and its phases ordered by `phase_order`
2. Determine which phase is active:
   - For `trigger_type = 'date'`: check if `trigger_date <= today`
   - For `trigger_type = 'weight'`: check if latest weight log meets the threshold
   - For `trigger_type = 'manual'`: user explicitly activates
3. Within the active phase, check if today's day-of-week has a `day_type_override`
4. Return the applicable macro targets

This function would be called by:
- `QuickLogPage` (for daily goals display)
- `DailyTotals` component
- `buildChatSystemPrompt` (for Claude context)
- Widget data sync

## UI Design

### Plan Builder Screen

- Timeline visualization: horizontal scroll of phase cards
- Each phase card shows:
  - Phase name (editable)
  - Trigger type selector (Date / Weight / Manual)
  - Trigger value (date picker or weight input)
  - Default macros (cal/protein/carbs/fat)
  - "Day Types" button → reveals day-of-week picker
- Day type editor:
  - Name the day type (e.g., "Training", "Rest")
  - Select applicable days (checkboxes for Mon-Sun)
  - Set override macros
- Preview: show a week calendar with color-coded days showing which macros apply

### Plan Updates from Chat

Claude could modify phases via a new `[PLAN_PHASE]` marker:
```
[PLAN_PHASE]{"name":"Cut","calories":1800,"protein":165,"carbs":180,"fat":60,"trigger":"date","triggerValue":"2026-05-01"}[/PLAN_PHASE]
```

## Migration Path

1. Add tables via Supabase migration
2. Default behavior: single-phase plan (backward compatible with current `user_plans`)
3. "Upgrade to Complex Plan" button in plan settings
4. Existing plans auto-create a single phase matching current macros
