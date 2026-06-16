# Northern Irish Links — Golf Trip App

Real-time golf trip companion for 8 players. Scores, bets, leaderboard, chat — synced across all phones.

## What You Need (all free)

1. A **Google account** (for Firebase)
2. A **GitHub account** (for Vercel deployment)
3. A **Vercel account** (sign up with GitHub — free)
4. About **30 minutes**

---

## Step 1: Create Firebase Project

1. Go to [console.firebase.google.com](https://console.firebase.google.com)
2. Click **"Create a project"**
3. Name it `ni-links-2026`
4. Disable Google Analytics (not needed)
5. Click **Create Project**

### Enable Firestore Database
1. In your Firebase project, click **Build → Firestore Database**
2. Click **Create Database**
3. Choose **Start in test mode** (we'll lock it down later)
4. Pick the nearest region (us-east1 for East Coast)
5. Click **Enable**

### Get Your Firebase Config
1. Click the **gear icon → Project settings**
2. Scroll to **"Your apps"** → click the **web icon** `</>`
3. Name the app `ni-links`
4. **Don't** check Firebase Hosting
5. Click **Register App**
6. Copy the `firebaseConfig` object — you'll need these values:

```
apiKey: "AIza..."
authDomain: "ni-links-2026.firebaseapp.com"
projectId: "ni-links-2026"
storageBucket: "ni-links-2026.appspot.com"
messagingSenderId: "123456789"
appId: "1:123456789:web:abc123"
```

### Set Firestore Rules
1. In Firestore, click the **Rules** tab
2. Replace with:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /trips/{tripId} {
      allow read, write: if true;
    }
    match /trips/{tripId}/chat/{messageId} {
      allow read, write: if true;
    }
  }
}
```

3. Click **Publish**

> Note: These rules allow open access. Fine for a private trip app. For production, you'd add auth rules.

---

## Step 2: Configure the App

Open `src/firebase.js` and replace the placeholder values with your Firebase config:

```javascript
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};
```

---

## Step 3: Test Locally

```bash
npm install
npm run dev
```

Open http://localhost:5173 on your phone (same WiFi network) to test.

---

## Step 4: Deploy to Vercel

### Option A: GitHub + Vercel (recommended)

1. Push this folder to a new GitHub repo:
```bash
git init
git add .
git commit -m "Northern Irish Links golf trip app"
git remote add origin https://github.com/YOUR_USERNAME/ni-links-2026.git
git push -u origin main
```

2. Go to [vercel.com](https://vercel.com), sign in with GitHub
3. Click **"Add New Project"**
4. Import the `ni-links-2026` repo
5. Framework: **Vite**
6. Click **Deploy**

Your app is live at `ni-links-2026.vercel.app`

### Option B: Vercel CLI (faster)

```bash
npm install -g vercel
vercel
```

Follow the prompts. Done in 60 seconds.

---

## Step 5: Share With the Group

Text the Vercel URL to the group chat. Tell them to:

1. Open the link in Safari (iPhone) or Chrome (Android)
2. Tap **Share → Add to Home Screen**
3. Enter PIN: **2026**
4. Pick their name

The app works like a native app with real-time sync. Every score, bet, and message shows up on all 8 phones instantly.

---

## Custom Domain (optional)

Want `northernirishlinks.com` or similar?

1. Buy a domain on Namecheap/GoDaddy (~$12/year)
2. In Vercel → Project Settings → Domains → Add your domain
3. Update DNS as instructed

---

## Tech Stack

- **React 18** + Vite
- **Firebase Firestore** — real-time database
- **Vercel** — hosting and CDN
- **PWA** — installable on phones

## Cost

- Firebase free tier: 50K reads/day, 20K writes/day
- Vercel free tier: 100GB bandwidth/month
- 8 golfers for a week: ~$0
