# NoomiBodi — AI-Powered Nutrition Tracking

## Overview

NoomiBodi is a mobile nutrition tracking app that uses AI to make logging meals effortless. Instead of manually searching food databases and measuring portions, users snap a photo of their meal or describe it in natural language, and the AI handles the rest — estimating calories, macros, and offering personalized coaching.

## What It Does

- **AI Meal Logging** — Photograph your meal or describe it in chat. The AI (Claude Sonnet 4.6) identifies foods, estimates portions, and logs calories and macronutrients (protein, carbs, fat) automatically.
- **Conversational Nutrition Coach** — Chat with "Noomi" (the app's AI persona, a purple phoenix mascot) for meal suggestions, nutrition advice, and plan adjustments. Supports multi-meal responses, meal editing, and a saved meals library.
- **Personalized Plans** — AI-generated nutrition plans based on user goals, body stats, and activity level. Created during onboarding and adjustable over time.
- **AI-Generated Insights** — Weekly pattern analysis across meals, adherence, and weight trends. Goes beyond daily summaries to identify multi-week behavioral patterns.
- **Progress Tracking** — Interactive charts for calories, macros, and weight over time with goal lines and trend analysis. Weight prediction using statistical modeling.
- **Social Features** — Bidirectional friendships, meal sharing between friends, activity feed with streak milestones, weekly adherence leaderboard, and friend profile views.
- **iOS Widgets** — Home screen (small/medium), lock screen (circular/rectangular) widgets showing real-time calorie and macro progress. Medium widget includes a camera button for quick meal logging via deep link.
- **Push Notifications** — Friend requests, shared meals, and streak milestone alerts via Firebase Cloud Messaging.
- **Offline Support** — Meal logs queue locally when offline and sync automatically on reconnect.

## Tech Stack

| Layer | Technology |
|---|---|
| **Mobile App** | React Native 0.84, TypeScript (strict mode) |
| **AI** | Anthropic Claude API (Sonnet 4.6) with function calling / RAG tools |
| **Backend** | Supabase (PostgreSQL, Row-Level Security, Edge Functions, Storage) |
| **Auth** | Email/password, Apple Sign-In, Google Sign-In (with identity linking) |
| **Notifications** | Firebase Cloud Messaging → APNs |
| **Widgets** | WidgetKit (Swift), shared data via App Groups |
| **Navigation** | React Navigation 7 — flat swipeable pager with material top tabs |

## Architecture Highlights

- **Context window management** — Rolling conversation summaries keep the AI chat responsive without losing long-term context. Oldest messages are summarized and injected into the system prompt as the token budget fills.
- **Optimistic UI updates** — Friend actions, meal deletes, and shared meal operations update instantly with rollback on failure.
- **Stale-time data fetching** — Custom `useStaleFetch` hook prevents redundant API calls on tab switches while keeping data fresh.
- **Widget data pipeline** — Meal log → Supabase → local aggregation → App Group UserDefaults → WidgetKit timeline reload, with timezone-aware day boundaries and midnight reset.
- **Security** — Supabase RLS policies enforce data access at the database level. Social features respect privacy toggles. Admin functions use SECURITY DEFINER to avoid policy recursion.

## Screens

- **Home (QuickLogPage)** — Daily calorie/macro summary, add meal via photo, weight logging, weekly weight chart, smart meal suggestions
- **Chat** — Conversational AI interface with quick action chips, markdown rendering, image attachments, multi-meal support
- **My Meals** — Saved meals library with search, sort, macro filters, AI meal builder, share with friends
- **Shared Meals** — Inbox for received meals, share-a-meal flow (meal picker → friend picker), sent meals history
- **Reports** — Calorie and weight charts with interactive tooltips and goal lines
- **Insights** — AI-generated weekly nutrition insights with caching and refresh
- **Social** — Activity feed, friend requests, friends list, weekly leaderboard
- **Profile & Settings** — Profile editing, privacy controls, API key management, appearance, feedback submission
- **Admin Dashboard** — User feedback management, AI tool usage analytics (admin-only)

## Database

14 tables in Supabase PostgreSQL with comprehensive Row-Level Security:

`profiles`, `public_profiles`, `user_plans`, `saved_meals`, `daily_logs`, `weight_logs`, `user_insights`, `ai_usage_logs`, `friendships`, `activity_feed`, `shared_meals`, `device_tokens`, `meal_plans`, `feedback`

Storage buckets for profile pictures and feedback screenshots.

## Status

Version 1.0.4. iOS TestFlight. Active development with post-MVP feedback iteration.

## Links

- **Repository**: https://github.com/ajthal/noomi-bodi
