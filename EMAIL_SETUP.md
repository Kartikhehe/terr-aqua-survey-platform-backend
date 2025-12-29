# Email Configuration Guide (Nodemailer)

## Overview

This application uses [Nodemailer](https://nodemailer.com/) for sending One-Time Password (OTP) verification emails during user signup and password reset.

## Development Mode

In development mode (`NODE_ENV=development`), if SMTP credentials are not configured or invalid, the system will:

- ✅ **Still allow requests**
- 📝 **Print the OTP to the server console** instead of sending an email
- ⚠️ **Show a message** indicating console fallback is active

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

## SMTP Configuration

To send actual emails, you must configure SMTP settings in your environment variables.

### Recommended: Using Gmail

1. Go to your [Google Account Settings](https://myaccount.google.com/)
2. Enable **2-Step Verification**
3. Go to **Security** and search for **App Passwords**
4. Create a new App Password for "Mail" and "Other (Custom Name: TerrAqua)"
5. Copy the 16-character password

### Step 2: Add to Environment Variables

#### Local Development (`server/.env`)
```bash
# SMTP Settings
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password-no-spaces
SMTP_SECURE=false
SMTP_FROM="TerrAqua Support" <your-email@gmail.com>

NODE_ENV=development
```

#### Vercel Deployment
1. Go to your Vercel project dashboard
2. Navigate to **Settings** → **Environment Variables**
3. Add the following keys:
   - `SMTP_HOST`
   - `SMTP_PORT`
   - `SMTP_USER`
   - `SMTP_PASS`
   - `SMTP_SECURE` (set to `true` if port is 465, `false` otherwise)
   - `SMTP_FROM`
4. Redeploy your application

## Testing Email Delivery

### Local Testing (Development Mode)
1. Make sure `NODE_ENV=development` in your `.env`
2. Sign up with any email
3. Check the server console for the OTP
4. Use that OTP to verify

### Production Testing
1. Configure real SMTP credentials
2. Sign up with a real email
3. Check your inbox (or spam) for the OTP email
4. Use the OTP to verify

## Next Steps: Forgotten Password Flow

The forgotten password flow is already implemented using the same Nodemailer setup.

### The Flow:
1. **User requests reset**: `POST /auth/forgot-password` with `{ email }`.
   - Backend sends OTP via Nodemailer.
2. **User verifies OTP**: `POST /auth/verify-reset-otp` with `{ email, otp }`.
   - If valid, backend returns a temporary `resetToken` (valid for 15m).
3. **User resets password**: `POST /auth/reset-password` with `{ resetToken, password }`.
   - Backend verifies token and updates the user's password.

## Troubleshooting

### "Email sending failed"

**Possible causes:**
1. SMTP credentials incorrect (Check `SMTP_USER` and `SMTP_PASS`)
2. Port blocked by host (common on some cloud providers for port 25 or 587)
3. App Password missing (for Gmail)
4. Network issues

**Solutions:**
1. Verify credentials by testing with a small script
2. Check if your provider requires `SMTP_SECURE=true` (Port 465)
3. Check server logs for the specific error message from Nodemailer

## Environment Variables Summary

```bash
# SMTP Configuration
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=...
SMTP_PASS=...
SMTP_SECURE=false
SMTP_FROM="TerrAqua Support" <support@terraqua.me>

# Global Settings
NODE_ENV=development
JWT_SECRET=...
DATABASE_URL=...
```

## Email Template Customization

Templates are defined in `server/routes/auth.js` within `sendOTPEmail` and `sendPasswordResetOTP`. You can modify the HTML strings there.
