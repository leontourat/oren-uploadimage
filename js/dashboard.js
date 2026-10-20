import {api,getToken,clearToken,imageUrl} from './config.js';
if(!getToken())location.replace('login.html');
const feedback=document.querySelector('#feedback');
const gallery=document.querySelector('#gallery');
const input=document.querySelector('#file');
const drop=document.querySelector('#drop');
const message=text=>feedback.textContent=text;
async function refresh(){
  try{
    const [{user},{images}]=await Promise.all([api('/api/me'),api('/api/images')]);
    document.querySelector('#username').textContent=user.username;
    gallery.replaceChildren();
    for(const item of images){
      const card=document.createElement('article');card.className='card';
      if(item.url){const img=document.createElement('img');img.src=imageUrl(item.url);img.alt=item.filename;img.loading='lazy';card.append(img);}
      const name=document.createElement('p');name.className='small';name.textContent=item.filename;
      const tools=document.createElement('div');tools.className='tools';
      if(item.url){const copy=document.createElement('button');copy.className='btn secondary';copy.textContent='Copier le lien';copy.onclick=async()=>{try{await navigator.clipboard.writeText(imageUrl(item.url));message('Lien copié !');}catch{message(imageUrl(item.url));}};tools.append(copy);}
      const remove=document.createElement('button');remove.className='btn secondary';remove.textContent='Supprimer';remove.onclick=async()=>{if(!confirm('Supprimer cette image ?'))return;try{await api('/api/images/'+item.id,{method:'DELETE'});await refresh();}catch(e){message(e.message);}};
      tools.append(remove);card.append(name,tools);gallery.append(card);
    }
  }catch(e){message(e.message);if(e.message.includes('Authentification')){clearToken();location.replace('login.html');}}
}
async function upload(files){
  for(const file of files){message('Envoi de '+file.name+'…');try{const form=new FormData();form.append('file',file);await api('/api/images',{method:'POST',body:form});message('Image envoyée !');}catch(e){message(e.message);break;}}
  await refresh();
}
input?.addEventListener('change',()=>{upload([...input.files]);input.value='';});
drop?.addEventListener('dragover',e=>e.preventDefault());
drop?.addEventListener('drop',e=>{e.preventDefault();upload([...e.dataTransfer.files]);});
document.addEventListener('paste',e=>{const files=[...e.clipboardData.items].filter(i=>i.kind==='file').map(i=>i.getAsFile()).filter(Boolean);if(files.length)upload(files);});
document.querySelector('#logout')?.addEventListener('click',async()=>{try{await api('/api/logout',{method:'POST'});}catch{}clearToken();location.assign('login.html');});
if(getToken())refresh();
