# Supabase Configuration Setup Guide

## Overview

The MzDocs Pro v3 application uses a production-ready Supabase configuration system with:
- **Singleton pattern** for centralized instance management
- **Authentication listeners** for session persistence
- **Safe environment variables** (never hardcoded in frontend)
- **Comprehensive error handling** with fallback support
- **RPC functions** for atomic database operations

## Architecture

### Files

| File | Purpose |
|------|---------|
| `assets/js/config/supabase.js` | Singleton config with auth, credits, payments |
| `index.html` (meta tags) | Credential injection points (backend-populated) |
| `assets/js/app.js` | Imports and initializes supabaseConfig |
| `netlify/functions/` | Backend functions that populate meta tags |

### Credential Injection Flow

```
1. Backend receives request to serve index.html
   ↓
2. Backend reads SUPABASE_URL and SUPABASE_ANON_KEY from process.env
   ↓
3. Backend injects credentials into meta tags:
   - <meta name="supabase-url" content="https://xxx.supabase.co"/>
   - <meta name="supabase-anon-key" content="ey..."/>
   ↓
4. Frontend app.js imports supabaseConfig
   ↓
5. supabaseConfig.init() reads meta tags and initializes client
   ↓
6. Auth listener set up for session persistence
```

## Setup Steps

### 1. Environment Variables (Netlify)

Set in your Netlify deployment settings or `.env` during local development:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### 2. Backend Function (Example)

Create a simple middleware or modify your existing server to inject credentials:

```javascript
// Example: Netlify Function serving HTML
export async function handler(event) {
  const html = fs.readFileSync('index.html', 'utf-8');
  
  // Inject Supabase credentials
  const injectedHtml = html
    .replace('content=""', `content="${process.env.SUPABASE_URL}"`, 'name="supabase-url"')
    .replace('content=""', `content="${process.env.SUPABASE_ANON_KEY}"`, 'name="supabase-anon-key"');
  
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'text/html' },
    body: injectedHtml
  };
}
```

Or use a simple HTML templating approach:

```javascript
const htmlTemplate = `
<!DOCTYPE html>
<html>
<head>
  <meta name="supabase-url" content="${process.env.SUPABASE_URL}"/>
  <meta name="supabase-anon-key" content="${process.env.SUPABASE_ANON_KEY}"/>
</head>
...
`;
```

### 3. Alternative: Direct Window Variables

If serving static HTML, inject via inline script before app.js loads:

```html
<script>
  // NEVER expose in production source code - use backend to inject
  window.__SUPABASE_URL__ = "${SUPABASE_URL}";
  window.__SUPABASE_ANON_KEY__ = "${SUPABASE_ANON_KEY}";
</script>
<script type="module" src="assets/js/app.js"></script>
```

## API Reference

### supabaseConfig Methods

#### Authentication

```javascript
// Get current user
const user = supabaseConfig.getUser();

// Get current session
const session = supabaseConfig.getSession();

// Check if authenticated
const isAuth = supabaseConfig.isAuthenticated();

// Sign in
const { user, session, error } = await supabaseConfig.signIn(
  'user@example.com',
  'password'
);

// Sign up
const { user, session, error } = await supabaseConfig.signUp(
  'user@example.com',
  'password',
  { language: 'pt' } // metadata
);

// Sign out
const { error } = await supabaseConfig.signOut();
```

#### User Profile

```javascript
// Get user profile
const { data, error } = await supabaseConfig.getUser(userId);

// Update profile
const { data, error } = await supabaseConfig.updateProfile(userId, {
  nome: 'John Doe',
  telefone: '258844123456'
});
```

#### Credits System

```javascript
// Get user credits
const { credits, error } = await supabaseConfig.getCredits(userId);

// Consume credits (atomic via RPC)
const { credits: remaining, error } = await supabaseConfig.consumeCredits(
  userId,
  1 // amount to deduct
);
```

#### Payments

```javascript
// Submit payment (creates pending record)
const { payment, error } = await supabaseConfig.submitPayment(
  userId,
  'John Doe',
  '+258844123456',
  'TXN_REF_123',
  350 // MZN amount
);

// Get pending payments (admin only)
const { payments, error } = await supabaseConfig.getPendingPayments();

// Approve payment via RPC (admin only)
const { success, error } = await supabaseConfig.approvePayment(paymentId);
```

#### Instance Management

```javascript
// Get or initialize singleton
const client = await supabaseConfig.getInstance();

// Direct Supabase client access if needed
const { data, error } = await client
  .from('your_table')
  .select('*');
```

### Events

The configuration emits custom events on `window` for components to react:

```javascript
// Listen for auth changes
window.addEventListener('supabase-auth-change', (event) => {
  const { event: authEvent, session, user } = event.detail;
  console.log('Auth event:', authEvent, user?.email);
});

// Possible events: SIGNED_IN, SIGNED_OUT, TOKEN_REFRESHED, USER_UPDATED
```

## Database Schema

### Required Tables

#### `perfis_usuarios` (Users)

```sql
CREATE TABLE perfis_usuarios (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  email VARCHAR NOT NULL,
  nome VARCHAR,
  telefone VARCHAR,
  creditos INTEGER DEFAULT 0,
  creditos_gratis INTEGER DEFAULT 3,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE perfis_usuarios ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only read their own profile
CREATE POLICY "Users can read own profile"
  ON perfis_usuarios FOR SELECT
  USING (id = auth.uid());

-- RLS Policy: Users can update own profile
CREATE POLICY "Users can update own profile"
  ON perfis_usuarios FOR UPDATE
  USING (id = auth.uid());
```

