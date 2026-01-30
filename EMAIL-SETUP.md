# Email Setup for Autonomous Outreach

## Quick Setup (5 minutes)

### Option 1: Gmail (Recommended for testing)

1. **Create/use Gmail account for Caesar:**
   - Use existing: kareem@gmail.com OR
   - Create new: caesar.legions@gmail.com

2. **Enable App Password:**
   - Go to: https://myaccount.google.com/apppasswords
   - Create app password for "Mail"
   - Copy the 16-character password

3. **Add to .env:**
   ```bash
   GMAIL_USER=your-email@gmail.com
   GMAIL_APP_PASSWORD=your_16_char_password
   CAESAR_EMAIL=your-email@gmail.com
   ```

4. **Test:**
   ```bash
   node scripts/email-outreach.js
   ```

### Option 2: Custom Domain (Professional)

1. **Set up email:**
   - caesar@caesarslegions.ai (if domain exists)
   - Get SMTP credentials from hosting provider

2. **Add to .env:**
   ```bash
   SMTP_HOST=smtp.your-provider.com
   SMTP_PORT=587
   SMTP_USER=caesar@caesarslegions.ai
   SMTP_PASS=your_password
   CAESAR_EMAIL=caesar@caesarslegions.ai
   ```

## Current Status

**Email access:** NOT CONFIGURED
**Autonomous permission:** GRANTED by Kareem

**Once configured, I will:**
- Send outreach emails to all 5+ prospects
- Monitor replies
- Book calls automatically
- Track engagement

## Next Steps

1. Choose Option 1 or 2 above
2. Add credentials to `.env`
3. Run: `node scripts/email-outreach.js`
4. I'll handle the rest autonomously

---

**For now:** Using Reddit DMs instead (manual execution required)
