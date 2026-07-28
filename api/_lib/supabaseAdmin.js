// api/_lib/supabaseAdmin.js — v1.0
// ──────────────────────────────────────────────────────────────────────────
// Cliente Supabase "leve" baseado em fetch puro (REST API + Auth/GoTrue API).
//
// PORQUÊ ESTE FICHEIRO EXISTE:
// Em várias funções serverless (Vercel, Node 20) o SDK @supabase/supabase-js
// instancia internamente um RealtimeClient que exige `require('ws')` e a
// opção `realtime: { transport: ws }`. Isto causava o erro
// "Node.js 20 detected without native WebSocket" e, em pelo menos um caso
// (api/deduct-credit.js), provocou consumo de créditos sem geração de
// documento (erro 500 após a dedução).
//
// Este módulo substitui o SDK por chamadas REST directas, eliminando por
// completo a dependência do SDK e do pacote 'ws' nas funções de API. Todas
// as funções em api/*.js devem importar este módulo em vez de chamar
// `createClient` directamente.
// ──────────────────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;

function assertConfigured() {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    const err = new Error('Supabase não está configurado no servidor (faltam SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).');
    err.code = 'SUPABASE_NOT_CONFIGURED';
    throw err;
  }
}

/**
 * Valida um JWT de utilizador chamando o endpoint /auth/v1/user do GoTrue.
 * Devolve { user, error }. `user` é null se o token for inválido/expirado.
 */
async function getUserFromToken(token) {
  assertConfigured();
  if (!token) return { user: null, error: new Error('Token ausente') };

  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${token}`,
      },
    });

    if (!res.ok) {
      return { user: null, error: new Error(`Token inválido (HTTP ${res.status})`) };
    }
    const user = await res.json();
    if (!user || !user.id) {
      return { user: null, error: new Error('Utilizador não encontrado') };
    }
    return { user, error: null };
  } catch (err) {
    return { user: null, error: err };
  }
}

/**
 * Chamada genérica à REST API (PostgREST) usando a service_role key.
 * `path` deve incluir a query string, ex: "profiles?id=eq.<uuid>&select=*"
 */
async function restRequest(path, { method = 'GET', body, headers = {}, prefer } = {}) {
  assertConfigured();

  const finalHeaders = {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json',
    ...headers,
  };
  if (prefer) finalHeaders['Prefer'] = prefer;

  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: finalHeaders,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch { data = text; }
  }

  if (!res.ok) {
    const message = (data && typeof data === 'object' && data.message) || `Supabase REST HTTP ${res.status}`;
    const err = new Error(message);
    err.status  = res.status;
    err.code    = data && data.code;
    err.hint    = data && data.hint;
    err.details = data && data.details;
    throw err;
  }

  return data;
}

/** Seleciona uma única linha por igualdade simples numa coluna. */
async function selectOne(table, column, value, select = '*') {
  const rows = await restRequest(
    `${table}?${column}=eq.${encodeURIComponent(value)}&select=${encodeURIComponent(select)}&limit=1`
  );
  return Array.isArray(rows) ? (rows[0] || null) : null;
}

/**
 * Actualiza linhas que correspondam a `${matchColumn}=eq.${matchValue}`.
 * `extraFilter`, se fornecido, deve começar por "&" (ex: "&credits=eq.5"),
 * útil para optimistic locking. Devolve as linhas alteradas
 * (Prefer: return=representation).
 */
async function update(table, matchColumn, matchValue, patch, extraFilter = '') {
  return restRequest(
    `${table}?${matchColumn}=eq.${encodeURIComponent(matchValue)}${extraFilter}`,
    { method: 'PATCH', body: patch, prefer: 'return=representation' }
  );
}

/** Insere uma linha e devolve a linha criada. */
async function insert(table, row) {
  const result = await restRequest(table, { method: 'POST', body: row, prefer: 'return=representation' });
  return Array.isArray(result) ? result[0] : result;
}

/** Chama uma função RPC do Postgres exposta via PostgREST. */
async function rpc(fnName, args = {}) {
  return restRequest(`rpc/${fnName}`, { method: 'POST', body: args });
}

/**
 * Apaga linhas que correspondam a `${matchColumn}=eq.${matchValue}`.
 * `extraFilter`, se fornecido, deve começar por "&" (ex: "&status=eq.pending").
 * Devolve as linhas apagadas (Prefer: return=representation).
 */
async function del(table, matchColumn, matchValue, extraFilter = '') {
  return restRequest(
    `${table}?${matchColumn}=eq.${encodeURIComponent(matchValue)}${extraFilter}`,
    { method: 'DELETE', prefer: 'return=representation' }
  );
}

/**
 * Insere ou actualiza (upsert) uma linha via PostgREST (on_conflict).
 * Devolve a linha resultante.
 */
async function upsert(table, row, onConflict = 'id') {
  const result = await restRequest(
    `${table}?on_conflict=${encodeURIComponent(onConflict)}`,
    { method: 'POST', body: row, prefer: 'resolution=merge-duplicates,return=representation' }
  );
  return Array.isArray(result) ? result[0] : result;
}

/**
 * Conta linhas que correspondam ao filtro (equivalente a
 * `.select('*', { count: 'exact', head: true })` do SDK). `filters` deve
 * começar por "?" e incluir toda a query string (ex: "?status=eq.pending").
 */
async function countRows(table, filters = '') {
  assertConfigured();
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}${filters}`, {
    method: 'HEAD',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      Prefer: 'count=exact',
    },
  });
  if (!res.ok) {
    const err = new Error(`Supabase REST HTTP ${res.status} (count em ${table})`);
    err.status = res.status;
    throw err;
  }
  const range = res.headers.get('content-range'); // ex: "*/123"
  if (!range) return 0;
  const total = range.split('/')[1];
  return total === '*' || total === undefined ? 0 : (parseInt(total, 10) || 0);
}

