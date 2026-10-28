# Getting Mappin onto your phone

There are two ways to try Mappin on a phone. Both are free.

| | Website you install ("web app") | Real app file |
|---|---|---|
| **iPhone** | ✅ Free, no Mac needed (part 2) | Needs a Mac with Xcode (part 4) |
| **Android** | ✅ Free (part 2) | ✅ Free, built for you by GitHub (part 3) |
| Works offline | Yes, after the first open | Yes |
| Updates | Automatic | Install the new build |

**Recommended for testing:** do part 1 and part 2, then part 3 if you have an Android phone.

---

## Part 1 · Put the project on GitHub (free, about 10 minutes)

GitHub stores the code and, for free, builds the Android app and hosts the website.

1. Create a free account at **github.com**.
2. Click **+** (top right) → **New repository**.
   - Name: `mappin`
   - Choose **Public** (free website hosting needs a public repository).
   - Click **Create repository**.
3. On the new repository page, click **uploading an existing file**.
4. Unzip `Mappin-app.zip` on your computer, open the `mappin-app` folder, select **everything inside it**
   and drag it onto the GitHub page. Then click **Commit changes**.

> **Hidden folder check:** the build instructions live in a folder called `.github`, which computers hide by default.
> - **Mac:** in Finder press **Cmd + Shift + .** to show hidden files before dragging.
> - **Windows:** in File Explorer choose **View → Show → Hidden items**.
>
> After uploading, you should see a `.github` folder in the repository. If it's missing, click
> **Add file → Create new file**, type `.github/workflows/android.yml` as the name, paste in the contents of
> that file from the zip, and commit. Do the same for `.github/workflows/website.yml`.

---

## Part 2 · The website: install on iPhone or Android (free)

1. In your repository, go to **Settings → Pages**. Under **Build and deployment → Source**, choose **GitHub Actions**.
2. Go to the **Actions** tab. Click **Publish website** → **Run workflow** → **Run workflow**.
   It takes 1–2 minutes and turns green when done. (It also runs by itself every time you upload changes.)
3. Your site is now at **`https://YOUR-USERNAME.github.io/mappin/`**.
4. Edit `www/config.js` on GitHub (open the file → pencil icon) and set
   `publicUrl: 'https://YOUR-USERNAME.github.io/mappin/'`, then commit. This lets the Android app create share links.

**On an iPhone**
1. Open the address in **Safari** (it must be Safari).
2. Tap the **Share** button (square with an arrow) → **Add to Home Screen** → **Add**.
3. Open Mappin from the new icon. It runs full screen like an app and keeps working offline once opened.

**On Android**
1. Open the address in **Chrome**.
2. Tap **⋮** → **Install app** (or **Add to Home screen**). Mappin's menu also has an **Install app** option.

**No GitHub?** You can drag the `www` folder onto **app.netlify.com/drop** instead. It works the same, except
the libraries load from the internet the first time (so the very first open needs a connection).

**About your data:** trips are stored on each device (in that browser or app). To move a trip between devices,
use **Menu → Export CSV / Import CSV**, a share link, or the optional cloud sync (part 5).

---

## Part 3 · The Android app file (APK), free

1. In your repository, open the **Actions** tab → **Build Android app** → **Run workflow** → **Run workflow**.
   It takes about 5–8 minutes.
2. Click the finished run (green tick). Scroll to **Artifacts** and download **Mappin-android**.
   It's a zip containing `Mappin-debug.apk`.
3. Get the APK onto your phone: email it to yourself, put it in Google Drive, or open the run on your phone's browser
   while signed in to GitHub and download it there (unzip it first).
4. Tap `Mappin-debug.apk`. Android asks to allow installs from that app (Files, Chrome or Drive) → **Settings → Allow**
   → back → **Install**. If Play Protect warns about an unknown developer, choose **More details → Install anyway**.
   That warning appears for every app that doesn't come from the Play Store.
5. **Updating:** run the workflow again and install the new APK over the old one. Your trips stay.

---

## Part 4 · The iPhone app (needs a Mac)

Apple only lets you build iPhone apps on a Mac with Xcode. **Without a Mac, use part 2.** The installed website
is almost identical to the app.

