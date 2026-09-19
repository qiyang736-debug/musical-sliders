'use strict';
const themeButton=document.querySelector('#theme');
function updateThemeButton(){const light=document.documentElement.dataset.theme==='light';const label=light?'深色模式':'白底模式';themeButton.setAttribute('aria-pressed',String(light));themeButton.setAttribute('aria-label',label);themeButton.title=label;}
updateThemeButton();
themeButton.addEventListener('click',()=>{const theme=document.documentElement.dataset.theme==='light'?'dark':'light';document.documentElement.dataset.theme=theme;try{localStorage.setItem('musicslider-theme',theme);}catch{}updateThemeButton();drawMusicScore();});
