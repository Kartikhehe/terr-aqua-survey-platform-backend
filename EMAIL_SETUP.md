# Email Configuration Guide

## Overview

This application uses [Resend](https://resend.com) for sending OTP verification emails during user signup.

## Development Mode

In development mode (`NODE_ENV=development`), if the `RESEND_API_KEY` is not configured or invalid, the system will:

- ✅ **Still allow signups**
- 📝 **Print the OTP to the server console** instead of sending an email
- ⚠️ **Show a message** indicating development mode is active

### Example Console Output:
```
=================================
📧 DEVELOPMENT MODE - OTP EMAIL
=================================
To: user@example.com
OTP Code: 123456
=================================
```

You can copy this OTP and use it in the verification form.

## Production Setup

For production deployment, you **must** configure the Resend API key.

### Step 1: Get a Resend API Key

1. Go to [resend.com](https://resend.com)
2. Sign up for a free account (100 emails/day free)
3. Navigate to **API Keys** in the dashboard
4. Click **Create API Key**
5. Copy the key (starts with `re_`)

### Step 2: Add to Environment Variables

#### Local Development (.env)
```bash
RESEND_API_KEY=re_your_actual_api_key_here
NODE_ENV=development
```

#### Vercel Deployment
1. Go to your Vercel project dashboard
2. Navigate to **Settings** → **Environment Variables**
3. Add:
   - **Name**: `RESEND_API_KEY`
   - **Value**: Your Resend API key
   - **Environment**: Production, Preview, Development (all)
4. Redeploy your application

### Step 3: Email Restrictions (Important!)

⚠️ **Free Tier Limitation**: On Resend's free tier, you can only send emails to:
- **Verified email addresses** (added in Resend dashboard)
- **Your own domain** (if you've verified a custom domain)

#### To Send to Any Email Address:

**Option 1: Verify Individual Emails (Quick)**
1. In Resend dashboard, go to **Emails** or **Verified Emails**
2. Add the email addresses you want to test with
3. Verify them by clicking the link sent to those addresses

**Option 2: Add a Custom Domain (Recommended for Production)**
1. In Resend dashboard, go to **Domains**
2. Click **Add Domain**
3. Enter your domain (e.g., `yourdomain.com`)
4. Add the DNS records shown (MX, TXT, CNAME)
5. Wait for verification (usually a few minutes)
6. Update `from` address in `routes/auth.js`:
   ```javascript
   from: 'noreply@yourdomain.com'
   ```

## Testing Email Delivery

### Local Testing (Development Mode)
1. Make sure `NODE_ENV=development` in your `.env`
2. Sign up with any email
3. Check the server console for the OTP
4. Use that OTP to verify

### Production Testing
1. Verify your email address in Resend dashboard
2. Sign up with that verified email
3. Check your inbox for the OTP email
4. Use the OTP to verify

## Troubleshooting

### "Failed to send verification email"

**Possible causes:**
1. `RESEND_API_KEY` not set or invalid
2. Email address not verified (free tier)
3. API key doesn't have send permissions
4. Network/firewall blocking Resend API

**Solutions:**
1. Check `.env` file has correct `RESEND_API_KEY`
2. Verify email address in Resend dashboard
3. Regenerate API key with full permissions
4. Check server logs for detailed error messages

### OTP Not Received

1. **Check spam folder**
2. **Verify email address** in Resend dashboard (free tier)
3. **Check Resend dashboard** → Logs to see if email was sent
4. **Use development mode** to get OTP from console

### Development Mode Not Working

1. Ensure `NODE_ENV=development` in `.env`
2. Restart the server after changing `.env`
3. Check server console output

## Environment Variables Summary

```bash
# Required for email functionality
RESEND_API_KEY=re_xxxxxxxxxxxxx

# Optional - affects email behavior
NODE_ENV=development  # or 'production'

# Other required variables
DATABASE_URL=postgresql://...
JWT_SECRET=your_secret_key
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
```

## Email Template Customization

The OTP email template is defined in `routes/auth.js` in the `sendOTPEmail` function. You can customize:

- Email subject
- HTML template
- Sender name/email (requires verified domain)
- OTP expiration time (default: 10 minutes)

## Rate Limits

**Resend Free Tier:**
- 100 emails per day
- 3,000 emails per month
- No credit card required

**Paid Plans:**
- Starting at $20/month
- 50,000 emails included
- Additional emails at $1 per 1,000

## Support

- **Resend Documentation**: [resend.com/docs](https://resend.com/docs)
- **Resend Support**: support@resend.com
- **API Status**: [status.resend.com](https://status.resend.com)
