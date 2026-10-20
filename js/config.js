export const API_BASE='https://herbergeurimage.maxgamingdu4.workers.dev';
const KEY='oren_discord_token';
export const getToken=()=>sessionStorage.getItem(KEY);
export const setToken=t=>sessionStorage.setItem(KEY,t);
export const clearToken=()=>sessionStorage.removeItem(KEY);
export async function api(path,options={}){
  const headers=new Headers(options.headers||{});
  const token=getToken();if(token)headers.set('Authorization','Bearer '+token);
  let response;
  try{response=await fetch(API_BASE+path,{...options,headers,credentials:'omit'});}catch{throw Error('Impossible de joindre le Worker.');}
  let data;try{data=await response.json();}catch{throw Error('Réponse invalide (HTTP '+response.status+').');}
  if(!response.ok)throw Error(data.error||'Erreur HTTP '+response.status);
  return data;
}
export function imageUrl(url){return url?new URL(url,API_BASE).href:null;}
export function discordLogin(feedback){
  const url=API_BASE+'/api/auth/discord/start?origin='+encodeURIComponent(location.origin);
  const popup=window.open(url,'oren-discord','width=550,height=720');
  if(!popup){feedback('Autorisez les popups pour vous connecter avec Discord.');return;}
  const onMessage=event=>{
    if(event.origin!==new URL(API_BASE).origin||event.source!==popup||event.data?.type!=='oren-discord-auth')return;
    if(!/^[a-f0-9]{64}$/.test(event.data.token))return;
    window.removeEventListener('message',onMessage);
    setToken(event.data.token);
    location.href='dashboard.html';
  };
  window.addEventListener('message',onMessage);
  feedback('Autorisez la connexion dans la fenêtre Discord.');
}
