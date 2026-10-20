// Oren Image Upload — Cloudflare Worker, OAuth2 Discord + D1 + R2
// Bindings: DB (D1), IMAGES (R2). Secrets: DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, OAUTH_STATE_SECRET.
const MAX_BYTES = 10 * 1024 * 1024;
const TYPES = {'image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/gif':'gif'};
const enc = new TextEncoder();
const hex = bytes => Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
const random = (n=32) => hex(crypto.getRandomValues(new Uint8Array(n)));
const digest = async value => hex(new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(value))));
const json = (value,status=200) => new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const fail = (message,status=400) => json({error:message},status);
const originAllowed = origin => {try {const u=new URL(origin);return u.origin===origin && (u.protocol==='https:' || (u.protocol==='http:' && ['localhost','127.0.0.1'].includes(u.hostname)));}catch{return false;}};
const allowed = (origin,env) => originAllowed(origin) && (!env.SITE_ORIGINS || env.SITE_ORIGINS.split(',').map(s=>s.trim()).includes(origin));
function cors(req,env){
  const origin=req.headers.get('Origin');
  const h=new Headers({'Vary':'Origin','Access-Control-Allow-Methods':'GET,POST,DELETE,OPTIONS','Access-Control-Allow-Headers':'Authorization,Content-Type','Access-Control-Max-Age':'600'});
  if(origin && allowed(origin,env))h.set('Access-Control-Allow-Origin',origin);
  return h;
}
function base64url(bytes){return btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
function unbase64url(s){const p=s.replace(/-/g,'+').replace(/_/g,'/');return Uint8Array.from(atob(p+'='.repeat((4-p.length%4)%4)),c=>c.charCodeAt(0));}
async function hmac(secret,message){const key=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return base64url(new Uint8Array(await crypto.subtle.sign('HMAC',key,enc.encode(message))));}
function safeEqual(a,b){if(a.length!==b.length)return false;let x=0;for(let i=0;i<a.length;i++)x|=a.charCodeAt(i)^b.charCodeAt(i);return x===0;}
async function stateToken(env,origin){const payload=base64url(enc.encode(JSON.stringify({origin,nonce:random(16),exp:Date.now()+600000})));return payload+'.'+await hmac(env.OAUTH_STATE_SECRET,payload);}
async function verifyState(env,state){const [payload,signature,extra]=(state||'').split('.');if(!payload||!signature||extra)return null;const expected=await hmac(env.OAUTH_STATE_SECRET,payload);if(!safeEqual(signature,expected))return null;try{const data=JSON.parse(new TextDecoder().decode(unbase64url(payload)));return data.exp>Date.now()&&allowed(data.origin,env)?data:null;}catch{return null;}}
async function userFor(req,env){
  const match=/^Bearer ([a-f0-9]{64})$/i.exec(req.headers.get('Authorization')||'');if(!match)return null;
  return env.DB.prepare('SELECT u.discord_id,u.username,u.avatar,u.role FROM discord_sessions s JOIN discord_users u ON u.discord_id=s.discord_id WHERE s.token_hash=? AND s.expires_at>?').bind(await digest(match[1]),Date.now()).first();
}
function userJson(u){return {id:u.discord_id,username:u.username,avatar:u.avatar,role:u.role};}
function imageJson(i){return {id:i.id,filename:i.filename,mime_type:i.mime_type,size:i.size,visibility:i.visibility,created_at:i.created_at,url:i.visibility==='public'?'/api/images/'+i.id+'/file':null};}
async function sniff(file){const a=new Uint8Array(await file.slice(0,16).arrayBuffer());if(a.length>=8&&[137,80,78,71,13,10,26,10].every((x,i)=>a[i]===x))return'image/png';if(a[0]===255&&a[1]===216&&a[2]===255)return'image/jpeg';if(a.length>=6&&/^GIF8[79]a$/.test(String.fromCharCode(...a.slice(0,6))))return'image/gif';if(a.length>=12&&String.fromCharCode(...a.slice(0,4))==='RIFF'&&String.fromCharCode(...a.slice(8,12))==='WEBP')return'image/webp';return null;}
function callbackPage(origin,token){
  // Origin and token are serialized, never concatenated into executable JS source.
  const data=JSON.stringify({origin,token}).replace(/</g,'\\u003c');
  return new Response(`<!doctype html><html lang="fr"><meta charset="utf-8"><title>Oren — Connexion Discord</title><body style="background:#0b0912;color:white;font:16px system-ui;text-align:center;padding:70px 12px"><h2>Connexion Discord terminée</h2><p>Retour à Oren Image Upload…</p><script>const data=${data};if(window.opener){window.opener.postMessage({type:'oren-discord-auth',token:data.token},data.origin);window.close();}else{document.querySelector('p').textContent='Retournez sur le site et relancez la connexion depuis son bouton Discord.';}</script></body></html>`,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'"}});
}
async function route(req,env,url){
  const path=url.pathname.replace(/\/$/,'')||'/';
  if(path==='/api/health'&&req.method==='GET')return json({ok:true,service:'Oren Image Upload',auth:'discord'});
  if(path==='/api/auth/discord/start'&&req.method==='GET'){
    if(!env.DISCORD_CLIENT_ID||!env.DISCORD_CLIENT_SECRET||!env.OAUTH_STATE_SECRET)return fail('Secrets Discord non configurés.',503);
    const origin=url.searchParams.get('origin')||'';
    if(!allowed(origin,env))return fail('Origine du site non autorisée.',403);
    const state=await stateToken(env,origin);
    const redirect=new URL('/api/auth/discord/callback',url.origin).href;
    const authUrl=new URL('https://discord.com/oauth2/authorize');
    authUrl.search=new URLSearchParams({client_id:env.DISCORD_CLIENT_ID,redirect_uri:redirect,response_type:'code',scope:'identify',state}).toString();
    const h=new Headers({'Location':authUrl.href,'Cache-Control':'no-store'});
    // The browser keeps this same-site cookie through the Discord OAuth redirect.
    h.append('Set-Cookie',`oren_oauth_nonce=${state.split('.')[0].slice(0,30)}; Path=/api/auth/discord; Max-Age=600; HttpOnly; Secure; SameSite=Lax`);
    return new Response(null,{status:302,headers:h});
  }
  if(path==='/api/auth/discord/callback'&&req.method==='GET'){
    const state=url.searchParams.get('state');const parsed=await verifyState(env,state);
    if(!parsed)return fail('État OAuth invalide ou expiré.',400);
    const cookie=req.headers.get('Cookie')||'';
    if(!cookie.split(';').some(v=>v.trim()===`oren_oauth_nonce=${state.split('.')[0].slice(0,30)}`))return fail('Session OAuth introuvable. Autorisez les cookies.',403);
    if(url.searchParams.has('error'))return fail('Autorisation Discord refusée.',403);
    const code=url.searchParams.get('code');if(!code)return fail('Code Discord manquant.',400);
    const redirect=new URL('/api/auth/discord/callback',url.origin).href;
    const body=new URLSearchParams({client_id:env.DISCORD_CLIENT_ID,client_secret:env.DISCORD_CLIENT_SECRET,grant_type:'authorization_code',code,redirect_uri:redirect});
    const tokenRes=await fetch('https://discord.com/api/oauth2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body});
    if(!tokenRes.ok)return fail('Discord a refusé le code OAuth. Vérifiez le Client ID, le secret et le Redirect URI.',502);
    const tokenData=await tokenRes.json();
    const profileRes=await fetch('https://discord.com/api/users/@me',{headers:{Authorization:`Bearer ${tokenData.access_token}`}});
    if(!profileRes.ok)return fail('Impossible de récupérer le profil Discord.',502);
    const profile=await profileRes.json();
    if(!/^\d{15,25}$/.test(profile.id))return fail('Profil Discord invalide.',502);
    const avatar=profile.avatar?`https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png`:null;
    await env.DB.prepare(`INSERT INTO discord_users(discord_id,username,avatar,role) VALUES(?,?,?,'user') ON CONFLICT(discord_id) DO UPDATE SET username=excluded.username,avatar=excluded.avatar`).bind(profile.id,String(profile.global_name||profile.username||'Utilisateur').slice(0,80),avatar).run();
    const token=random(32);
    await env.DB.prepare('INSERT INTO discord_sessions(token_hash,discord_id,expires_at) VALUES(?,?,?)').bind(await digest(token),profile.id,Date.now()+14*86400000).run();
    return callbackPage(parsed.origin,token);
  }
  const publicFile=/^\/api\/images\/([a-f0-9-]{36})\/file$/.exec(path);
  if(publicFile&&req.method==='GET'){
    const row=await env.DB.prepare('SELECT * FROM discord_images WHERE id=?').bind(publicFile[1]).first();if(!row)return fail('Image introuvable.',404);
    if(row.visibility!=='public'){const viewer=await userFor(req,env);if(!viewer||(viewer.discord_id!==row.discord_id&&viewer.role!=='admin'))return fail('Accès refusé.',403);}
    const object=await env.IMAGES.get(row.storage_key);if(!object)return fail('Fichier introuvable.',404);
    return new Response(object.body,{headers:{'Content-Type':row.mime_type,'Content-Disposition':'inline','X-Content-Type-Options':'nosniff','Cache-Control':row.visibility==='public'?'public, max-age=3600':'private, no-store'}});
  }
  const user=await userFor(req,env);if(!user)return fail('Authentification requise.',401);
  if(path==='/api/me'&&req.method==='GET')return json({user:userJson(user)});
  if(path==='/api/logout'&&req.method==='POST'){
    await env.DB.prepare('DELETE FROM discord_sessions WHERE token_hash=?').bind(await digest(req.headers.get('Authorization').slice(7))).run();return json({ok:true});
  }
  if(path==='/api/images'&&req.method==='GET'){
    const rows=await env.DB.prepare('SELECT * FROM discord_images WHERE discord_id=? ORDER BY created_at DESC LIMIT 100').bind(user.discord_id).all();return json({images:rows.results.map(imageJson)});
  }
  if(path==='/api/images'&&req.method==='POST'){
    const form=await req.formData();const file=form.get('file');
    if(!(file instanceof File)||!file.size||file.size>MAX_BYTES)return fail('Image absente ou supérieure à 10 Mo.',400);
    const mime=await sniff(file);if(!mime||mime!==file.type||!TYPES[mime])return fail('Format non autorisé.',400);
    const id=crypto.randomUUID();const key=`discord/${user.discord_id}/${id}.${TYPES[mime]}`;
    const visibility=form.get('visibility')==='private'?'private':'public';
    await env.IMAGES.put(key,file.stream(),{httpMetadata:{contentType:mime}});
    try{await env.DB.prepare('INSERT INTO discord_images(id,discord_id,filename,storage_key,mime_type,size,visibility) VALUES(?,?,?,?,?,?,?)').bind(id,user.discord_id,(file.name||'image').slice(0,180),key,mime,file.size,visibility).run();}
    catch(error){await env.IMAGES.delete(key);throw error;}
    return json({image:{id,url:visibility==='public'?`/api/images/${id}/file`:null}},201);
  }
  const remove=/^\/api\/images\/([a-f0-9-]{36})$/.exec(path);
  if(remove&&req.method==='DELETE'){
    const image=await env.DB.prepare('SELECT * FROM discord_images WHERE id=?').bind(remove[1]).first();if(!image)return fail('Image introuvable.',404);
    if(image.discord_id!==user.discord_id&&user.role!=='admin')return fail('Accès refusé.',403);
    await env.IMAGES.delete(image.storage_key);await env.DB.prepare('DELETE FROM discord_images WHERE id=?').bind(image.id).run();return json({ok:true});
  }
  if(path==='/api/admin/users'&&req.method==='GET'){
    if(user.role!=='admin')return fail('Accès refusé.',403);
    const rows=await env.DB.prepare('SELECT discord_id AS id,username,avatar,role,created_at FROM discord_users ORDER BY created_at DESC LIMIT 100').all();return json({users:rows.results});
  }
  if(path==='/api/admin/images'&&req.method==='GET'){
    if(user.role!=='admin')return fail('Accès refusé.',403);
    const rows=await env.DB.prepare('SELECT * FROM discord_images ORDER BY created_at DESC LIMIT 100').all();return json({images:rows.results.map(imageJson)});
  }
  return fail('Route introuvable.',404);
}
export default {async fetch(req,env){
  const headers=cors(req,env);const origin=req.headers.get('Origin');
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(origin&&!allowed(origin,env))return fail('Origine non autorisée.',403);
  if(!env.DB||!env.IMAGES)return fail('Bindings DB et IMAGES manquants.',503);
  let response;
  try{if(Number(req.headers.get('Content-Length')||0)>MAX_BYTES+200000)response=fail('Fichier trop volumineux.',413);else response=await route(req,env,new URL(req.url));}
  catch(error){console.error('Oren API:',error);response=fail('Erreur interne. Vérifiez les logs Worker et les tables D1.',500);}
  const h=new Headers(response.headers);headers.forEach((v,k)=>h.set(k,v));return new Response(response.body,{status:response.status,headers:h});
}};
