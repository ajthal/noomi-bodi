# Design: Saved Ingredients Library

## Overview

Allow users to save individual ingredients with per-unit nutritional data, then compose meals from those ingredients with adjustable quantities.

## Data Model

### `ingredients` table

```sql
CREATE TABLE ingredients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  brand TEXT,                         -- optional brand name

  -- Nutrition per unit
  calories_per_unit NUMERIC(8,2) NOT NULL,
  protein_per_unit NUMERIC(8,2) NOT NULL DEFAULT 0,
  carbs_per_unit NUMERIC(8,2) NOT NULL DEFAULT 0,
  fat_per_unit NUMERIC(8,2) NOT NULL DEFAULT 0,

  -- Unit system
  unit_type TEXT NOT NULL CHECK (unit_type IN ('g', 'oz', 'cup', 'tbsp', 'tsp', 'ml', 'piece', 'serving')),
  default_quantity NUMERIC(8,2) NOT NULL DEFAULT 1,  -- e.g., 100g, 1 serving

  -- Metadata
  category TEXT,                      -- e.g., "protein", "dairy", "grain", "vegetable"
  is_favorite BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(user_id, name, brand)
);

CREATE INDEX idx_ingredients_user ON ingredients(user_id);
CREATE INDEX idx_ingredients_category ON ingredients(user_id, category);
```

### RLS Policies

- Users can only CRUD their own ingredients
- Admin can read all

## "Build a Meal" Flow

### UI Flow

1. **Entry point**: "Build a Meal" button on MealsScreen (next to AI Meal Builder)
2. **Ingredient picker**: 
   - Search bar to filter user's ingredients
   - Category filter chips
   - Each ingredient shows: name, cal per unit, unit type
   - Tap to add to "plate"
3. **Plate / builder**:
   - List of selected ingredients
   - Each has a quantity stepper/input
   - Real-time running totals (cal, P, C, F) at the top
   - Remove button per ingredient
4. **Actions**:
   - "Log Now" → creates a daily_log entry with combined macros
   - "Save as Meal" → saves to saved_meals with combined macros
   - Name field appears for saved meals

### Macro Calculation

```typescript
function calculateMealMacros(items: { ingredient: Ingredient; quantity: number }[]): MealData {
  return items.reduce(
    (acc, { ingredient, quantity }) => {
      const multiplier = quantity / ingredient.defaultQuantity;
      return {
        name: '', // set by user
        calories: acc.calories + Math.round(ingredient.caloriesPerUnit * multiplier),
        protein: acc.protein + Math.round(ingredient.proteinPerUnit * multiplier),
        carbs: acc.carbs + Math.round(ingredient.carbsPerUnit * multiplier),
        fat: acc.fat + Math.round(ingredient.fatPerUnit * multiplier),
      };
    },
    { name: '', calories: 0, protein: 0, carbs: 0, fat: 0 },
  );
}
```

## Future: Food Database Integration

Could integrate with:
- **USDA FoodData Central** (free, comprehensive)
- **Nutritionix** (commercial, better UX data)
- **Open Food Facts** (open source, barcode scanning)

Search flow:
1. User searches an ingredient name
2. Show results from local library first, then API results below
3. "Add to Library" button on API results → saves locally

## Migration Path

1. Add `ingredients` table via Supabase migration
2. New `src/services/ingredients.ts` service
3. New `src/screens/BuildMealScreen.tsx` with ingredient picker
4. Entry point from MealsScreen
5. Optional: Import ingredients from frequently logged meals