With a Mac:
1. Install **Xcode** (free, Mac App Store) and **Node.js LTS** (nodejs.org).
2. Open **Terminal**, go to the project folder and run:
   ```
   npm install
   npm run ios:init
   npm run ios:open
   ```
3. In Xcode, click **App** (left) → **Signing & Capabilities**:
   - **Team:** choose **Add an Account…**, sign in with your normal Apple ID (a free "Personal Team").
   - **Bundle Identifier:** change it to something unique, e.g. `com.yourname.mappin`.
4. Plug in your iPhone, choose it at the top of Xcode, and press **▶ Run**.
5. On the iPhone, the first time:
   - **Settings → Privacy & Security → Developer Mode → On** (the phone restarts).
   - **Settings → General → VPN & Device Management →** your Apple ID → **Trust**.

With a free Apple ID, the app stops opening after **7 days**. Press ▶ Run again to renew it. You can have up to 3 such apps.
For longer testing (TestFlight) or the App Store, you need the **Apple Developer Program (US$99/year)**.

After changing the app later: `npm run sync`, then ▶ Run in Xcode again.

---

## Part 5 · Optional: free cloud sync and short share links

This lets you sign in with your email and open the same trip on your phone and computer. It also makes share links
short. Supabase's free plan is enough for testing.

1. Sign up at **supabase.com** → **New project** (Free plan; choose a region near you, e.g. Sydney).
2. Open **SQL Editor** → **New query**, paste the contents of `supabase/schema.sql`, click **Run**.
3. Open **Authentication → Emails → Templates → Magic Link** and add this line to the message, then save:
   `Your Mappin code: {{ .Token }}`
   (Mappin signs in with a 6-digit code, so it works the same in the browser and in the phone apps.)
4. Open **Project Settings → API** (or **API Keys**) and copy the **Project URL** and the **anon / public** key.
5. Add both to `www/config.js` (`supabaseUrl`, `supabaseAnonKey`) and commit. Everyone using your website or a
   new app build then has cloud sync. To try it first, paste them into **Mappin → Menu → Settings → Cloud sync**
   instead (that only affects that one device).
6. In Mappin: **Settings → Cloud sync** → enter your email → **Send code** → type the code → **Sign in** →
   **Save this trip to the cloud**. On your other device, sign in and press **Open** next to the trip.

Good to know about the free plan:
- Projects pause after a week with no activity. Open the Supabase dashboard to wake it up.
- You can request a code once a minute, and the built-in email service only sends a small number of emails per hour.
  That's fine for testing. For a public launch, connect your own email service in Supabase.
- The anon key is meant to be public. The rules in `schema.sql` make sure each person only sees their own trips.

---

## Part 6 · Releasing to the app stores (later)

Before releasing:
- **Pick your app ID:** change `appId` in `capacitor.config.json` (e.g. `com.yourname.mappin`). It can't change after publishing.
- **Map and search licences:** the map images use an unofficial Google address and the free OpenStreetMap
  search services have fair-use limits. Switch to a licensed map (e.g. the official Google Maps Platform) before
  a public launch. That's the roadmap at the top of `index.html`.
- **Privacy policy:** both stores require a web page explaining what Mappin stores (trips on the device, optional
  cloud sync, location only when you tap "Show my location").

**Google Play**
- One-off US$25 registration at play.google.com/console.
- New personal accounts must run a **closed test with at least 12 testers for 14 days in a row** before they can
  publish to everyone.
- Upload an **AAB** signed with your own private upload key (Android Studio → **Build → Generate Signed App Bundle**).
  Keep that key safe and never upload it to GitHub. The `signing/debug.keystore` in this project is for testing only.

**Apple App Store**
- Apple Developer Program, US$99/year.
- Build and upload from Xcode (**Product → Archive**), test with TestFlight, then submit for review.
- Apple rejects apps that are "just a website". Mappin uses phone features (location, share sheet, offline),
  which helps.

---

## Quick reference

| Task | Command (in the project folder) |
|---|---|
| Install packages | `npm install` |
| Bundle the libraries into `www/vendor` | `npm run vendor` |
| Preview the website locally | `npm run serve` → open http://localhost:8080 |
| Create the Android project | `npm run android:init`, then `npm run android:open` (Android Studio) |
| Create the iPhone project (Mac) | `npm run ios:init`, then `npm run ios:open` (Xcode) |
| Copy changes into both apps | `npm run sync` |
