# SQL Quick Reference & Integration Examples

## RPC Function Call Examples

### From Frontend (JavaScript)

#### 1. Consume Credits (Document Generation)
```javascript
// File: assets/js/controllers/DocumentController.js
async generateWithCredits(prompt) {
  try {
    // First: Deduct credit
    const { data: creditResult, error: creditError } = 
      await supabaseConfig.getInstance().rpc('consumir_creditos', {
        p_quantidade: 1
      });

    if (creditError || !creditResult.success) {
      throw new Error(creditResult?.error || 'Insufficient credits');
    }

    console.log('Credits deducted. New balance:', creditResult.novo_saldo);

    // Second: Call OpenRouter proxy
    const response = await fetch(
      `${supabaseConfig.getInstance().url}/functions/v1/openrouter-proxy`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${(await supabaseConfig.getInstance().auth.getSession()).data.session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          serviceType: 'trabalho',
          prompt: prompt
        })
      }
    );

    const document = await response.json();
    
    // Third: Update UI with new balance
    appState.updateCredits(creditResult.novo_saldo);
    
    return document.document;
  } catch (error) {
    console.error('Generation failed:', error);
    // Handle error...
  }
}
```

#### 2. Submit Payment Request (User)
```javascript
// File: assets/js/controllers/PaymentController.js
async submitPayment(paymentData) {
  const { data, error } = await supabaseConfig
    .getInstance()
    .from('pagamentos_pendentes')
    .insert({
      user_id: appState.user.id,
      email_usuario: appState.user.email,
      nome_usuario: appState.user.nome_completo,
      telefone: paymentData.phone,
      montante: paymentData.amount,
      creditos_comprados: paymentData.credits,
      referencia: `REF-${Date.now()}-${appState.user.id.slice(0, 8)}`
    });

  if (error) throw error;
  return data;
}
```

#### 3. Approve Payment (Admin)
```javascript
// File: assets/js/controllers/AdminController.js
async approvePayment(paymentId, note = '') {
  const { data, error } = await supabaseConfig
    .getInstance()
    .rpc('aprovar_pagamento_admin', {
      p_pagamento_id: paymentId,
      p_nota: note
    });

  if (error) throw error;
  
  console.log('Payment approved:', data.mensagem);
  console.log('Credits added:', data.creditos_adicionados);
  return data;
}
```

#### 4. Get User Profile
```javascript
// File: assets/js/config/supabase.js
async getUserProfile() {
  const { data, error } = await this.getInstance()
    .rpc('obter_perfil_usuario');

  if (error) throw error;
  return data[0];  // RPC returns array
}
```

#### 5. Get Admin Statistics
```javascript
// File: assets/js/controllers/AdminController.js
async getPaymentStats() {
  const { data, error } = await supabaseConfig
    .getInstance()
    .rpc('obter_estatisticas_pagamentos');

  if (error) throw error;
  
  const stats = data[0];
  return {
    pending: stats.pendentes,
    approved: stats.aprovados,
    rejected: stats.rejeitados,
    totalAmount: stats.montante_total,
    creditsSold: stats.creditos_vendidos
  };
}
```

---

## Direct Table Operations

### Insert Payment (via REST)
```javascript
const { data, error } = await supabaseConfig
  .getInstance()
  .from('pagamentos_pendentes')
  .insert({
    user_id: userId,
    email_usuario: email,
    telefone: '843456789',
    montante: 250,
    creditos_comprados: 50,
    referencia: 'MPESA-UNIQUE-REF'
  });
```

### Fetch User Payments (via REST)
```javascript
const { data, error } = await supabaseConfig
  .getInstance()
  .from('pagamentos_pendentes')
  .select('*')
  .eq('user_id', userId)
  .order('created_at', { ascending: false });
```

### Fetch Pending Payments (ADMIN)
```javascript
const { data, error } = await supabaseConfig
  .getInstance()
  .from('pagamentos_pendentes')
  .select('*')
  .eq('status', 'pending')
  .order('created_at', { ascending: false });
```

### Check Credit Balance
```javascript
const { data, error } = await supabaseConfig
  .getInstance()
  .from('perfis_usuarios')
  .select('creditos')
  .eq('id', userId)
  .single();

const balance = data.creditos;
```

### Update User Profile
```javascript
const { data, error } = await supabaseConfig
  .getInstance()
  .from('perfis_usuarios')
  .update({
    nome_completo: 'João Silva',
    telefone: '843456789'
  })
  .eq('id', userId);
```

---

## SQL Queries (Direct)

### Check if user has enough credits for RPC
```sql
SELECT creditos FROM perfis_usuarios
WHERE id = 'user-uuid'
AND creditos >= 1;
```

### Get payment details
```sql
SELECT 
  id, user_id, telefone, montante, 
  creditos_comprados, referencia, status, 
  created_at, revisado_em
FROM pagamentos_pendentes
WHERE id = 'payment-uuid';
```

### Fetch user's transaction history
```sql
SELECT 
  tipo, creditos, descricao, 
  referencia_mpesa, created_at
FROM transacoes
WHERE user_id = 'user-uuid'
ORDER BY created_at DESC
LIMIT 100;
```

### Count pending payments
```sql
SELECT COUNT(*) as pendentes
FROM pagamentos_pendentes
WHERE status = 'pending';
```

### Get revenue statistics
```sql
SELECT
  COUNT(*) FILTER (WHERE status = 'approved') as approved_count,
  SUM(montante) FILTER (WHERE status = 'approved') as total_revenue,
  SUM(creditos_comprados) FILTER (WHERE status = 'approved') as credits_sold,
  AVG(montante) FILTER (WHERE status = 'approved') as avg_payment
FROM pagamentos_pendentes;
```

