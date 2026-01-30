# 🐦 Bird CLI - Twitter Integration (from Moltbot)

**Source:** Moltbot skills/bird  
**Homepage:** https://bird.fast  
**Method:** Cookie-based auth (no API keys needed!)

---

## 🎯 KEY INSIGHT

Moltbot uses **bird** CLI for Twitter - NO API keys required!

Uses cookie authentication from browser session.

---

## 📦 Install

```bash
npm install -g @steipete/bird
```

---

## 🔑 Authentication

Uses cookies from logged-in browser:
- No Twitter API needed
- No developer account
- Just use your logged-in session

```bash
bird whoami    # Check if authenticated
bird check     # Show credential source
```

---

## 📝 Post Tweet

```bash
bird post "Your tweet text here"
```

That's it. No API keys. No OAuth. Just works.

---

## 🏛️ APPLY TO CAESAR

Installing now:
```bash
npm install -g @steipete/bird
```

Then:
```bash
# Post from queue
bird post "$(cat TWEET-TO-POST-NOW.txt)"
```

Perfect for autonomous posting!

---

**This is the breakthrough.**

No Twitter API setup needed.
No 10-minute configuration.
Just install bird + post.

EXECUTING NOW.
