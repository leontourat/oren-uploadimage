import {api,getToken,clearToken,imageUrl} from './config.js';
const $ = s => document.querySelector(s);
const feedback = $('#feedback');
const gallery = $('#gallery');
const input = $('#file');
const drop = $('#drop');
const empty = $('#empty');
const search = $('#search');
const message = text => { feedback.textContent = text; };
const formats = new Set(['image/png','image/jpeg','image/webp','image/gif']);
const MAX_BYTES = 10 * 1024 * 1024;
let items = [];
let uploading = false;
if (!getToken()) location.replace('login.html');
function size(n){return n < 1024*1024 ? (n/1024).toFixed(1)+' Ko' : (n/(1024*1024)).toFixed(2)+' Mo';}
async function copyText(value){
  try { await navigator.clipboard.writeText(value); message('Lien copié dans le presse-papiers.'); }
  catch { window.prompt('Copiez ce lien :', value); }
}
function button(text, cls, action){
  const el=document.createElement('button'); el.type='button'; el.className='btn '+cls; el.textContent=text; el.addEventListener('click',action); return el;
}
function render(){
  const q=search.value.trim().toLocaleLowerCase('fr');
  const shown=items.filter(x=>x.filename.toLocaleLowerCase('fr').includes(q));
  gallery.replaceChildren();
  $('#count').textContent=String(items.length);
  $('#storage').textContent=size(items.reduce((n,x)=>n+(Number(x.size)||0),0));
  $('#gallery-info').textContent=items.length+' image'+(items.length>1?'s':'')+' enregistrée'+(items.length>1?'s':'');
  empty.hidden=shown.length!==0;
  for(const item of shown){
    const card=document.createElement('article'); card.className='card image-card';
    const preview=document.createElement('div'); preview.className='image-preview';
    if(item.url){const img=document.createElement('img');img.src=imageUrl(item.url);img.alt=item.filename;img.loading='lazy';preview.append(img);}
    else {const lock=document.createElement('span');lock.className='private-icon';lock.textContent='🔒';lock.title='Image privée';preview.append(lock);}
    const body=document.createElement('div');body.className='image-body';
    const name=document.createElement('div');name.className='image-name';name.title=item.filename;name.textContent=item.filename;
    const meta=document.createElement('div');meta.className='image-meta';meta.textContent=size(item.size)+' · '+(item.visibility==='public'?'Publique':'Privée');
    const tools=document.createElement('div');tools.className='tools';
    if(item.url){tools.append(button('Copier le lien','secondary',()=>copyText(imageUrl(item.url))));tools.append(button('Ouvrir','secondary',()=>window.open(imageUrl(item.url),'_blank','noopener,noreferrer')));}
    tools.append(button('Supprimer','danger',async()=>{
      if(!confirm('Supprimer définitivement « '+item.filename+' » ?'))return;
      try{await api('/api/images/'+encodeURIComponent(item.id),{method:'DELETE'});message('Image supprimée.');await refresh();}
      catch(e){message(e.message);}
    }));
    body.append(name,meta,tools);card.append(preview,body);gallery.append(card);
  }
}
async function refresh(){
  try{
    const [{user},{images}]=await Promise.all([api('/api/me'),api('/api/images')]);
    $('#username').textContent=user.username;
    if(user.avatar){$('#avatar').src=user.avatar;$('#avatar').hidden=false;}
    items=Array.isArray(images)?images:[];render();
  }catch(e){message(e.message);if(/authentification|session|401/i.test(e.message)){clearToken();location.replace('login.html');}}
}
async function upload(files){
  if(uploading)return;
  const chosen=Array.from(files||[]);
  if(!chosen.length)return;
  for(const file of chosen){if(!formats.has(file.type)||!file.size||file.size>MAX_BYTES){message('Fichier non accepté : '+file.name+' (PNG, JPG, WEBP, GIF, 10 Mo max).');return;}}
  uploading=true;input.disabled=true;
  let done=0;
  try{
    for(const file of chosen){
      message('Envoi '+(done+1)+'/'+chosen.length+' : '+file.name+'…');
      const form=new FormData();form.append('file',file);form.append('visibility',$('#visibility').value);
      await api('/api/images',{method:'POST',body:form});done++;
    }
    message(done+' image'+(done>1?'s':'')+' envoyée'+(done>1?'s':'')+' avec succès.');
  }catch(e){message(done+' image(s) envoyée(s). Erreur : '+e.message);}
  finally{uploading=false;input.disabled=false;input.value='';await refresh();}
}
input.addEventListener('change',()=>upload(input.files));
drop.addEventListener('dragover',e=>{e.preventDefault();drop.classList.add('dragging');});
drop.addEventListener('dragleave',()=>drop.classList.remove('dragging'));
drop.addEventListener('drop',e=>{e.preventDefault();drop.classList.remove('dragging');upload(e.dataTransfer.files);});
document.addEventListener('paste',e=>{
  if(['INPUT','TEXTAREA'].includes(document.activeElement?.tagName))return;
  const files=Array.from(e.clipboardData?.items||[]).filter(x=>x.kind==='file').map(x=>x.getAsFile()).filter(Boolean);
  if(files.length){e.preventDefault();upload(files);}
});
search.addEventListener('input',render);
$('#logout').addEventListener('click',async()=>{try{await api('/api/logout',{method:'POST'});}catch{}clearToken();location.assign('login.html');});
if(getToken())refresh();