### Get admin list
```sql
SELECT id, email, nome_completo
FROM perfis_usuarios
WHERE admin = TRUE;
```

### Get user with most credits consumed
```sql
SELECT 
  email, 
  nome_completo, 
  creditos_gastos,
  documentos_gerados,
  ROUND(creditos_gastos::float / NULLIF(documentos_gerados, 0), 2) as avg_per_doc
FROM perfis_usuarios
WHERE creditos_gastos > 0
ORDER BY creditos_gastos DESC
LIMIT 10;
```

---

## Integration Checklist

### DocumentController Updates

- [ ] Import `consumir_creditos` RPC call
- [ ] Call RPC before generation
- [ ] Check response for success
- [ ] Update local balance on success
- [ ] Show error if insufficient credits
- [ ] Emit `creditsChanged` event

### PaymentController Updates

- [ ] Validate phone format (84/85 + 8 digits)
- [ ] Check reference uniqueness via localStorage
- [ ] Insert into `pagamentos_pendentes` table
- [ ] Show payment instructions
- [ ] Track reference for polling
- [ ] Emit `paymentSubmitted` event

### AdminController Updates

- [ ] Fetch pending payments via table query or RPC
- [ ] Call `aprovar_pagamento_admin()` on approval
- [ ] Call `rejeitar_pagamento_admin()` on rejection
- [ ] Fetch stats via `obter_estatisticas_pagamentos()` RPC
- [ ] Show payment history
- [ ] Export to CSV

### Auth Integration

- [ ] On login: Create `perfis_usuarios` record if not exists
- [ ] On first login: Set `creditos = 3` (free tier)
- [ ] On profile update: Update `perfis_usuarios`
- [ ] On logout: Clear local state

---

## Error Handling Patterns

### RPC Error Check
```javascript
const { data, error } = await rpc('some_function', {});

if (error) {
  console.error('RPC Error:', error);
  // Handle error
  return;
}

if (!data.success) {
  console.error('Operation failed:', data.error);
  // Handle business logic error
  return;
}

// Success
console.log('Result:', data);
```

### Table Error Check
```javascript
const { data, error } = await table.insert({...});

if (error) {
  if (error.code === '23505') {
    // Unique constraint violation
    console.error('Duplicate reference');
  } else if (error.code === '23503') {
    // Foreign key violation
    console.error('Invalid user');
  } else {
    console.error('Database error:', error);
  }
  return;
}

// Success
console.log('Inserted:', data);
```

---

## Performance Tips

### Indexes Already Created For:
- ✅ `admin = TRUE` lookup (admins)
- ✅ `user_id` (user's payments/transactions)
- ✅ `status` (filter pending/approved/rejected)
- ✅ `referencia` (unique constraint + index)
- ✅ `created_at DESC` (recent items first)

### Query Optimization:
```javascript
// GOOD: Fetch only needed columns
.select('id, telefone, montante, status, created_at')

// BAD: Fetch all columns
.select('*')

// GOOD: Use filters
.eq('status', 'pending')

// BAD: Fetch all and filter in JavaScript
.select('*').then(data => data.filter(...))

// GOOD: Use RPC for complex operations
.rpc('obter_estatisticas_pagamentos')

// BAD: Fetch all payments and calculate in JavaScript
```

---

## Testing SQL in Supabase Console

### Test consumir_creditos
```sql
-- Set JWT context to specific user
SELECT consumir_creditos(1);
-- Expected: {"success": true, "novo_saldo": X, ...}
```

### Test aprovar_pagamento_admin
```sql
-- Admin must be logged in
SELECT aprovar_pagamento_admin('payment-id-here', 'Test approval');
-- Expected: {"success": true, "mensagem": "..."}
```

### Test RLS policy
```sql
-- If RLS blocks you, you'll see:
-- new row violates row-level security policy
-- This is expected — set proper auth context
```

---

## Database Views (Optional Future Addition)

```sql
-- Useful view for admin dashboard
CREATE VIEW payment_summary AS
SELECT
  p.id,
  u.email,
  u.nome_completo,
  p.telefone,
  p.montante,
  p.creditos_comprados,
  p.status,
  p.created_at,
  p.revisado_em,
  admin.email as admin_email
FROM pagamentos_pendentes p
JOIN perfis_usuarios u ON p.user_id = u.id
LEFT JOIN perfis_usuarios admin ON p.admin_revisado_por = admin.id;

-- Query it like a table:
SELECT * FROM payment_summary WHERE status = 'pending';
```

---

## Monitoring Queries

### Active RPC calls (if Postgres extension available)
```sql
SELECT pid, usename, query, state
FROM pg_stat_activity
WHERE query LIKE '%consumir_creditos%'
OR query LIKE '%aprovar%'
ORDER BY query_start DESC;
```

### Recent errors in functions
```sql
SELECT * FROM pg_stat_statements
WHERE query LIKE '%consumir_creditos%'
OR query LIKE '%aprovar%'
ORDER BY calls DESC;
```

---

## Backup & Recovery

### Backup user data
```sql
-- Export all payments
COPY (
  SELECT * FROM pagamentos_pendentes
  WHERE created_at > NOW() - INTERVAL '7 days'
)
TO STDOUT CSV HEADER;
```

### Restore from backup
```sql
\COPY pagamentos_pendentes FROM 'backup.csv' CSV HEADER;
```

---

## Final Integration Flow

```
Frontend Form Input
    ↓
JavaScript Validation
    ↓
RPC Function Call / Table Insert
    ↓
Supabase (with RLS checks)
    ↓
Database (triggers fire, audit trail created)
    ↓
Response back to Frontend
    ↓
Update UI / Emit Events
```
