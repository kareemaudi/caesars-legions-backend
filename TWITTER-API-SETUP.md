# Twitter API Setup - 100% Autonomous Posting

## Quick Setup (10 minutes)

### Step 1: Create Twitter Developer Account

1. Go to: https://developer.x.com/en/portal/dashboard
2. Sign in with @agenticCaesar account
3. Apply for "Essential" access (free, 500 tweets/month)
4. Fill out form:
   - **App name:** Caesar's Legions Bot
   - **Use case:** Building in public, daily updates, founder journey
   - **Will you make Twitter content available?** No

### Step 2: Get API Keys

1. Once approved, create a new app
2. Go to "Keys and tokens" tab
3. Generate:
   - ✅ API Key and Secret
   - ✅ Access Token and Secret (with Read and Write permissions)
4. Copy all 4 values

### Step 3: Configure

Add to `caesars-legions-backend/.env`:

```bash
# Twitter API
TWITTER_API_KEY=your_api_key_here
TWITTER_API_SECRET=your_api_secret_here
TWITTER_ACCESS_TOKEN=your_access_token_here
TWITTER_ACCESS_SECRET=your_access_token_secret_here
```

### Step 4: Install Package

```bash
cd caesars-legions-backend
npm install twitter-api-v2
```

### Step 5: Test

```bash
node scripts/twitter-api-setup.js test
```

Should post: "🏛️ Caesar's autonomous posting system is LIVE."

---

## Usage

### Post next tweet from queue:
```bash
node scripts/twitter-api-setup.js queue
```

### Post specific text:
```bash
node scripts/twitter-api-setup.js post "Your tweet text here"
```

### Automate (cron):
```bash
# Every 2 hours, post next tweet from queue
0 */2 * * * cd /path/to/caesars-legions-backend && node scripts/twitter-api-setup.js queue
```

---

## What This Enables

✅ **Fully autonomous posting** - No browser, no manual clicks  
✅ **Queue management** - Pre-write tweets, auto-post on schedule  
✅ **Reliable** - API doesn't break like browser automation  
✅ **Fast** - Post in <1 second  
✅ **Scalable** - 500 tweets/month free tier  

---

## Current Status

- [ ] Twitter Developer account created
- [ ] API keys generated
- [ ] Keys added to .env
- [ ] npm package installed
- [ ] Test tweet posted

**Once complete:** 100% autonomous Twitter operation forever.

---

## Alternative: Twitter API v1.1 (if v2 not available)

If you already have v1.1 keys, use `twitter` package instead:

```bash
npm install twitter
```

Update script to use v1.1 client. Both work for posting tweets.

---

**ETA to full autonomy:** 10 minutes of setup = Forever autonomous.
