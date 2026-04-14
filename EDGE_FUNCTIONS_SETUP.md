# Supabase Edge Function Setup Guide

## Overview

The MzDocs Pro application uses Supabase Edge Functions to securely proxy requests to the OpenRouter API. This prevents exposing API keys in the frontend and adds an authentication layer.

## Architecture

```
Frontend (app.js)
    ↓
Supabase Edge Function (openrouter-proxy)
    ↓ (validates JWT + API key)
OpenRouter API
    ↓
Response → Frontend
```

## Files Created

1. **`supabase/functions/openrouter-proxy/index.ts`**
   - Main Edge Function for OpenRouter proxying
   - Validates Supabase JWT tokens
   - Validates request body (serviceType, prompt)
   - Calls OpenRouter API securely
   - Returns formatted response

2. **`supabase/functions/_shared/cors.ts`**
   - Shared CORS headers for all Edge Functions

3. **`deno.json`**
   - Deno configuration for imports and tasks

## Environment Variables

You need to set these in your Supabase project:

```env
# Required
OPENROUTER_API_KEY=sk-or-v1-xxxxx...  # Your OpenRouter API key

# Optional
SITE_URL=https://your-frontend-url.example  # Your frontend URL for referer
```

### How to Set Environment Variables in Supabase

1. Go to [Supabase Dashboard](https://app.supabase.com)
2. Select your project
3. Navigate to **Settings → Edge Functions** (or **Functions** section)
4. Click on the `openrouter-proxy` function
5. Scroll to **Environment Variables**
6. Add:
   - Key: `OPENROUTER_API_KEY`
   - Value: `sk-or-v1-...` (your OpenRouter API key)
7. Click **Save**

If ENV vars aren't visible yet:
- Use the Supabase CLI: `supabase secrets set OPENROUTER_API_KEY=sk-or-v1-xxxxx...`

## OpenRouter API Key

1. Sign up at [OpenRouter](https://openrouter.ai)
2. Go to [Keys](https://openrouter.ai/keys)
3. Create a new API key with "Create Key" button
4. Copy the key (starts with `sk-or-v1-`)
5. Save it securely (you'll only see it once)

## Testing Locally

### Using Supabase CLI

```bash
# Install Supabase CLI if not already installed
npm install -g supabase

# In your project root
supabase start  # Start local Supabase instance

# In another terminal
supabase functions serve openrouter-proxy

# Test with curl
curl -X POST http://localhost:54321/functions/v1/openrouter-proxy \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "serviceType": "trabalho",
    "prompt": "Write a professional job application letter for a senior software engineer position"
  }'
```

### Getting a Test JWT Token

```bash
# Use supabase CLI to generate a test token
supabase auth token

# Or create a user and get token programmatically from your frontend
```

## Deploying to Supabase

### Method 1: Using Supabase CLI (Recommended)

```bash
# Login to Supabase
supabase login

# Link to your project
supabase link --project-ref YOUR_PROJECT_REF

# Deploy functions
supabase functions deploy openrouter-proxy

# Set environment variables
supabase secrets set OPENROUTER_API_KEY=sk-or-v1-xxxxx...
```

### Method 2: Manual Upload via Dashboard

1. Go to Supabase Dashboard
2. Navigate to **Functions**
3. Click **Create a new function**
4. Name it `openrouter-proxy`
5. Paste the code from `supabase/functions/openrouter-proxy/index.ts`
6. Click **Deploy**
7. Set environment variables (see previous section)

## Frontend Integration

### Using from DocumentController

```javascript
// In assets/js/controllers/DocumentController.js
async generateDocument(serviceType, prompt, model = null) {
  try {
    const token = await supabaseConfig.getInstance().auth.getSession();
    if (!token?.session?.access_token) {
      throw new Error('Not authenticated');
    }

    const response = await fetch(
      `${supabaseConfig.getInstance().url}/functions/v1/openrouter-proxy`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token.session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          serviceType,
          prompt,
          model: model || 'meta-llama/llama-3.3-70b-instruct:free',
        }),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Generation failed');
    }

    const data = await response.json();
    return data.document;
  } catch (error) {
    console.error('Generation error:', error);
    throw error;
  }
}
```

## Security Features

1. **JWT Validation**: Verifies Supabase access token before proxying
2. **Service Whitelist**: Only allows specific serviceTypes
3. **Prompt Validation**: Limits prompt length (10-5000 chars) to prevent abuse
4. **API Key Protection**: OpenRouter API key never exposed to frontend
5. **Error Handling**: Safely returns errors without exposing sensitive details
6. **Rate Limiting**: OpenRouter handles rate limiting with HTTP 429 responses

## Error Codes

| Code | Status | Meaning |
|------|--------|---------|
| `MISSING_AUTH` | 401 | No Authorization header |
| `INVALID_TOKEN` | 401 | Invalid or expired JWT |
| `MISSING_FIELDS` | 400 | Missing required fields |
| `INVALID_SERVICE` | 400 | Invalid serviceType |
| `INVALID_PROMPT` | 400 | Prompt length invalid |
| `RATE_LIMIT` | 429 | Too many requests |
| `NO_CREDITS` | 402 | OpenRouter account out of credits |
| `AUTH_ERROR` | 401 | Invalid API key |
| `OPENROUTER_ERROR` | 500+ | OpenRouter API error |
| `INTERNAL_ERROR` | 500 | Server error |

## Monitoring & Logs

### View Logs in Supabase Dashboard

1. Go to **Functions** section
2. Click on `openrouter-proxy`
3. Scroll to **Logs** tab
4. View real-time execution logs

### Using Supabase CLI

```bash
supabase functions serve openrouter-proxy --debug
```

## Troubleshooting

### "API key not configured"
- Check that `OPENROUTER_API_KEY` is set in Supabase
- Wait a few minutes after setting (may need redeployment)

### "Rate limited"
- OpenRouter is limiting your requests
- Check your account at openrouter.ai/account/billing
- Add credits or wait for rate limit to reset

### "No credits"
- Your OpenRouter account has no credits
- Add credits: https://openrouter.ai/account/billing
- Use free models: `meta-llama/llama-3.3-70b-instruct:free`

### "Invalid token"
- User session expired
- Requires re-login
- Implement session refresh in frontend

### CORS errors in browser
- Check that `corsHeaders` include correct origin
- Verify function is deployed and responding
- Test with `curl` first to isolate the issue

## Function URL

Once deployed, your function will be available at:

```
https://<your-project-ref>.supabase.co/functions/v1/openrouter-proxy
```

Example full URL:
```
https://abcdefg123456.supabase.co/functions/v1/openrouter-proxy
```

## Next Steps

1. ✅ Create Edge Function files (DONE)
2. ⏳ Set `OPENROUTER_API_KEY` in Supabase
3. ⏳ Deploy function: `supabase functions deploy openrouter-proxy`
4. ⏳ Update `DocumentController` to call the function
5. ⏳ Test end-to-end document generation

## References

- [Supabase Edge Functions Docs](https://supabase.com/docs/guides/functions)
- [Deno Documentation](https://docs.deno.com)
- [OpenRouter API](https://openrouter.ai/docs/api)
- [Supabase JWT](https://supabase.com/docs/guides/auth/jwt)
