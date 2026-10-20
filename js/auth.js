import {getToken,discordLogin} from './config.js';
if(getToken())location.replace('dashboard.html');
const feedback=document.querySelector('#feedback');
document.querySelector('#discord-login')?.addEventListener('click',()=>discordLogin(message=>feedback.textContent=message));