#### `pagamentos_pendentes` (Pending Payments)

```sql
CREATE TABLE pagamentos_pendentes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES perfis_usuarios(id),
  nome VARCHAR NOT NULL,
  telefone VARCHAR NOT NULL,
  referencia_transacao VARCHAR NOT NULL,
  montante DECIMAL(10,2) NOT NULL,
  status VARCHAR DEFAULT 'pending', -- pending, approved, rejected
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE pagamentos_pendentes ENABLE ROW LEVEL SECURITY;

-- Admin can manage all payments
-- Users can view own payments
CREATE POLICY "Users can view own payments"
  ON pagamentos_pendentes FOR SELECT
  USING (user_id = auth.uid() OR auth.jwt() ->> 'role' = 'admin');
```

### Required RPC Functions

#### `consumir_creditos(user_id, amount)`

```sql
CREATE OR REPLACE FUNCTION consumir_creditos(
  user_id UUID,
  amount INTEGER
) RETURNS INTEGER AS $$
DECLARE
  current_credits INTEGER;
BEGIN
  -- Get current credits with row lock
  SELECT creditos INTO current_credits
  FROM perfis_usuarios
  WHERE id = user_id
  FOR UPDATE;

  -- Check balance
  IF current_credits < amount THEN
    RAISE EXCEPTION 'Insufficient credits';
  END IF;

  -- Deduct credits
  UPDATE perfis_usuarios
  SET creditos = creditos - amount,
      updated_at = NOW()
  WHERE id = user_id;

  RETURN current_credits - amount;
END;
$$ LANGUAGE plpgsql;
```

#### `aprovar_pagamento_admin(payment_id)`

```sql
CREATE OR REPLACE FUNCTION aprovar_pagamento_admin(
  payment_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
  pago_user_id UUID;
  pago_montante DECIMAL(10,2);
BEGIN
  -- Verify admin (checks JWT role = 'admin')
  IF auth.jwt() ->> 'role' != 'admin' THEN
    RAISE EXCEPTION 'Unauthorized: admin only';
  END IF;

  -- Get payment details
  SELECT user_id, montante INTO pago_user_id, pago_montante
  FROM pagamentos_pendentes
  WHERE id = payment_id;

  -- Update payment status
  UPDATE pagamentos_pendentes
  SET status = 'approved',
      updated_at = NOW()
  WHERE id = payment_id;

  -- Add credits to user
  UPDATE perfis_usuarios
  SET creditos = creditos + pago_montante::INTEGER,
      updated_at = NOW()
  WHERE id = pago_user_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;
```

## Security Considerations

### ✅ Do's

- ✅ Inject credentials via backend/meta tags
- ✅ Use RLS policies to enforce row-level security
- ✅ Keep API operations RPC-wrapped for atomicity
- ✅ Validate user permissions on backend
- ✅ Rotate API keys regularly
- ✅ Use `SUPABASE_ANON_KEY` (read-only, RLS-enforced)

### ❌ Don'ts

- ❌ Hardcode credentials in source code
- ❌ Commit `.env` or credentials to git
- ❌ Use `SUPABASE_SERVICE_KEY` in frontend
- ❌ Disable RLS on sensitive tables
- ❌ Trust client-side auth checks alone
- ❌ Expose payment/credit internals via direct SQL

## Troubleshooting

### Credentials Not Loading

**Problem:** `[Supabase] Credentials not configured`

**Solution:**
1. Verify meta tags are populated: Open DevTools → Elements → search "supabase"
2. Check that backend is injecting credentials
3. Verify Netlify environment variables are set

### Auth Not Persisting

**Problem:** User logs out after refresh

**Solution:**
1. Check localStorage is not blocked (DevTools → Application)
2. Verify `persistSession: true` in init options
3. Check browser privacy mode (doesn't support localStorage)

### RPC Functions Return Errors

**Problem:** `consumir_creditos()` fails with permission error

**Solution:**
1. Verify user is authenticated: `supabaseConfig.isAuthenticated()`
2. Check RLS policies allow SELECT on `perfis_usuarios`
3. Verify RPC function exists: `supabase → SQL Editor → Functions`
4. Check PostgreSQL function syntax is valid

### CORS Errors

**Problem:** `No 'Access-Control-Allow-Origin' header`

**Solution:**
1. Verify SUPABASE_URL is correct (should be `https://xxx.supabase.co`)
2. Check Netlify environment variables
3. Clear browser cache and hard-refresh

## Local Development

For local testing, create `.env.local`:

```env
SUPABASE_URL=https://your-local-project.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

Then inject before running:

```html
<script>
  window.__SUPABASE_URL__ = 'https://your-local-project.supabase.co';
  window.__SUPABASE_ANON_KEY__ = 'eyJ...';
</script>
<script type="module" src="assets/js/app.js"></script>
```

## Next Steps

1. ✅ Create `assets/js/config/supabase.js` (DONE)
2. ✅ Update `index.html` with credential meta tags (DONE)
3. ✅ Update `assets/js/app.js` to import and initialize (DONE)
4. ⏳ Create database tables and RLS policies
5. ⏳ Create RPC functions
6. ⏳ Implement backend injection middleware
7. ⏳ Test full auth and payment flows

---

**Version:** MzDocs Pro v3  
**Last Updated:** 2024  
**Maintainer:** Development Team
