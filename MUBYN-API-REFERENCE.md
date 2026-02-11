# 🔌 MUBYN API QUICK REFERENCE

**Base URL:** `https://natural-energy-production-df04.up.railway.app`  
**Local Dev:** `http://localhost:3001`

---

## 🔐 Authentication

### Signup
```http
POST /api/auth/signup
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securepass123",
  "name": "John Doe",
  "business_name": "Acme Corp"
}
```

**Response:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "uuid-here",
    "email": "user@example.com",
    "name": "John Doe",
    "business_name": "Acme Corp"
  }
}
```

---

### Login
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securepass123"
}
```

**Response:** Same as signup

---

### Get Current User
```http
GET /api/auth/me
Authorization: Bearer <token>
```

**Response:**
```json
{
  "id": "uuid-here",
  "email": "user@example.com",
  "name": "John Doe",
  "business_name": "Acme Corp"
}
```

---

## 💬 Caesar Chat

### Send Message
```http
POST /api/chat
Content-Type: application/json

{
  "message": "Find me 10 leads in tech industry",
  "userId": "uuid-here"
}
```

**Response:**
```json
{
  "response": "I'll help you find leads in the tech industry. Let me search for qualified prospects... [AI response]"
}
```

---

## 🎯 Leads

### Search Leads
```http
POST /api/leads/search
Content-Type: application/json

{
  "query": "Google",
  "location": "United States",
  "industry": "Technology",
  "userId": "uuid-here"
}
```

**Response:**
```json
{
  "leads": [
    {
      "id": "uuid-here",
      "name": "John Smith",
      "email": "john@google.com",
      "company": "Google",
      "title": "Senior Engineer",
      "location": "Mountain View, CA",
      "source": "apollo",
      "created_at": "2026-02-11T..."
    }
  ]
}
```

---

### Get User Leads
```http
GET /api/leads/:userId
```

**Response:**
```json
{
  "leads": [...]
}
```

---

## ✍️ Content Generation

### Generate Content
```http
POST /api/content/generate
Content-Type: application/json

{
  "topic": "AI in business",
  "platform": "twitter",
  "language": "en",
  "userId": "uuid-here"
}
```

**Response:**
```json
{
  "id": "uuid-here",
  "content": "AI is transforming how businesses operate...",
  "topic": "AI in business",
  "platform": "twitter",
  "language": "en",
  "status": "draft",
  "created_at": "2026-02-11T..."
}
```

**Supported platforms:** `twitter`, `linkedin`, `instagram`, `facebook`, `tiktok`  
**Supported languages:** `en`, `ar`

---

### Get User Content
```http
GET /api/content/:userId
```

**Response:**
```json
{
  "content": [...]
}
```

---

## 🤝 Customer Support (CSA)

### Get AI Response
```http
POST /api/csa/respond
Content-Type: application/json

{
  "customer_message": "How do I reset my password?",
  "business_context": "SaaS product with email-based auth",
  "userId": "uuid-here"
}
```

**Response:**
```json
{
  "response": "To reset your password, please follow these steps..."
}
```

---

### Get Conversations
```http
GET /api/csa/conversations/:userId
```

**Response:**
```json
{
  "conversations": [
    {
      "id": "uuid-here",
      "customer_message": "...",
      "ai_response": "...",
      "business_context": "...",
      "timestamp": "2026-02-11T..."
    }
  ]
}
```

---

## 🔄 Frontend Integration Example

```typescript
// config.ts
export const API_BASE_URL = 'https://natural-energy-production-df04.up.railway.app';

// auth.ts
export async function signup(email: string, password: string, name: string, business_name: string) {
  const response = await fetch(`${API_BASE_URL}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, name, business_name })
  });
  const data = await response.json();
  
  if (data.token) {
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
  }
  
  return data;
}

// api.ts
export async function chatWithCaesar(message: string) {
  const token = localStorage.getItem('token');
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  
  const response = await fetch(`${API_BASE_URL}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ message, userId: user.id })
  });
  
  return response.json();
}

// leads.ts
export async function searchLeads(query: string, location?: string, industry?: string) {
  const token = localStorage.getItem('token');
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  
  const response = await fetch(`${API_BASE_URL}/api/leads/search`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ query, location, industry, userId: user.id })
  });
  
  return response.json();
}
```

---

## ⚠️ Error Handling

All endpoints return consistent error format:

```json
{
  "error": "Error message here",
  "details": "Additional context (optional)"
}
```

**Common Status Codes:**
- `200` - Success
- `400` - Bad request (missing/invalid params)
- `401` - Unauthorized (no/invalid token)
- `403` - Forbidden (valid token but no access)
- `404` - Not found
- `500` - Server error

---

## 🧪 Testing with cURL

```bash
# Signup
curl -X POST https://natural-energy-production-df04.up.railway.app/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"test123","name":"Test","business_name":"TestCo"}'

# Login
curl -X POST https://natural-energy-production-df04.up.railway.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"test123"}'

# Chat (replace TOKEN)
curl -X POST https://natural-energy-production-df04.up.railway.app/api/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN" \
  -d '{"message":"Hello Caesar","userId":"test"}'

# Search Leads
curl -X POST https://natural-energy-production-df04.up.railway.app/api/leads/search \
  -H "Content-Type: application/json" \
  -d '{"query":"Google","location":"United States","userId":"test"}'

# Generate Content
curl -X POST https://natural-energy-production-df04.up.railway.app/api/content/generate \
  -H "Content-Type: application/json" \
  -d '{"topic":"AI trends","platform":"twitter","language":"en","userId":"test"}'

# CSA Response
curl -X POST https://natural-energy-production-df04.up.railway.app/api/csa/respond \
  -H "Content-Type: application/json" \
  -d '{"customer_message":"Need help","business_context":"SaaS","userId":"test"}'
```

---

## 📱 CORS

Allowed origins:
- `https://app.mubyn.com`
- `https://caesarslegions.ai`
- `https://promptabusiness.com`
- `http://localhost:3500`
- `http://localhost:5173`

If you need to add more origins, update `ALLOWED_ORIGINS` in `api-server.js`.

---

## 🔑 Environment Variables

Required in Railway:
```bash
ANTHROPIC_API_KEY=sk-ant-api03-...
JWT_SECRET=mubyn-demo-secret-2026
APOLLO_API_KEY=vndGs9TB42TIG7zcdO6zVQ
```

---

## 📊 Rate Limits

**Apollo.io:** 
- Free tier: ~50 requests/day
- Keep demo searches minimal

**Anthropic:**
- Depends on API tier
- Current key needs credits!

---

## 🆘 Troubleshooting

**"Invalid token"**
- Token expired (30 days max)
- Use `/api/auth/login` to get new token

**"Chat failed" with Anthropic error**
- API key needs credits
- Check Railway logs for details

**CORS error**
- Verify origin is in ALLOWED_ORIGINS
- Check browser console for exact error

**"User not found"**
- Token valid but user deleted from users.json
- Re-signup or check data/ directory

---

**Ready to integrate! 🚀**
