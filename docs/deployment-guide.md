# NoomiBodi — Dev/Prod Split & App Store Deployment Guide

This guide walks through setting up separate development and production environments (Supabase + Firebase) and deploying to the Apple App Store via TestFlight.

---

## Part 1: Create the Production Supabase Project

### 1.1 Create the project

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard)
2. Click **New Project**
3. Name it something like `noomibodi-prod`
4. Choose a strong database password — **save it somewhere safe** (you'll need it for direct DB access)
5. Select a region close to your users
6. Click **Create new project** and wait for it to provision (~2 minutes)

### 1.2 Note your production credentials

Once the project is ready, go to **Project Settings → API Keys**:

- Copy the **Project URL** (found under **Settings → General**, e.g., `https://xyz789.supabase.co`)
- On the API Keys page, under **Publishable key**, copy the **default** key (starts with `sb_publishable_...`)

This is the key used as `SUPABASE_ANON_KEY` in your `.env` files. It's safe to include in client-side code because RLS enforces access control.

You'll use these in Step 3.

### 1.3 Pull schema from your dev database

Your existing dev database has the full schema (tables, RLS policies, views, functions). Instead of recreating it by hand, pull it using the Supabase CLI.

```bash
# Link to your DEVELOPMENT project
supabase link --project-ref <your-dev-project-ref>

# Pull the current schema into a migration file
supabase db pull
```

This creates a timestamped file in `supabase/migrations/` (e.g., `20260317000000_remote_schema.sql`) containing your entire schema: tables, indexes, RLS policies, views, functions — everything.

**Verify it looks right:**
```bash
cat supabase/migrations/*.sql | head -100
```

You should see your `profiles` table, `is_admin()` function, `public_profiles` view, etc.

### 1.4 Push schema to production

```bash
# Link to your PRODUCTION project (this overwrites the link)
supabase link --project-ref <your-prod-project-ref>

# Push all migrations to production
supabase db push
```

This applies the exact same schema to your fresh production database. You now have two identical databases with zero data crossover.

**Tip:** From now on, when you make schema changes:
1. Write a new migration file in `supabase/migrations/`
2. Test it against dev: `supabase link --project-ref <dev-ref> && supabase db push`
3. Apply to prod: `supabase link --project-ref <prod-ref> && supabase db push`

### 1.5 Create the storage bucket

The migration won't create Storage buckets — do this manually:

1. In the **production** Supabase dashboard, go to **Storage**
2. Click **New bucket**
3. Name: `profile-pictures`
4. Check **Public bucket**
5. Click **Create bucket**

Then add the same storage policies as dev:
- Go to **Policies** for the `profile-pictures` bucket
- Add policies matching your dev setup (users upload to their own `{user_id}/` folder, public read)

### 1.6 Configure auth providers

In the **production** Supabase dashboard → **Authentication → Providers**:

1. **Email:** Should be enabled by default
2. **Apple:**
   - Enable it
   - **Client ID:** Set to your iOS bundle ID (`com.athalhei.noomibodi`)
   - Also add the bundle ID to **Authorized Client IDs** if available
   - Add your Secret Key (.p8 contents), Key ID, and Team ID
   - **Important:** The Apple id_token audience is your bundle ID — if this doesn't match Supabase's config, you'll get "unacceptable audience in id_token" errors
3. **Google:**
   - Enable it
   - Add your Google OAuth Client ID and secret (same ones from dev)

### 1.7 Deploy Edge Functions

```bash
# Make sure you're linked to production
supabase link --project-ref <your-prod-project-ref>

# Deploy the notification function
supabase functions deploy send-notification --no-verify-jwt
```

### 1.8 Set Edge Function secrets

```bash
supabase secrets set \
  FCM_PROJECT_ID=<your-prod-firebase-project-id> \
  FCM_SERVICE_ACCOUNT_JSON='<your-prod-firebase-service-account-json>' \
  --project-ref <your-prod-project-ref>
```

See Part 2 for creating the production Firebase project where these values come from.

---

## Part 2: Create the Production Firebase Project

You need a separate Firebase project for production so that FCM tokens, APNs certificates, and analytics are isolated.

### 2.1 Create the project

1. Go to [console.firebase.google.com](https://console.firebase.google.com)
2. Click **Add project**
3. Name it `NoomiBodi-Prod` (or similar)
4. Enable or disable Google Analytics as you prefer
5. Click **Create project**

### 2.2 Add an iOS app

1. In the Firebase project, click **Add app → iOS**
2. **Bundle ID:** Use your production bundle ID (e.g., `com.yourname.noomibodi` — see Part 4)
3. Download the `GoogleService-Info.plist`
4. **Keep this file separate** from your dev plist — you'll swap it per environment (see Part 3)

### 2.3 Set up APNs for push notifications

1. In Firebase Console → **Project Settings → Cloud Messaging → Apple app configuration**
2. Upload your **APNs authentication key** (.p8 file):
   - If you used the same key for dev, upload it here too (APNs keys work across all apps in your Apple Developer account)
   - If you haven't created one: Apple Developer → **Certificates, Identifiers & Profiles → Keys → + → Enable "Apple Push Notifications service (APNs)"** → Download the .p8 file
3. Enter your **Key ID** and **Team ID**

### 2.4 Generate a service account key (for Edge Function)

1. Firebase Console → **Project Settings → Service accounts**
2. Click **Generate new private key**
3. Save the JSON file securely
4. The contents of this JSON go into the `FCM_SERVICE_ACCOUNT_JSON` secret in Step 1.8

---

## Part 3: Configure Your App for Environment Switching

### 3.1 How it works

The app uses `react-native-dotenv` with the `envName` option. It loads different `.env` files based on the `APP_ENV` environment variable:

| APP_ENV value | File loaded | Use case |
|---|---|---|
| *(not set)* | `.env` | Local development |
| `production` | `.env.production` | App Store / TestFlight builds |

### 3.2 Set up your env files

```bash
# Dev (you should already have this)
cp .env.example .env
# Fill in your DEV Supabase + Google credentials

# Prod
cp .env.production.example .env.production
# Fill in your PROD Supabase URL, anon key, and Google credentials
```

### 3.3 Running locally against production (testing)

```bash
# Start Metro with production env
npm run start:prod

# Or run on device with Release mode + production env
npm run ios:prod
```

**Important:** Always clear Metro cache when switching environments:
```bash
npx react-native start --reset-cache
```

### 3.4 GoogleService-Info.plist per environment

For push notifications to route to the correct Firebase project, you need the right `GoogleService-Info.plist` at build time.

**Simple approach (recommended for solo dev):**

Keep two copies and swap before building:

```bash
# Store both plists
mkdir -p ios/firebase
cp ios/GoogleService-Info.plist ios/firebase/GoogleService-Info-Dev.plist
# Download prod plist from Firebase Console and save as:
# ios/firebase/GoogleService-Info-Prod.plist
```

Before archiving for production:
```bash
cp ios/firebase/GoogleService-Info-Prod.plist ios/GoogleService-Info.plist
```

Before going back to dev:
```bash
cp ios/firebase/GoogleService-Info-Dev.plist ios/GoogleService-Info.plist
```

Add to `.gitignore`:
```
ios/firebase/
```

**Advanced approach:** Use an Xcode Build Phase script that copies the right plist based on the build configuration (Debug vs Release). But the manual swap is fine for a solo developer.

---

## Part 4: Prepare the iOS Build for App Store

### 4.1 Change the bundle identifier

The default `org.reactjs.native.example.NoomiBodi` must be changed to something you own:

1. Open `ios/NoomiBodi.xcworkspace` in Xcode
2. Select the **NoomiBodi** project in the navigator
3. Select the **NoomiBodi** target
4. Under **General → Identity**, change **Bundle Identifier** to: `com.yourname.noomibodi` (replace `yourname`)
5. Select the **NoomiBodi WidgetExtension** target
6. Change its Bundle Identifier to: `com.yourname.noomibodi.widget`
7. Make sure both targets have your **Team** selected under **Signing & Capabilities**

**Important:** After changing the bundle ID, update it everywhere:
- Firebase iOS app (may need to remove and re-add with new bundle ID)
- Supabase Apple auth provider (Client ID + Authorized Client IDs)
- Apple Developer Portal (App ID capabilities)

### 4.2 Register App IDs in Apple Developer Portal

If Xcode's automatic signing doesn't create them:

1. Go to [developer.apple.com/account](https://developer.apple.com/account) → **Certificates, Identifiers & Profiles → Identifiers**
2. Register `com.yourname.noomibodi` with capabilities: Push Notifications, Sign in with Apple, App Groups (`group.noomibodi`)
3. Register `com.yourname.noomibodi.widget` with capability: App Groups (`group.noomibodi`)

### 4.3 Fix the entitlements for production

Edit `ios/NoomiBodi/NoomiBodi.entitlements`:

Change `aps-environment` from `development` to `production`:

```xml
<key>aps-environment</key>
<string>production</string>
```

**Note:** If you want the Debug scheme to keep using the sandbox APNs environment, create a separate entitlements file for Release builds in Xcode (Build Settings → Code Signing Entitlements, set per-configuration).

### 4.4 Fix the location permission

Your `Info.plist` has an empty `NSLocationWhenInUseUsageDescription`. Apple will reject this.

Either **remove it entirely** (if you don't use location):
- Open `ios/NoomiBodi/Info.plist`
- Delete the `NSLocationWhenInUseUsageDescription` key and its empty string value

Or **add a real description** if you plan to use location.

### 4.5 Fix the widget deployment target

The widget extension targets iOS 26.2 but the main app targets iOS 15.1. Set the widget to a reasonable minimum:

1. In Xcode, select the **NoomiBodi WidgetExtension** target
2. Under **General → Deployment Info**, set **Minimum Deployments** to `16.0` (WidgetKit requires iOS 16+, Live Activities require iOS 16.2+)

### 4.6 Update the launch screen

Open `ios/NoomiBodi/LaunchScreen.storyboard` and replace "Powered by React Native" with your own branding or remove it.

### 4.7 Add iPad icons to asset catalog

Even if your app is iPhone-only, Apple requires iPad icon sizes in the asset catalog. Make sure `ios/NoomiBodi/Images.xcassets/AppIcon.appiconset/Contents.json` includes entries for `ipad` idiom:

- 20x20 @1x (20.png), 20x20 @2x (40.png)
- 29x29 @1x (29.png), 29x29 @2x (58.png)
- 40x40 @1x (40.png), 40x40 @2x (80.png)
- 76x76 @1x (76.png), 76x76 @2x (152.png)
- 83.5x83.5 @2x (167.png) — iPad Pro

Without these, upload validation will fail with "Missing required icon file" errors.

### 4.8 Set version numbers

1. In Xcode → NoomiBodi target → General → Identity:
   - **Version (Marketing):** `1.0.0`
   - **Build:** `1` (increment this for each upload to App Store Connect)
2. Also update `package.json` version to match: `"version": "1.0.0"`

---

## Part 5: App Store Connect Setup

### 5.1 Create the app record

1. Go to [appstoreconnect.apple.com](https://appstoreconnect.apple.com)
2. Click **My Apps → +** → **New App**
3. Fill in:
   - **Platform:** iOS
   - **Name:** NoomiBodi
   - **Primary Language:** English (U.S.) (or your preference)
   - **Bundle ID:** Select `com.yourname.noomibodi`
   - **SKU:** `noomibodi` (any unique string)
   - **Access:** Full Access
4. Click **Create**

### 5.2 Write a privacy policy

Apple requires a privacy policy URL. Create one covering:

- What data you collect (email, name, meal photos, weight, nutrition data)
- How you use it (personalized nutrition tracking, AI analysis)
- Third parties (Supabase for data storage, Anthropic/Claude for AI analysis, Firebase for push notifications)
- Data retention and deletion (users can delete their account)
- Contact information

Host it at a public URL (GitHub Pages, Notion, your own domain, etc.).

Enter the URL in App Store Connect → App Information → Privacy Policy URL.

### 5.3 Fill in App Store metadata (for external TestFlight)

For internal TestFlight (up to 100 testers by Apple ID), you don't need any of this. For external TestFlight (public link, up to 10,000 testers), you need:

- **What to Test:** Brief description for beta testers
- **Beta App Description:** Short paragraph about what the app does
- **Contact info:** Email for the review team
- **Sign-In Required:** Yes — provide a demo account (create one in your production Supabase)

---

## Part 6: Build, Archive & Upload

### 6.1 Pre-flight checklist

- [ ] `.env.production` has production Supabase URL + anon key
- [ ] `ios/GoogleService-Info.plist` is the **production** version
- [ ] Bundle ID is set to your production ID (not `org.reactjs.native.example.*`)
- [ ] `aps-environment` is `production` in entitlements
- [ ] `NSLocationWhenInUseUsageDescription` is removed or filled in
- [ ] Widget deployment target is ≤ 17.0
- [ ] Launch screen is branded
- [ ] Version + build numbers are set
- [ ] iPad icons are declared in `Contents.json` (see 4.7)
- [ ] Archive scheme has `APP_ENV=production` pre-action (see 6.3)
- [ ] Supabase Apple auth provider has correct bundle ID (see 1.6)
- [ ] You've tested the app with `npm run ios:prod` on a real device

### 6.2 Build the JS bundle with production env

```bash
# Clear Metro cache and set production env
APP_ENV=production npx react-native start --reset-cache
```

### 6.3 Archive in Xcode

1. Open `ios/NoomiBodi.xcworkspace`
2. **Set up the Archive pre-action** (one-time): Product → Scheme → Edit Scheme → expand **Archive** → click **Pre-actions** → click **+** → New Run Script Action → set "Provide build settings from" to **NoomiBodi** → enter: `export APP_ENV=production`
3. Select **Any iOS Device (arm64)** as the build destination (not a simulator)
4. **Product → Archive**
5. Wait for the build to complete (this may take several minutes)
6. The Organizer window opens automatically

**Verify the bundle:** Right-click archive → Show in Finder → Show Package Contents → `Products/Applications/NoomiBodi.app/main.jsbundle`. Search for your Supabase URL to confirm it's the production one.

### 6.4 Upload to TestFlight

1. In the Organizer, select your archive
2. Click **Distribute App**
3. Choose **TestFlight Internal Only** (for quick internal testing, skips Beta App Review) or **App Store Connect** (for both internal + external TestFlight and eventual App Store release)
4. Click **Distribute**
5. Wait for it to finish uploading and processing (~5-10 minutes)
6. **Encryption compliance:** If asked about France distribution, select **No** if you only use standard HTTPS/TLS (avoids export compliance paperwork)

**Note:** The dSYM warnings for React.framework, ReactNativeDependencies.framework, and hermesvm.framework are expected and don't block the upload.

### 6.5 TestFlight

1. Go to [appstoreconnect.apple.com](https://appstoreconnect.apple.com) → **My Apps → NoomiBodi → TestFlight**
2. Your build should appear (may take 5-15 minutes for processing)

**Internal Testing (instant, no review):**
1. Click **Internal Testing → +** to create a group
2. Add testers by Apple ID email (up to 100)
3. Testers get an email invite to install via TestFlight app

**External Testing (needs Beta App Review):**
1. Click **External Testing → +** to create a group
2. Select the build
3. Fill out the test info (what to test, contact, demo account)
4. Submit for Beta App Review (~24-48 hours)
5. Once approved, you get a **public TestFlight link** you can share with anyone

---

## Part 7: Ongoing Workflow

### Switching between dev and prod

```bash
# Development (default)
npm run ios
# or
npm run start

# Production testing
npm run ios:prod
# or
npm run start:prod
```

Always reset Metro cache when switching:
```bash
npx react-native start --reset-cache
```

### Schema changes

```bash
# 1. Write a new migration
#    Create: supabase/migrations/YYYYMMDDHHMMSS_description.sql

# 2. Apply to dev
supabase link --project-ref <dev-ref>
supabase db push

# 3. Test thoroughly

# 4. Apply to prod
supabase link --project-ref <prod-ref>
supabase db push
```

### Edge Function updates

```bash
# Deploy to dev
supabase functions deploy send-notification --no-verify-jwt --project-ref <dev-ref>

# Deploy to prod
supabase functions deploy send-notification --no-verify-jwt --project-ref <prod-ref>
```

### Switching Firebase environment (GoogleService-Info.plist)

Both plist files are stored in `ios/firebase/` (gitignored). The active one is `ios/GoogleService-Info.plist`.

**Switch to production** (before archiving for TestFlight / App Store):
```bash
cp ios/firebase/GoogleService-Info-Prod.plist ios/GoogleService-Info.plist
```

**Switch back to development** (for day-to-day work):
```bash
cp ios/firebase/GoogleService-Info-Dev.plist ios/GoogleService-Info.plist
```

**Important:** After switching, do a clean build in Xcode (Product → Clean Build Folder, or Cmd+Shift+K) to make sure the new plist is picked up.

### New TestFlight builds

Full checklist for uploading a new build:

1. Switch to production environment:
   ```bash
   cp ios/firebase/GoogleService-Info-Prod.plist ios/GoogleService-Info.plist
   ```
2. Verify `.env.production` has the correct prod Supabase credentials
3. Increment the **Build** number in Xcode (e.g., 1 → 2 → 3)
4. Clean build folder (Cmd+Shift+K)
5. Archive → Upload → TestFlight
6. Internal testers get it immediately; external testers get it after Apple processes (usually auto-approved after the first review)
7. Switch back to dev when done:
   ```bash
   cp ios/firebase/GoogleService-Info-Dev.plist ios/GoogleService-Info.plist
   ```

---

## Quick Reference

| Item | Dev | Prod |
|---|---|---|
| Supabase project | `<dev-ref>` | `<prod-ref>` |
| `.env` file | `.env` | `.env.production` |
| Firebase project | `NoomiBodi-Dev` | `NoomiBodi-Prod` |
| GoogleService-Info.plist | Dev plist | Prod plist |
| APNs environment | Sandbox | Production |
| Edge Function secrets | Dev Firebase SA | Prod Firebase SA |
| Build command | `npm run ios` | `npm run ios:prod` |
| APP_ENV | *(unset)* | `production` |