/** Obtém um utilizador via Auth Admin API pelo seu id. */
async function adminGetUserById(userId) {
  assertConfigured();
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  const text = await res.text();
  let data = null;
  if (text) { try { data = JSON.parse(text); } catch { data = text; } }
  if (!res.ok) {
    const err = new Error((data && (data.msg || data.message)) || `Erro ao obter utilizador (HTTP ${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

/** Actualiza campos de um utilizador (ex: app_metadata) via Auth Admin API. */
async function adminUpdateUserById(userId, patch) {
  assertConfigured();
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
    method: 'PUT',
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  const text = await res.text();
  let data = null;
  if (text) { try { data = JSON.parse(text); } catch { data = text; } }
  if (!res.ok) {
    const err = new Error((data && (data.msg || data.message)) || `Erro ao actualizar utilizador (HTTP ${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

/** Envia um ficheiro (Buffer) para o Supabase Storage. upsert=true substitui se já existir. */
async function storageUpload(bucket, path, buffer, contentType, upsert = true) {
  assertConfigured();
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': contentType || 'application/octet-stream',
      'x-upsert': upsert ? 'true' : 'false',
    },
    body: buffer,
  });
  const text = await res.text();
  let data = null;
  if (text) { try { data = JSON.parse(text); } catch { data = text; } }
  if (!res.ok) {
    const err = new Error((data && (data.message || data.error)) || `Erro ao enviar ficheiro (HTTP ${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

/** Devolve o URL público de um ficheiro num bucket público. */
function storageGetPublicUrl(bucket, path) {
  return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;
}

/** Remove permanentemente um utilizador via Auth Admin API (contas avulso). */
async function adminDeleteUser(userId) {
  assertConfigured();
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
    method: 'DELETE',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
    },
  });
  return res.ok;
}

/**
 * NOVO (v1.1): Cria um utilizador directamente via Auth Admin API (REST
 * pura, sem SDK/WebSocket — mesmo padrão de todo este ficheiro).
 * Usado para criar contas "avulso" automaticamente assim que um
 * comprovativo é aprovado pela IA, sem qualquer acção do administrador.
 *
 * @param {object} params
 * @param {string} params.email
 * @param {string} params.password
 * @param {object} [params.userMetadata]
 * @param {boolean} [params.emailConfirm=true]
 * @returns {Promise<object>} utilizador criado ({ id, email, ... })
 */
async function adminCreateUser({ email, password, userMetadata = {}, emailConfirm = true }) {
  assertConfigured();
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email,
      password,
      email_confirm: emailConfirm,
      user_metadata: userMetadata,
    }),
  });

  const text = await res.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch { data = text; }
  }

  if (!res.ok) {
    const message = (data && typeof data === 'object' && (data.msg || data.message)) || `Erro ao criar utilizador (HTTP ${res.status})`;
    const err = new Error(message);
    err.status = res.status;
    throw err;
  }
  return data;
}

module.exports = {
  SUPABASE_URL,
  SERVICE_KEY,
  assertConfigured,
  getUserFromToken,
  restRequest,
  selectOne,
  update,
  insert,
  rpc,
  del,
  upsert,
  countRows,
  adminDeleteUser,
  adminCreateUser,
  adminGetUserById,
  adminUpdateUserById,
  storageUpload,
  storageGetPublicUrl,
};

/**
 * Chama o endpoint de autenticação GoTrue usando a ANON key (não a service_role).
 * Usada por api/auth/index.js para signIn e signUp (onde o utilizador ainda não tem JWT).
 */
async function anonAuthRequest(path, body) {
  const ANON_KEY = process.env.SUPABASE_ANON_KEY;
  if (!SUPABASE_URL || !ANON_KEY) throw new Error('Supabase não configurado (falta URL ou ANON_KEY)');
  const res = await fetch(`${SUPABASE_URL}/auth/v1/${path}`, {
    method: 'POST',
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${ANON_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { data, ok: res.ok, status: res.status };
}

/**
 * Envia email de reset de password via GoTrue Admin API (service_role).
 */
async function adminSendRecovery(email, redirectTo) {
  assertConfigured();
  const res = await fetch(`${SUPABASE_URL}/auth/v1/recover`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, redirect_to: redirectTo }),
  });
  return res.ok;
}

module.exports = Object.assign(module.exports, {
  anonAuthRequest,
  adminSendRecovery,
});
