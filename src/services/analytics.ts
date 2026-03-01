import { getDailySummaries, getWeightLogs, type DailySummary, type WeightLog } from './reportData';
import { loadUserProfile, estimateDailyGoals, type MacroGoals } from './storage';
import { kgToLbs } from '../utils/units';

// ── Types ────────────────────────────────────────────────────────────

export interface GoalProjection {
  currentLbs: number;
  goalLbs: number;
  weeklyRateLbs: number;
  estimatedDate: string | null;
  estimatedWeeks: number | null;
  /** 'ahead' | 'behind' | 'on_track' | 'no_goal' | 'insufficient_data' */
  status: string;
  confidence: 'high' | 'medium' | 'low';
}

export interface DayOfWeekPattern {
  day: string;
  dayIndex: number;
  avgCalories: number;
  avgProtein: number;
  avgCarbs: number;
  avgFat: number;
  calorieAdherenceRate: number;
  proteinAdherenceRate: number;
  sampleSize: number;
}

export interface Correlation {
  id: string;
  description: string;
  strength: 'strong' | 'moderate' | 'weak';
  type: 'positive' | 'negative' | 'observation';
}

export interface AnalyticsResult {
  goalProjection: GoalProjection | null;
  dayOfWeekPatterns: DayOfWeekPattern[];
  correlations: Correlation[];
}

// ── Helpers ──────────────────────────────────────────────────────────

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function linearRegression(xs: number[], ys: number[]): { slope: number; intercept: number; r2: number } {
  const n = xs.length;
  if (n < 2) return { slope: 0, intercept: ys[0] ?? 0, r2: 0 };

  const sumX = xs.reduce((a, b) => a + b, 0);
  const sumY = ys.reduce((a, b) => a + b, 0);
  const sumXY = xs.reduce((a, x, i) => a + x * ys[i], 0);
  const sumXX = xs.reduce((a, x) => a + x * x, 0);

  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return { slope: 0, intercept: sumY / n, r2: 0 };

  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;

  // R² calculation
  const meanY = sumY / n;
  const ssTot = ys.reduce((a, y) => a + (y - meanY) ** 2, 0);
  const ssRes = ys.reduce((a, y, i) => a + (y - (slope * xs[i] + intercept)) ** 2, 0);
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;

  return { slope, intercept, r2 };
}

// ── 1. Weight Goal Projection ───────────────────────────────────────

export async function predictGoalDate(): Promise<GoalProjection | null> {
  const [profile, weightLogs] = await Promise.all([
    loadUserProfile(),
    getWeightLogs(0),
  ]);

  if (!profile) return null;

  const targetKg = profile.targetWeightKg;
  const currentKg = profile.weightKg;
  const currentLbs = Math.round(kgToLbs(currentKg) * 10) / 10;
  const goalLbs = targetKg ? Math.round(kgToLbs(targetKg) * 10) / 10 : null;

  if (weightLogs.length < 2) {
    return {
      currentLbs,
      goalLbs: goalLbs ?? currentLbs,
      weeklyRateLbs: 0,
      estimatedDate: null,
      estimatedWeeks: null,
      status: 'insufficient_data',
      confidence: 'low',
    };
  }

  // Convert weight logs to (daysSinceFirst, lbs) for linear regression
  const firstTime = new Date(weightLogs[0].loggedAt).getTime();
  const xs = weightLogs.map(w => (new Date(w.loggedAt).getTime() - firstTime) / (1000 * 60 * 60 * 24));
  const ys = weightLogs.map(w => kgToLbs(w.weightKg));

  const { slope: dailyRate, r2 } = linearRegression(xs, ys);
  const weeklyRateLbs = Math.round(dailyRate * 7 * 10) / 10;

  const latestLbs = ys[ys.length - 1];
  const confidence: GoalProjection['confidence'] =
    r2 > 0.7 && weightLogs.length >= 7 ? 'high' :
    r2 > 0.4 && weightLogs.length >= 4 ? 'medium' : 'low';

  if (!goalLbs || !targetKg) {
    return {
      currentLbs: Math.round(latestLbs * 10) / 10,
      goalLbs: currentLbs,
      weeklyRateLbs,
      estimatedDate: null,
      estimatedWeeks: null,
      status: 'no_goal',
      confidence,
    };
  }

  const remaining = goalLbs - latestLbs;

  // Check if moving in the wrong direction
  if ((profile.goal === 'lose' && weeklyRateLbs >= 0) ||
      (profile.goal === 'gain' && weeklyRateLbs <= 0)) {
    return {
      currentLbs: Math.round(latestLbs * 10) / 10,
      goalLbs,
      weeklyRateLbs,
      estimatedDate: null,
      estimatedWeeks: null,
      status: 'behind',
      confidence,
    };
  }

  if (Math.abs(remaining) < 0.5) {
    return {
      currentLbs: Math.round(latestLbs * 10) / 10,
      goalLbs,
      weeklyRateLbs,
      estimatedDate: null,
      estimatedWeeks: 0,
      status: 'on_track',
      confidence,
    };
  }

  const weeksToGoal = Math.abs(remaining / weeklyRateLbs);
  const estimatedDate = new Date();
  estimatedDate.setDate(estimatedDate.getDate() + Math.round(weeksToGoal * 7));

  const dateStr = estimatedDate.toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  return {
    currentLbs: Math.round(latestLbs * 10) / 10,
    goalLbs,
    weeklyRateLbs,
    estimatedDate: dateStr,
    estimatedWeeks: Math.round(weeksToGoal * 10) / 10,
    status: Math.abs(weeklyRateLbs) >= 0.3 ? 'on_track' : 'behind',
    confidence,
  };
}

