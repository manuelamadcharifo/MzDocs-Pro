# Supabase SQL Schema Deployment Guide

## Overview

The `supabase/schema.sql` file contains the complete production-ready database schema for MzDocs Pro including:

- **Tables**: `perfis_usuarios`, `pagamentos_pendentes`, `transacoes`
- **Indexes**: Performance optimizations for queries
- **Triggers**: Automatic timestamp updates and transaction logging
- **RLS Policies**: Row-level security for data protection
- **RPC Functions**: Server-side procedures for atomic operations

## Execution Steps

### Method 1: Supabase Dashboard (RECOMMENDED)

1. **Open Supabase Dashboard**
   - Go to [supabase.com](https://supabase.com)
   - Log in and select your `MzDocs-Pro` project

2. **Open SQL Editor**
   - Click **SQL Editor** (left sidebar)
   - Click **New Query** (top right)

3. **Copy and Paste Schema**
   - Open `supabase/schema.sql` from the project
   - Copy **ALL** content
   - Paste into SQL Editor

4. **Execute**
   - Click **Run** (Cmd+Enter or bottom right)
   - Watch for green checkmarks (✅ success)
   - Watch for red X's (❌ errors) — scroll to see details

5. **Verify Completion**
   - Check left sidebar under **Database** → **Tables**
   - Should see: `auth`, `perfis_usuarios`, `pagamentos_pendentes`, `transacoes`
   - Click each table to verify structure

### Method 2: Supabase CLI

```bash
# In project root
supabase db push

# Or manually with psql
supabase link --project-ref YOUR_PROJECT_REF
supabase db execute < supabase/schema.sql
```

## What Gets Created

### Tables

#### `perfis_usuarios` (User Profiles)
```
id (UUID)                    -- Links to auth.users
email (TEXT, UNIQUE)         -- User email
nome_completo (TEXT)         -- Full name
telefone (TEXT)              -- Phone number
creditos (INTEGER)           -- Current credit balance
creditos_gratis (INTEGER)    -- Free tier allowance
creditos_gastos (INTEGER)    -- Total consumed
documentos_gerados (INTEGER) -- Count of generated documents
admin (BOOLEAN)              -- Admin flag
created_at / updated_at      -- Timestamps
metadata (JSONB)             -- Extra data
```

#### `pagamentos_pendentes` (Pending Payments)
```
id (UUID)                    -- Payment ID
user_id (UUID)               -- Links to perfis_usuarios
email_usuario (TEXT)         -- User email (snapshot)
telefone (TEXT)              -- M-Pesa phone number
montante (INTEGER)           -- Amount in MZN
creditos_comprados (INTEGER) -- Credits purchased
referencia (TEXT, UNIQUE)    -- M-Pesa reference (duplicate check)
status (TEXT)                -- pending | approved | rejected
motivo_rejeicao (TEXT)       -- Rejection reason
admin_revisado_por (UUID)    -- Admin who reviewed
nota_admin (TEXT)            -- Admin notes
revisado_em (TIMESTAMPTZ)    -- When reviewed
created_at / updated_at      -- Timestamps
metadata (JSONB)             -- Extra data
```

#### `transacoes` (Audit Trail)
```
id (UUID)                    -- Transaction ID
user_id (UUID)               -- Links to perfis_usuarios
tipo (TEXT)                  -- compra | consumo | reembolso | revogacao
creditos (INTEGER)           -- Amount affected
descricao (TEXT)             -- Human-readable description
referencia_mpesa (TEXT)      -- M-Pesa reference if applicable
pagamento_id (UUID)          -- Links to pagamento if applicable
created_at                   -- When transaction occurred
metadata (JSONB)             -- Extra data
```

### Indexes (for Query Performance)

```sql
idx_perfis_admin              -- Quick admin lookups
idx_pagamentos_user_id        -- User's payments
idx_pagamentos_status         -- Filter by status
idx_pagamentos_referencia     -- M-Pesa reference lookup
idx_pagamentos_created        -- Sort by date
idx_transacoes_user_id        -- User's transactions
idx_transacoes_tipo           -- Filter by type
idx_transacoes_created        -- Transaction history
```

### Triggers (Automatic Operations)

1. **`trigger_perfis_updated_at`**
   - Updates `updated_at` whenever profile changes
   - Automatic timestamp management

2. **`trigger_pagamentos_updated_at`**
   - Updates `updated_at` whenever payment changes
   - Automatic timestamp management

3. **`trigger_pagamentos_aprovado`**
   - Logs transaction when payment is approved
   - Creates audit trail automatically

## RPC Functions (Server-Side Procedures)

### 1. `consumir_creditos(p_quantidade INTEGER)`

**Purpose:** Atomically deduct credits from user's balance

**Example Usage (Frontend):**
```javascript
const { data, error } = await supabaseConfig
  .getInstance()
  .rpc('consumir_creditos', {
    p_quantidade: 1  // Deduct 1 credit
  });

if (data.success) {
  console.log('New balance:', data.novo_saldo);
  console.log('Consumed:', data.consumido);
} else {
  console.error('Error:', data.error);
}
```

**Returns:**
```json
{
  "success": true,
  "novo_saldo": 2,
  "consumido": 1
}
```

**Error Response:**
```json
{
  "success": false,
  "error": "Insufficient credits",
  "novo_saldo": 0
}
```

**Security:**
- `SECURITY DEFINER`: Runs with owner privileges
- Only authenticated users can call
- Automatically uses `auth.uid()` for the user

---

### 2. `aprovar_pagamento_admin(p_pagamento_id UUID, p_nota TEXT)`

**Purpose:** Admin approval: move credits from payment to user balance

**Prerequisites:**
- Caller must be authenticated
- Caller must have `admin = TRUE` in `perfis_usuarios`

**Example Usage (AdminController):**
```javascript
const { data, error } = await supabaseConfig
  .getInstance()
  .rpc('aprovar_pagamento_admin', {
    p_pagamento_id: '550e8400-e29b-41d4-a716-446655440000',
    p_nota: 'M-Pesa confirmed, payment valid'  // Optional
  });

if (data.success) {
  console.log('Payment approved!');
  console.log('Credits added:', data.creditos_adicionados);
  console.log('New user balance:', data.novo_saldo_usuario);
} else {
  console.error('Error:', data.error);
}
```

**Returns (Success):**
```json
{
  "success": true,
  "mensagem": "Pagamento aprovado com sucesso",
  "pagamento_id": "550e8400-e29b-41d4-a716-446655440000",
  "usuario_id": "auth-uuid-here",
  "creditos_adicionados": 50,
  "novo_saldo_usuario": 53,
  "aprovado_em": "2026-04-12T15:30:45.123Z"
}
```

**Returns (Error):**
```json
{
  "success": false,
  "error": "Unauthorized: admin access required"
}
```

**Atomic Operations:**
1. Verifies admin status
2. Locks payment record
3. Updates payment status to `approved`
4. Adds credits to user
5. Logs transaction
6. All-or-nothing: if step fails, all rollback

---

### 3. `rejeitar_pagamento_admin(p_pagamento_id UUID, p_motivo TEXT)`

**Purpose:** Reject a pending payment with reason

**Example Usage:**
```javascript
const { data, error } = await supabaseConfig
  .getInstance()
  .rpc('rejeitar_pagamento_admin', {
    p_pagamento_id: '550e8400-e29b-41d4-a716-446655440000',
    p_motivo: 'M-Pesa reference not found in operator'
  });
```

**Returns (Success):**
```json
{
  "success": true,
  "mensagem": "Pagamento rejeitado com sucesso",
  "motivo": "M-Pesa reference not found",
  "rejeitado_em": "2026-04-12T15:30:45.123Z"
}
```

---

## Utility Functions (Information Retrieval)

### `obter_perfil_usuario()`

**Purpose:** Get current user's profile (safe for frontend)

**Example:**
```javascript
const { data, error } = await supabaseConfig
  .getInstance()
  .rpc('obter_perfil_usuario');

// Returns single row
console.log(data[0]);
// {
//   id: "user-uuid",
//   email: "user@example.com",
//   nome_completo: "João Silva",
//   creditos: 3,
//   creditos_gastos: 5,
//   documentos_gerados: 8,
//   admin: false,
//   created_at: "2026-04-10T..."
// }
```

---

### `obter_estatisticas_pagamentos()`

**Purpose:** Admin statistics dashboard (requires admin role)

**Example:**
```javascript
const { data, error } = await supabaseConfig
  .getInstance()
  .rpc('obter_estatisticas_pagamentos');

console.log(data[0]);
// {
//   pendentes: 15,
//   aprovados: 145,
//   rejeitados: 8,
//   montante_total: 7250,        // MZN
//   creditos_vendidos: 2847
// }
```

---

## RLS Policies (Security)

### `perfis_usuarios` Policies

| Policy | Condition |
|--------|-----------|
| View own profile | `auth.uid() = id` |
| Update own | `auth.uid() = id` |
| Admins view all | User has `admin = TRUE` |
| Admins update all | User has `admin = TRUE` |

### `pagamentos_pendentes` Policies

| Policy | Condition |
|--------|-----------|
| View own payments | `auth.uid() = user_id` |
| Insert own | `auth.uid() = user_id` |
| Admins view all | User has `admin = TRUE` |
| Admins update | User has `admin = TRUE` |

### `transacoes` Policies

| Policy | Condition |
|--------|-----------|
| View own | `auth.uid() = user_id` |
| Admins view all | User has `admin = TRUE` |

**Result:** Users can only see their own data; admins can see everything.

---

## Testing the Schema

### 1. Create Test Data

```sql
-- Create test user profile (replace UUID with real user)
INSERT INTO perfis_usuarios (id, email, nome_completo, creditos)
VALUES (
  'test-user-uuid-here',
  'test@example.com',
  'Test User',
  50
);

-- Create test payment
INSERT INTO pagamentos_pendentes (
  user_id,
  email_usuario,
  telefone,
  montante,
  creditos_comprados,
  referencia
) VALUES (
  'test-user-uuid-here',
  'test@example.com',
  '843456789',
  100,
  10,
  'MPESA-TEST-12345'
);
```

### 2. Test RPC Functions

```sql
-- ⚠️ Replace 'test-user-uuid' with real auth.uid()

-- Test consumir_creditos
SELECT consumir_creditos(1);
-- Should return: {"success": true, "novo_saldo": 49, "consumido": 1}

-- Test aprovar_pagamento_admin
SELECT aprovar_pagamento_admin(
  'payment-uuid-here',
  'M-Pesa confirmed'
);
```

### 3. Check Transactions Log

```sql
-- See all transactions for a user
SELECT * FROM transacoes
WHERE user_id = 'test-user-uuid-here'
ORDER BY created_at DESC;
```

---

## Troubleshooting

### "Table already exists"
- This is OK! `CREATE TABLE IF NOT EXISTS` skips existing tables
- To completely reset: `DROP TABLE pagamentos_pendentes CASCADE;`
- Then re-run the script

### "Function does not exist"
- Ensure script runs completely (scroll to end for errors)
- Refresh dashboard after execution
- Try re-running the full script

### "Permission denied"
- Check that you're logged in as project owner/admin
- Service role shouldn't be needed (regular auth role works)

### RLS policies block queries
- Make sure user exists in `perfis_usuarios` first
- Or temporarily disable RLS: `ALTER TABLE perfis_usuarios DISABLE ROW LEVEL SECURITY;`

### Trigger doesn't fire
- Verify trigger exists: `SELECT * FROM pg_trigger WHERE tgname LIKE 'trigger_%';`
- Check function exists: `SELECT * FROM pg_proc WHERE proname = 'trigger_update_perfis_timestamp';`

---

## Next Steps

1. ✅ **Execute schema** (this document)
2. ⏳ Update `perfis_usuarios` with real users (via Supabase Auth)
3. ⏳ Update `DocumentController.js` to use `consumir_creditos()` RPC
4. ⏳ Update `PaymentController.js` to insert into `pagamentos_pendentes`
5. ⏳ Update `AdminController.js` to call `aprovar_pagamento_admin()` RPC
6. ⏳ Test end-to-end payment flow

---

## Quick Reference: RPC Function Signatures

```typescript
// Deduct credits (atomic)
consumir_creditos(p_quantidade: integer) -> JSON

// Admin approve payment (atomic)
aprovar_pagamento_admin(
  p_pagamento_id: uuid,
  p_nota?: text
) -> JSON

// Admin reject payment
rejeitar_pagamento_admin(
  p_pagamento_id: uuid,
  p_motivo: text
) -> JSON

// Get user profile
obter_perfil_usuario() -> TABLE (...)

// Get admin stats
obter_estatisticas_pagamentos() -> TABLE (...)
```

---

## Database Diagram (Logical)

```
auth.users
    ↓ (id)
perfis_usuarios (user profiles)
    ↓ (user_id)
    ├── pagamentos_pendentes (payment records)
    └── transacoes (audit trail)

pagamentos_pendentes
    ↓ (referenced in transacoes)
transacoes (audit log)
```

---

## Security Checklist

- ✅ RLS enabled on all tables
- ✅ RPC functions use `SECURITY DEFINER`
- ✅ Admin status verified in functions
- ✅ Atomic operations prevent race conditions
- ✅ Triggers create audit trail
- ✅ UNIQUEs prevent duplicates (referencia, email)
- ✅ ON DELETE CASCADE for data cleanup

---

## Support

If you encounter issues:
1. Check error message in Supabase SQL Editor
2. Review [Supabase Documentation](https://supabase.com/docs)
3. Check PostgreSQL logs: Dashboard → Logs → Postgres
4. Ask in [Supabase Discord](https://discord.supabase.com)
