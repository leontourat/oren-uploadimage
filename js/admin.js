import {api,getToken} from './config.js';
const status=document.querySelector('#status');
if(!getToken())location.replace('login.html');
try{
  const {user}=await api('/api/me');
  if(user.role!=='admin')status.textContent='Accès réservé aux administrateurs.';
  else{
    const [users,images]=await Promise.all([api('/api/admin/users'),api('/api/admin/images')]);
    status.textContent='Connecté en tant que '+user.username;
    document.querySelector('#stats').textContent=`${users.users.length} comptes et ${images.images.length} images (100 derniers éléments maximum).`;
  }
}catch(e){status.textContent=e.message;}
