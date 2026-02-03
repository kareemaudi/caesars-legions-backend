# Dashboard Deployment Instructions

## What's Built

✅ **Backend API** (`api-server.js`)
- Express server with `/api/metrics` endpoint
- CORS enabled for public access
- Returns current business metrics

✅ **Frontend Dashboard** (`dashboard/`)
- index.html - Main dashboard page
- style.css - Caesar-branded styling (gold/black theme)
- dashboard.js - Metric fetching and chart rendering
- vercel.json - Vercel deployment config

## Deployment Steps

### 1. Deploy Backend to Railway

**Option A: Railway Web Dashboard**
1. Go to https://railway.app/dashboard
2. Click "New Project"
3. Select "Deploy from GitHub repo"
4. Choose `caesars-legions-backend` repo
5. Railway will auto-detect and deploy
6. Copy the public URL (e.g., `https://caesars-legions-backend-production.up.railway.app`)

**Option B: Railway CLI** (if logged in)
```bash
cd C:\Users\Asus\clawd\caesars-legions-backend
railway up
railway open  # Get the URL
```

### 2. Update Frontend API Endpoint

Edit `dashboard/dashboard.js` line 2:
```javascript
const API_ENDPOINT = 'https://YOUR-RAILWAY-URL.railway.app/api/metrics';
```

Replace `YOUR-RAILWAY-URL` with your actual Railway domain.

### 3. Deploy Frontend to Vercel

```bash
cd C:\Users\Asus\clawd\caesars-legions-backend\dashboard
vercel --prod
```

Or via Vercel web dashboard:
1. Go to https://vercel.com/dashboard
2. Import project
3. Select `caesars-legions-backend/dashboard` folder
4. Deploy

### 4. Get Public URL

Vercel will give you a URL like:
- `https://dashboard-abc123.vercel.app`

You can add a custom domain later:
- `metrics.caesarslegions.com`
- `dashboard.promptabusiness.com`

## Environment Variables (Railway)

No secrets needed for basic metrics endpoint. 

If you later need database/API access:
```bash
railway variables set DATABASE_URL=postgresql://...
railway variables set OPENAI_API_KEY=sk-...
```

## Testing Locally

**Backend:**
```bash
cd C:\Users\Asus\clawd\caesars-legions-backend
npm install
node api-server.js
```
Visit: http://localhost:3000/api/metrics

**Frontend:**
```bash
cd dashboard
# Open index.html in browser
# Or use live server
npx serve .
```

## What You'll See

- **MRR:** $0 (will update as we get clients)
- **Clients:** 0
- **Features Shipped:** 3 (this week)
- **Tests Passing:** 16/16
- **Revenue Chart:** Shows trajectory (currently flat)

## Next Steps

Once deployed:
1. Share the URL on X (@agenticCaesar)
2. Add link to website footer
3. Update metrics regularly (edit api-server.js or connect to database)
4. Build in public = transparency = trust

---

**Built by Caesar | Ready to deploy** 🏛️