// ── 2. Day-of-week Adherence Patterns ───────────────────────────────

export async function calculateAdherencePatterns(): Promise<DayOfWeekPattern[]> {
  const [profile, summaries] = await Promise.all([
    loadUserProfile(),
    getDailySummaries(0),
  ]);

  if (summaries.length < 7) return [];

  const goals = profile ? estimateDailyGoals(profile) : null;

  // Group summaries by day of week
  const buckets: Map<number, DailySummary[]> = new Map();
  for (let i = 0; i < 7; i++) buckets.set(i, []);

  for (const s of summaries) {
    const dow = new Date(s.date + 'T12:00:00').getDay();
    buckets.get(dow)!.push(s);
  }

  return Array.from(buckets.entries()).map(([dow, days]) => {
    const n = days.length;
    if (n === 0) {
      return {
        day: DAY_NAMES[dow],
        dayIndex: dow,
        avgCalories: 0,
        avgProtein: 0,
        avgCarbs: 0,
        avgFat: 0,
        calorieAdherenceRate: 0,
        proteinAdherenceRate: 0,
        sampleSize: 0,
      };
    }

    const avgCal = days.reduce((a, d) => a + d.calories, 0) / n;
    const avgP = days.reduce((a, d) => a + d.protein, 0) / n;
    const avgC = days.reduce((a, d) => a + d.carbs, 0) / n;
    const avgF = days.reduce((a, d) => a + d.fat, 0) / n;

    let calAdherence = 0;
    let proAdherence = 0;

    if (goals) {
      const calLo = goals.calories * 0.9;
      const calHi = goals.calories * 1.1;
      const proLo = goals.protein * 0.85;
      const proHi = goals.protein * 1.15;

      calAdherence = days.filter(d => d.calories >= calLo && d.calories <= calHi).length / n;
      proAdherence = days.filter(d => d.protein >= proLo && d.protein <= proHi).length / n;
    }

    return {
      day: DAY_NAMES[dow],
      dayIndex: dow,
      avgCalories: Math.round(avgCal),
      avgProtein: Math.round(avgP),
      avgCarbs: Math.round(avgC),
      avgFat: Math.round(avgF),
      calorieAdherenceRate: Math.round(calAdherence * 100),
      proteinAdherenceRate: Math.round(proAdherence * 100),
      sampleSize: n,
    };
  });
}

// ── 3. Correlation / Pattern Detection ──────────────────────────────

