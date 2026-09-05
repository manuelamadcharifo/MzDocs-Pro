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

// CORRIGIDO: SUPABASE_URL e SERVICE_KEY eram `const` avaliadas UMA ÚNICA VEZ,
// no momento em que este módulo é importado pela primeira vez (`require`).
// Isto tornava o módulo "cego" a qualquer alteração posterior de
// process.env.SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY — por exemplo, em
// testes automatizados que definem essas variáveis dentro de um `test(...)`
// específico (depois de o módulo já ter sido importado no topo do
// ficheiro), a alteração simplesmente não tinha efeito, e todas as chamadas
// continuavam a falhar com "Supabase não está configurado", mesmo com as
// variáveis correctamente definidas. Ler o valor a cada chamada (em vez de
// o guardar em cache no arranque) resolve isto e é, em geral, mais robusto.
function _supaUrl() { return process.env.SUPABASE_URL; }
function _supaKey() { return process.env.SUPABASE_SERVICE_ROLE_KEY; }

function assertConfigured() {
  if (!_supaUrl() || !_supaKey()) {
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
    const res = await fetch(`${_supaUrl()}/auth/v1/user`, {
      headers: {
        apikey: _supaKey(),
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
    apikey: _supaKey(),
    Authorization: `Bearer ${_supaKey()}`,
    'Content-Type': 'application/json',
    ...headers,
  };
  if (prefer) finalHeaders['Prefer'] = prefer;

  const res = await fetch(`${_supaUrl()}/rest/v1/${path}`, {
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
  const res = await fetch(`${_supaUrl()}/rest/v1/${table}${filters}`, {
    method: 'HEAD',
    headers: {
      apikey: _supaKey(),
      Authorization: `Bearer ${_supaKey()}`,
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
  const res = await fetch(`${_supaUrl()}/auth/v1/admin/users/${userId}`, {
    headers: { apikey: _supaKey(), Authorization: `Bearer ${_supaKey()}` },
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
  const res = await fetch(`${_supaUrl()}/auth/v1/admin/users/${userId}`, {
    method: 'PUT',
    headers: { apikey: _supaKey(), Authorization: `Bearer ${_supaKey()}`, 'Content-Type': 'application/json' },
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
  const res = await fetch(`${_supaUrl()}/storage/v1/object/${bucket}/${path}`, {
    method: 'POST',
    headers: {
      apikey: _supaKey(),
      Authorization: `Bearer ${_supaKey()}`,
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
  return `${_supaUrl()}/storage/v1/object/public/${bucket}/${path}`;
}

/**
 * NOVO (segurança): gera um URL assinado e temporário para um ficheiro num
 * bucket PRIVADO. Usar sempre para dados sensíveis (comprovativos de
 * pagamento, documentos com dados pessoais, etc.) em vez de
 * storageGetPublicUrl — o link expira sozinho e só é gerado no servidor
 * (com a service_role key), nunca fica guardado de forma permanente.
 *
 * @param {string} bucket
 * @param {string} path
 * @param {number} expiresInSeconds — validade do link (default: 5 minutos)
 * @returns {Promise<string|null>} URL assinado absoluto, ou null se falhar
 */
async function storageCreateSignedUrl(bucket, path, expiresInSeconds = 300) {
  assertConfigured();
  if (!path) return null;
  try {
    const res = await fetch(`${_supaUrl()}/storage/v1/object/sign/${bucket}/${path}`, {
      method: 'POST',
      headers: {
        apikey: _supaKey(),
        Authorization: `Bearer ${_supaKey()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ expiresIn: expiresInSeconds }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || !data.signedURL) return null;
    return `${_supaUrl()}/storage/v1${data.signedURL}`;
  } catch (err) {
    console.error('[storageCreateSignedUrl] erro:', err.message);
    return null;
  }
}

/**
 * Gera vários URLs assinados em paralelo. Recebe um array de {bucket, path}
 * e devolve um array na mesma ordem, com null nas posições que falharem.
 */
async function storageCreateSignedUrls(items, expiresInSeconds = 300) {
  return Promise.all(
    items.map(({ bucket, path }) =>
      path ? storageCreateSignedUrl(bucket, path, expiresInSeconds) : Promise.resolve(null)
    )
  );
}

/** Remove permanentemente um utilizador via Auth Admin API (contas avulso). */
async function adminDeleteUser(userId) {
  assertConfigured();
  const res = await fetch(`${_supaUrl()}/auth/v1/admin/users/${userId}`, {
    method: 'DELETE',
    headers: {
      apikey: _supaKey(),
      Authorization: `Bearer ${_supaKey()}`,
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
  const res = await fetch(`${_supaUrl()}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: _supaKey(),
      Authorization: `Bearer ${_supaKey()}`,
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
  // NOTA: SUPABASE_URL/SERVICE_KEY deixaram de ser exportados como
  // valores estáticos (eram capturados uma única vez no arranque do
  // módulo — ver comentário "CORRIGIDO" acima). Nada no projecto os
  // importava directamente (confirmado por pesquisa em todo o código),
  // por isso são removidos em vez de exportados desactualizados; quem
  // precisar do URL/chave deve usar assertConfigured() + as funções
  // deste módulo, nunca ler estes valores directamente.
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
  storageCreateSignedUrl,
  storageCreateSignedUrls,
};

/**
 * Chama o endpoint de autenticação GoTrue usando a ANON key (não a service_role).
 * Usada por api/auth/index.js para signIn e signUp (onde o utilizador ainda não tem JWT).
 */
async function anonAuthRequest(path, body) {
  const ANON_KEY = process.env.SUPABASE_ANON_KEY;
  if (!_supaUrl() || !ANON_KEY) throw new Error('Supabase não configurado (falta URL ou ANON_KEY)');
  const res = await fetch(`${_supaUrl()}/auth/v1/${path}`, {
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
 *
 * CORRIGIDO (auditoria Set/2026 — "link de recuperação nunca chega"):
 * Antes esta função devolvia só `res.ok` (true/false) e o chamador
 * (api/auth/index.js) nem sequer verificava esse valor — ou seja, se o
 * GoTrue recusasse o pedido (rate limit do provedor de email por omissão
 * do Supabase, SMTP não configurado, `redirect_to` fora da allow-list,
 * etc.), a falha desaparecia em silêncio: nenhum log, nenhum registo em
 * metrics_events, nada. O utilizador via sempre "sucesso" (por segurança,
 * para não revelar se a conta existe) e o e-mail simplesmente nunca saía,
 * sem qualquer pista no Vercel para diagnosticar porquê.
 *
 * Agora devolve sempre {ok, status, body}, incluindo o corpo da resposta
 * de erro do GoTrue (útil para distinguir, por exemplo, "email rate limit
 * exceeded" — SMTP por omissão do Supabase, não pensado para produção —
 * de um `redirect_to` inválido ou de outro erro). O `redirect_to` passa a
 * ir tanto no corpo como na query string, porque diferentes versões da
 * API GoTrue leem-no de sítios diferentes para este endpoint.
 */
async function adminSendRecovery(email, redirectTo) {
  assertConfigured();
  const url = `${_supaUrl()}/auth/v1/recover?redirect_to=${encodeURIComponent(redirectTo || '')}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: _supaKey(),
      Authorization: `Bearer ${_supaKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, redirect_to: redirectTo }),
  });

  const text = await res.text().catch(() => '');
  let body = null;
  if (text) { try { body = JSON.parse(text); } catch { body = text; } }

  return { ok: res.ok, status: res.status, body };
}

/**
 * NOVO (Set/2026): gera um link de recuperação de password SEM enviar
 * e-mail nenhum — usa o endpoint admin `/admin/generate_link` do GoTrue
 * (exige service_role, nunca pode ser chamado a partir do browser). O
 * corpo da resposta traz `action_link`, o URL completo já com o token,
 * pronto a reencaminhar por outro canal.
 *
 * Criado para o fluxo de recuperação por WhatsApp (api/whatsapp-webhook.js):
 * ao contrário de adminSendRecovery() (que depende do envio de e-mail do
 * Supabase — por omissão limitado/pouco fiável em produção), esta função
 * dá-nos o link em bruto para o mandarmos nós próprios, via WhatsApp, sem
 * depender de nenhum SMTP.
 */
async function adminGenerateRecoveryLink(email, redirectTo) {
  assertConfigured();
  const res = await fetch(`${_supaUrl()}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: {
      apikey: _supaKey(),
      Authorization: `Bearer ${_supaKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ type: 'recovery', email, options: { redirect_to: redirectTo } }),
  });

  const text = await res.text().catch(() => '');
  let body = null;
  if (text) { try { body = JSON.parse(text); } catch { body = text; } }

  return { ok: res.ok, status: res.status, body };
}

module.exports = Object.assign(module.exports, {
  anonAuthRequest,
  adminSendRecovery,
  adminGenerateRecoveryLink,
});
