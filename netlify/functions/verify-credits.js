// netlify/functions/verify-credits.js
const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
  const headers = { 'Access-Control-Allow-Origin':'*', 'Content-Type':'application/json' };
  if (event.httpMethod === 'OPTIONS') return { statusCode:200, headers, body:'' };

  let body;
  try { body = JSON.parse(event.body||'{}'); } catch { return {statusCode:400,headers,body:JSON.stringify({error:'Body inválido'})}; }
  const { userId } = body;
  if (!userId) return {statusCode:400,headers,body:JSON.stringify({error:'userId obrigatório'})};

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    return {statusCode:200,headers,body:JSON.stringify({userId,credits:3,freeCredits:3,paidCredits:0,source:'no-db'})};
  }

  try {
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
    const { data, error } = await sb.from('users').select('credits').eq('id', userId).single();
    if (error?.code === 'PGRST116') {
      await sb.from('users').insert({ id: userId, credits: 3, created_at: new Date().toISOString() });
      return {statusCode:200,headers,body:JSON.stringify({userId,credits:3,source:'new'})};
    }
    return {statusCode:200,headers,body:JSON.stringify({userId,credits:data?.credits||0,source:'db'})};
  } catch(e) {
    return {statusCode:200,headers,body:JSON.stringify({userId,credits:3,source:'error-fallback'})};
  }
};
