# NoomiBodi — App Store Publishing Progress

Tracks what has been completed toward publishing the app on the Apple App Store (TestFlight).

See `docs/deployment-guide.md` for the full step-by-step guide.

---

## Part 1: Production Supabase Project — DONE

- [x] 1.1 Created production Supabase project
- [x] 1.2 Noted production credentials (URL + publishable key)
- [x] 1.3 Installed Supabase CLI, ran `supabase init`
- [x] 1.4 Linked to dev project, pulled schema
- [x] 1.5 Wrote `supabase/migrations/20260323230000_initial_schema.sql` (manually, from live dev DB inspection)
- [x] 1.6 Pushed schema to production (`supabase db push`)
- [x] 1.7 Created `profile-pictures` storage bucket + RLS policies in production
- [x] 1.8 Set Edge Function secrets in production (`FCM_PROJECT_ID`, `FCM_SERVICE_ACCOUNT_JSON`)

## Part 2: Firebase Production Project — DONE

- [x] 2.1 Created production Firebase project (`noomibodi-prod`)
- [x] 2.2 Added iOS app with bundle ID `com.athalhei.noomibodi`
- [x] 2.3 Uploaded APNs key (`.p8` file) to Firebase Cloud Messaging settings
- [x] 2.4 Generated service account key for Supabase Edge Function
- [x] 2.5 Downloaded production `GoogleService-Info.plist`

## Part 3: Codebase Environment Setup — DONE

- [x] 3.1 Configured `babel.config.js` for `APP_ENV`-based `.env` switching
- [x] 3.2 Created `.env.production.example` template
- [x] 3.3 Updated `.env.example` with clearer instructions
- [x] 3.4 Populated `.env.production` with real production credentials
- [x] 3.5 Added `start:prod` and `ios:prod` npm scripts to `package.json`
- [x] 3.6 Updated `.gitignore` for `.env.production` and `ios/firebase/`
- [x] 3.7 Set up `ios/firebase/` with dev and prod `GoogleService-Info.plist` files
- [x] 3.8 Deployed Edge Function to production Supabase

## Part 4: Xcode Configuration — DONE

- [x] 4.1 Bundle ID set to `com.athalhei.noomibodi` (main app)
- [x] 4.2 Widget bundle ID set to `com.athalhei.noomibodi.widget`
- [x] 4.3 Entitlements: push notifications (`aps-environment` = production), Sign in with Apple, App Groups
- [x] 4.4 Removed empty `NSLocationWhenInUseUsageDescription` from Info.plist
- [x] 4.5 Widget deployment target lowered to 18.6
- [x] 4.6 Launch screen branded with Noomi mascot + purple "NoomiBodi" text
- [x] 4.7 Version set to 1.0.0, build 1; `package.json` synced to 1.0.0
- [x] 4.8 Updated dev Firebase iOS app to match new bundle ID; refreshed both plists

## Part 5: App Store Connect Setup — IN PROGRESS

- [x] 5.1 Created app record in App Store Connect
- [x] 5.2 Privacy policy written, hosted on GitHub Pages: https://ajthal.github.io/noomibodi-legal/privacy-policy.html
- [x] 5.3 App privacy questionnaire completed (data collection types, purposes, linked to identity, no tracking)
- [ ] 5.4 Fill in App Store metadata (description, screenshots, keywords, categories) — needed for external TestFlight
- [ ] 5.5 Create demo account in production Supabase for App Review team

## Part 6: Build, Archive & Upload — NOT STARTED

- [ ] 6.1 Pre-flight checklist (verify prod env, plist, bundle ID, entitlements, etc.)
- [ ] 6.2 Test app with `npm run ios:prod` on a real device
- [ ] 6.3 Archive in Xcode (Any iOS Device arm64 → Product → Archive)
- [ ] 6.4 Upload to App Store Connect via Organizer
- [ ] 6.5 Set up internal TestFlight testing group
- [ ] 6.6 (Optional) Submit for external TestFlight Beta App Review

---

## Additional Work Done (this session)

### UX improvements
- **Onboarding step 1**: Replaced the disabled Back + narrow Next buttons with a full-width primary button + "Returning user? Sign in here" link underneath
- **Sign-in back arrow**: Added conditional back arrow on `SignInScreen` (only visible when navigated from onboarding link, so users aren't stuck if they tapped it by accident)
- **Copy updates**: Changed "Profile tab" → "Profile settings" across 4 occurrences in 3 files to reflect the current navigation structure

### AI / Chat improvements
- **Model upgrade**: Switched from `claude-sonnet-4-5-20250929` to `claude-sonnet-4-6` (1M context window, improved intelligence, same pricing)
- **Context window management**: Added message windowing with rolling conversation summary so long chats don't hit the context limit. Oldest messages are trimmed from the API call but summarized into a recap that persists in the system prompt. Full chat history remains visible in the UI.

### Documentation created
- `docs/deployment-guide.md` — full step-by-step guide for environment setup and App Store deployment
- `docs/privacy-policy.html` — comprehensive privacy policy covering all data collection, third-party services, social features, and user controls
- `docs/publishing-progress.md` — this file

### Documentation updated
- `docs/database_schema.md` — corrected to match live dev DB (`public_profiles` is a table with sync trigger, added `meal_plans`, fixed data types, refined RLS policy descriptions)
- `.cursor/rules/noomibodi-project.mdc` — added environment management section, launch screen branding, onboarding sign-in flow, updated DB schema descriptions

### Infrastructure
- Privacy policy hosted on GitHub Pages (`ajthal/noomibodi-legal` repo): https://ajthal.github.io/noomibodi-legal/privacy-policy.html
- Contact email: noomibodi@gmail.com
