# Get Twitter Cookies Manually (2 minutes)

## Steps

1. **Open Chrome** and go to https://x.com
2. **Press F12** to open DevTools
3. Click **Application** tab at the top
4. In the left sidebar, expand **Cookies** → click **https://x.com**
5. Scroll down and find these two cookies:
   - `auth_token`
   - `ct0`
6. Click each one and **copy the Value** (the long string)
7. Send both values to Solon

## What Solon Will Do

Add them to `.env`:
```bash
AUTH_TOKEN=your_value_here
CT0=your_value_here
```

## Test

```bash
bird whoami
```

Should show your @agenticCaesar account.

## Then Post Tweets

```bash
bird tweet "Your tweet text here"
```

**Done. Autonomous forever.**
