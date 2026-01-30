# 🚀 Caesar's Legions - Deployment Guide

## Quick Deploy to Production

### Option 1: Railway.app (Recommended)

1. **Push to GitHub:**
   ```bash
   git init
   git add .
   git commit -m "Initial Caesar's Legions backend"
   git remote add origin <your-repo-url>
   git push -u origin main
   ```

2. **Deploy to Railway:**
   - Go to [railway.app](https://railway.app)
   - New Project → Deploy from GitHub
   - Select your repo
   - Add environment variables:
     - `OPENAI_API_KEY`
     - `APOLLO_API_KEY` (optional)
     - `INSTANTLY_API_KEY` (optional)
     - `PORT=3000`
   - Deploy!

3. **Access:**
   - Railway will give you a public URL: `your-app.railway.app`
   - Dashboard: `your-app.railway.app/dashboard/1`

---

### Option 2: DigitalOcean App Platform

1. **Push to GitHub** (same as above)

2. **Deploy to DO:**
   - Go to [DigitalOcean](https://cloud.digitalocean.com/apps)
   - Create App → GitHub
   - Select repo
   - Set build command: `npm install`
   - Set run command: `node scripts/dashboard-server.js`
   - Add environment variables (same as Railway)
   - Deploy!

---

### Option 3: Heroku

1. **Push to GitHub** (same as above)

2. **Deploy to Heroku:**
   ```bash
   heroku create caesars-legions
   heroku config:set OPENAI_API_KEY=your_key
   heroku config:set PORT=3000
   git push heroku main
   ```

3. **Access:**
   - `https://caesars-legions.herokuapp.com`

---

## Environment Variables

Set these in your deployment platform:

```
OPENAI_API_KEY=sk-...
APOLLO_API_KEY=...
INSTANTLY_API_KEY=...
INSTANTLY_CAMPAIGN_ID=...
PORT=3000
```

---

## Automated Campaign Runs (Cron)

### Railway Cron (Free)

Add to `railway.json`:

```json
{
  "services": [
    {
      "name": "web",
      "startCommand": "node scripts/dashboard-server.js"
    },
    {
      "name": "cron",
      "cron": "0 9 * * *",
      "startCommand": "node scripts/run-campaign.js 1 --send --limit=25"
    }
  ]
}
```

### GitHub Actions (Free)

Create `.github/workflows/daily-campaign.yml`:

```yaml
name: Daily Campaign

on:
  schedule:
    - cron: '0 9 * * *' # 9 AM UTC daily
  workflow_dispatch: # Manual trigger

jobs:
  run-campaign:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm install
      - run: node scripts/run-campaign.js 1 --send --limit=25
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          APOLLO_API_KEY: ${{ secrets.APOLLO_API_KEY }}
          INSTANTLY_API_KEY: ${{ secrets.INSTANTLY_API_KEY }}
```

Add secrets in GitHub repo settings.

---

## Custom Domain

### Railway:
- Settings → Domains → Add Custom Domain
- Point your DNS: `CNAME → your-app.railway.app`

### DigitalOcean:
- App Settings → Domains → Add Domain
- Update DNS records as instructed

---

## Monitoring

### Simple Health Check (UptimeRobot)

1. Go to [uptimerobot.com](https://uptimerobot.com)
2. Add monitor: `https://your-app.railway.app/`
3. Get alerts if dashboard goes down

### Logs

**Railway:** Deployments tab → View Logs  
**DigitalOcean:** Runtime Logs tab  
**Heroku:** `heroku logs --tail`

---

## Scaling

Start with **1 dyno/instance** (free tier).

When you hit **10+ clients:**
- Upgrade to paid tier ($5-7/mo)
- Add database (PostgreSQL)
- Set up Redis for caching

When you hit **50+ clients:**
- Consider dedicated server
- Implement queue system (BullMQ)
- Add monitoring (Sentry, LogRocket)

---

## Backup Data

**Current:** Data stored in `data/legions.json`

**Before deploy:** Enable automatic backups:

```bash
# Add to package.json scripts
"backup": "cp data/legions.json data/backup-$(date +%Y%m%d).json"
```

**Production:** Migrate to PostgreSQL when you hit 10 clients.

---

## Next Steps After Deploy

1. Test onboarding: `https://your-app.railway.app/` (no clients yet)
2. Onboard first client via SSH to server or local script
3. Run first campaign: `node scripts/run-campaign.js 1 --send`
4. Share dashboard link with client
5. Set up cron for daily sends

---

## Cost Breakdown

**Free Tier:**
- Railway: $5/mo credit (enough for 1-2 clients)
- OpenAI: ~$2/mo (100 emails/week)
- Apollo: Free tier (25 credits/mo)
- Instantly: $37/mo (cheapest paid plan)

**Total:** ~$40/mo operating cost  
**Revenue:** $250/client  
**Profit:** $210/client (84% margin)

---

🏛️ **Veni. Vidi. Vici.**