export async function findCorrelations(): Promise<Correlation[]> {
  const [profile, summaries] = await Promise.all([
    loadUserProfile(),
    getDailySummaries(0),
  ]);

  if (summaries.length < 7) return [];

  const goals = profile ? estimateDailyGoals(profile) : null;
  const correlations: Correlation[] = [];

  // --- Weekend vs Weekday adherence ---
  if (goals) {
    const calLo = goals.calories * 0.9;
    const calHi = goals.calories * 1.1;

    const weekdayDays: DailySummary[] = [];
    const weekendDays: DailySummary[] = [];

    for (const s of summaries) {
      const dow = new Date(s.date + 'T12:00:00').getDay();
      if (dow === 0 || dow === 6) weekendDays.push(s);
      else weekdayDays.push(s);
    }

    if (weekdayDays.length >= 3 && weekendDays.length >= 2) {
      const wdHit = weekdayDays.filter(d => d.calories >= calLo && d.calories <= calHi).length;
      const weHit = weekendDays.filter(d => d.calories >= calLo && d.calories <= calHi).length;
      const wdRate = Math.round((wdHit / weekdayDays.length) * 100);
      const weRate = Math.round((weHit / weekendDays.length) * 100);
      const diff = wdRate - weRate;

      if (Math.abs(diff) >= 15) {
        correlations.push({
          id: 'weekend-vs-weekday',
          description: diff > 0
            ? `Weekday adherence is ${diff}% higher than weekends (${wdRate}% vs ${weRate}%)`
            : `Weekend adherence is ${Math.abs(diff)}% higher than weekdays (${weRate}% vs ${wdRate}%)`,
          strength: Math.abs(diff) >= 30 ? 'strong' : 'moderate',
          type: 'observation',
        });
      }
    }

    // --- High protein → calorie goal correlation ---
    if (goals.protein > 0 && summaries.length >= 10) {
      const highProtein = summaries.filter(s => s.protein >= goals.protein * 0.9);
      const lowProtein = summaries.filter(s => s.protein < goals.protein * 0.9);

      if (highProtein.length >= 3 && lowProtein.length >= 3) {
        const highPHitRate = Math.round(
          (highProtein.filter(s => s.calories >= calLo && s.calories <= calHi).length / highProtein.length) * 100,
        );
        const lowPHitRate = Math.round(
          (lowProtein.filter(s => s.calories >= calLo && s.calories <= calHi).length / lowProtein.length) * 100,
        );

        const diff = highPHitRate - lowPHitRate;
        if (diff >= 15) {
          correlations.push({
            id: 'protein-calorie',
            description: `You hit calorie goals ${highPHitRate}% of the time when protein is on target vs ${lowPHitRate}% when it's low`,
            strength: diff >= 30 ? 'strong' : 'moderate',
            type: 'positive',
          });
        }
      }
    }
  }

  // --- Meal count → calorie adherence ---
  if (goals && summaries.length >= 10) {
    const calLo = goals.calories * 0.9;
    const calHi = goals.calories * 1.1;
    const avgMealCount = summaries.reduce((a, s) => a + s.mealCount, 0) / summaries.length;
    const highMealDays = summaries.filter(s => s.mealCount >= avgMealCount);
    const lowMealDays = summaries.filter(s => s.mealCount < avgMealCount);

    if (highMealDays.length >= 3 && lowMealDays.length >= 3) {
      const highHit = Math.round(
        (highMealDays.filter(s => s.calories >= calLo && s.calories <= calHi).length / highMealDays.length) * 100,
      );
      const lowHit = Math.round(
        (lowMealDays.filter(s => s.calories >= calLo && s.calories <= calHi).length / lowMealDays.length) * 100,
      );

      const diff = highHit - lowHit;
      if (Math.abs(diff) >= 15) {
        correlations.push({
          id: 'meal-count-adherence',
          description: diff > 0
            ? `Days with ${Math.round(avgMealCount)}+ logged meals have ${diff}% better calorie adherence`
            : `Fewer logged meals correlates with ${Math.abs(diff)}% better adherence — you may be snacking less`,
          strength: Math.abs(diff) >= 30 ? 'strong' : 'moderate',
          type: diff > 0 ? 'positive' : 'observation',
        });
      }
    }
  }

  // --- Calorie consistency (variance) ---
  if (summaries.length >= 7) {
    const cals = summaries.map(s => s.calories);
    const mean = cals.reduce((a, b) => a + b, 0) / cals.length;
    const variance = cals.reduce((a, c) => a + (c - mean) ** 2, 0) / cals.length;
    const stdDev = Math.sqrt(variance);
    const cv = mean > 0 ? (stdDev / mean) * 100 : 0;

    if (cv > 30) {
      correlations.push({
        id: 'calorie-consistency',
        description: `Your daily calories vary a lot (±${Math.round(stdDev)} kcal). More consistency may help your progress.`,
        strength: cv > 45 ? 'strong' : 'moderate',
        type: 'negative',
      });
    } else if (cv < 15 && summaries.length >= 14) {
      correlations.push({
        id: 'calorie-consistency',
        description: `Very consistent calorie intake (±${Math.round(stdDev)} kcal variation). Great discipline!`,
        strength: 'moderate',
        type: 'positive',
      });
    }
  }

  return correlations;
}

// ── 4. Combined analytics result ────────────────────────────────────

export async function getAnalytics(): Promise<AnalyticsResult> {
  const [goalProjection, dayOfWeekPatterns, correlations] = await Promise.all([
    predictGoalDate(),
    calculateAdherencePatterns(),
    findCorrelations(),
  ]);

  return { goalProjection, dayOfWeekPatterns, correlations };
}
