# MzDocs Pro v3 - Copilot Execution Blueprint

You are a senior full-stack engineer. Your task is to fully implement and fix the MzDocs Pro v3 system.

## GLOBAL RULES
- Use vanilla JavaScript (ES6+)
- Follow MVC strictly
- Use Supabase as backend
- NEVER expose API keys in frontend
- All async code must have try/catch
- All inputs must be validated
- Code must be production-ready (no placeholders)

---

## SYSTEM ARCHITECTURE

Frontend:
- HTML + CSS + Vanilla JS
- MVC pattern

Backend:
- Supabase (DB + Auth + Edge Functions)

---

## CORE FEATURES TO IMPLEMENT

### 1. AUTH SYSTEM
- Supabase auth integration
- Session persistence
- Auto profile creation

### 2. CREDIT SYSTEM
- User has credit balance
- Credits stored in `perfis_usuarios`
- Credits consumed via RPC

### 3. PAYMENT SYSTEM (CRITICAL)
- Manual M-Pesa payments
- User submits:
  - name
  - phone
  - transaction reference
  - amount
- Stored as "pending"
- Admin approves → credits added

### 4. ADMIN PANEL
- View pending payments
- Approve/reject
- Update user credits

### 5. API SECURITY
- Move OpenRouter calls to Supabase Edge Function
- Frontend calls only proxy

---

## DATABASE REQUIREMENTS

Tables:
- perfis_usuarios
- pagamentos_pendentes

Functions:
- aprovar_pagamento_admin()
- consumir_creditos()

Enable RLS.

---

## CODE QUALITY RULES

- Use classes (Controller, Model, View)
- No duplicated logic
- Use event delegation
- Handle loading states
- Handle empty states
- Defensive programming

---

## OUTPUT FORMAT

Always generate:
- Full file
- No explanations
- Clean and ready to paste