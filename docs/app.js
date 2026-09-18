'use strict';
const panel=document.querySelector('.panel'),svg=document.querySelector('#effects');
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const noteNames=['do','re','mi','fa','sol','la','si'];
const frequencies=[261.63,293.66,329.63,349.23,392,440,493.88];
const definitions=noteNames.map((name,i)=>[name,0,100,[72,58,84,65,78,54,68][i],v=>Math.round(v)+'%',1]);
let active=null,last=null,frame=0;
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
let audioContext=null,master=null,muted=false,audioBus=null;
function unlockAudio(){
 try{if(!audioContext){const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return;audioContext=new Audio();master=audioContext.createGain();master.gain.value=.65;const limiter=audioContext.createDynamicsCompressor();audioBus=limiter;master.connect(limiter);limiter.connect(audioContext.destination);}if(audioContext.state==='suspended')audioContext.resume().catch(()=>{});}catch{}
}
const timbres={
 pluck:{attack:.004,decay:1.3,partials:[[1,1],[2,.31],[3,.15],[4,.095]],damping:.45,type:'sine'},
 piano:{attack:.003,decay:2,partials:[[1,1],[2,.48],[3,.23],[4,.13],[5,.07],[7,.025]],damping:.4,type:'sine'},
 marimba:{attack:.002,decay:.7,partials:[[1,1],[4,.26],[10,.045]],damping:1.3,type:'sine'},
 bell:{attack:.003,decay:3,partials:[[1,1],[2.756,.35],[5.404,.15],[8.933,.055]],damping:.24,type:'sine'},
 synth:{attack:.04,decay:1.1,partials:[[1,1],[2,.14]],damping:.25,type:'triangle'}
};
let instrument='pluck';
function stringVolume(index,value=rows[index].value){return clamp(value/100,0,1);}
function playNote(index,strength,volume=stringVolume(index)){playTone(frequencies[index],strength,volume);}
function playTone(f,strength,volume=1,options={}){
 const context=options.context||audioContext,output=options.output||master;
 if(!context||(!options.context&&(muted||context.state!=='running'))||volume<=0)return;
 if(options.capture!==false){
  if(typeof recordScoreEvent==='function')recordScoreEvent({kind:'note',f,strength,volume,instrument});
  if(typeof recordMusicNote==='function')recordMusicNote(f,clamp(strength*volume,0,1),'note',options.scoreGroup);
 }
 const t=options.when??context.currentTime,preset=timbres[options.instrument||instrument],voices=[];
 const normalization=preset.partials.reduce((total,p)=>total+p[1],0);
 preset.partials.forEach(([ratio,weight],i)=>{
  const oscillator=context.createOscillator(),gain=context.createGain();
  oscillator.type=preset.type;oscillator.frequency.value=f*ratio;
  const level=(.035+.19*clamp(strength,0,1))*weight/normalization*volume;
  const decay=(options.decay??preset.decay)/(1+i*preset.damping);
  gain.gain.setValueAtTime(0,t);gain.gain.linearRampToValueAtTime(level,t+preset.attack);
  if(options.fadeUntil!==undefined){const envelope=Float32Array.from({length:65},(_,j)=>level*(1-j/64)**2);gain.gain.setValueCurveAtTime(envelope,t+preset.attack,Math.max(.01,options.fadeUntil-t-preset.attack));}
  else if(options.sustainUntil!==undefined){gain.gain.setValueAtTime(level,options.sustainUntil);}
  else gain.gain.exponentialRampToValueAtTime(.0001,t+preset.attack+decay);
  oscillator.connect(gain);gain.connect(output);oscillator.start(t);oscillator.stop(options.fadeUntil??options.sustainUntil??(t+preset.attack+decay+.05));voices.push(oscillator);
  oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};
 });
 return voices;
}
document.querySelector('#instrument').addEventListener('change',event=>{
 if(!Object.hasOwn(timbres,event.target.value))return;
 instrument=event.target.value;unlockAudio();
});
// Sliding sustains the row's exact pitch, with a soft attack instead of a pluck.
let slideVoice=null,slideSoundActive=false;
function stopSlide(){if(slideSoundActive&&typeof recordScoreEvent==='function')recordScoreEvent({kind:'slide-stop'});slideSoundActive=false;if(slideVoice&&audioContext){const t=audioContext.currentTime;slideVoice.gain.gain.cancelScheduledValues(t);slideVoice.gain.gain.setTargetAtTime(0,t,.015);}}
function playSlide(index,speed){
 if(muted||!audioContext||audioContext.state!=='running'||speed<2)return;
 if(!slideVoice){
  const source=audioContext.createOscillator(),gain=audioContext.createGain();
  source.type='triangle';gain.gain.value=0;
  source.connect(gain);gain.connect(master);source.start();slideVoice={source,gain};
 }
 const volume=stringVolume(index);
 if(volume===0){stopSlide();return;}
 slideSoundActive=true;if(typeof recordScoreEvent==='function')recordScoreEvent({kind:'slide',index,speed,volume});
 if(typeof recordMusicNote==='function')recordMusicNote(frequencies[index],clamp(speed/900,0,1)*volume,'slide');
 const t=audioContext.currentTime,level=(.025+.09*clamp(speed/900,0,1))*volume;
 slideVoice.source.frequency.setValueAtTime(frequencies[index],t);
 const gain=slideVoice.gain.gain;gain.cancelScheduledValues(t);gain.setTargetAtTime(level,t,.012);
 // Fade out when movement stops; position and speed never change the note.
 gain.setTargetAtTime(0,t+.065,.025);
}
function boundaryEntered(previous,next,w){return(previous>0&&next<=0)||(previous<w&&next>=w);}
function playBoundary(s,speed){
 if(muted||!audioContext||audioContext.state!=='running')return;
 const t=audioContext.currentTime;if(t-(s.lastBoundarySound??-Infinity)<.075)return;s.lastBoundarySound=t;
 const force=clamp(speed/900,0,1);
 // Same instrument envelope and harmonics, one octave above the first string.
 playTone(523.25,.3+.7*force,1.3);
}
// Half-open crossing test prevents repeated hits while a ball rests on a string.
function crossing(a,b,y,length){
 if(length<=0||a.y===b.y||!((a.y<y&&b.y>=y)||(a.y>y&&b.y<=y)))return null;
 const t=(y-a.y)/(b.y-a.y),x=a.x+(b.x-a.x)*t;
 return x>=0&&x<=length?x:null;
}
function pluckString(target,hit,speed,volume=stringVolume(target.index)){
 const strength=clamp(Math.sqrt(Math.abs(speed)/.02/50000),.05,1);
 target.vibration={age:0,strength,hit};target.row.classList.toggle('vibrating',true);
 playNote(target.index,strength,volume);wake();
}
function crossStrings(source,a,b,dt){
 const base=source.row.offsetTop+36;
 for(const target of rows){if(target===source)continue;
  const offset=source.track.offsetLeft-target.track.offsetLeft;
  const hit=crossing({x:a.x+offset,y:base+a.y},{x:b.x+offset,y:base+b.y},target.row.offsetTop+36,clamp(target.x,0,width(target)));
  if(hit===null)continue;
  if(Math.abs(hit-target.x)<14&&Math.abs(target.y)<1)continue;
  // Impact acceleration estimate = normal velocity change / 20 ms contact time.
  // Using gravity alone would make every strike equally loud.
  pluckString(target,hit,Math.abs(b.y-a.y)/Math.max(dt,.001));
 }
}
function animateString(s,dt){
 const v=s.vibration;if(!v)return false;v.age+=dt;
 if(v.age>1.1){s.vibration=null;s.row.classList.toggle('vibrating',false);s.wave.setAttribute('d','');return false;}
 const length=clamp(s.x,0,width(s)),amplitude=(3+v.strength*10)*Math.exp(-v.age*5.2);
 let d='';for(let i=0;i<=40;i++){const u=i/40,x=length*u;const shape=Math.sin(Math.PI*u)*Math.sin(v.age*65)+.25*Math.sin(2*Math.PI*u)*Math.sin(v.age*103);d+=(i?'L':'M')+x+' '+(22+amplitude*shape)+' ';}
 s.wave.setAttribute('d',d);return true;
}
const rows=definitions.map(([name,min,max,value,format,step],index)=>{
 const row=document.createElement('div');row.className='row';row.innerHTML='<div class="label"><span>'+name+'</span><span class="value"></span></div><div class="track"><div class="line"></div><div class="fill"></div><svg class="string-wave" aria-hidden="true"><path/></svg><div class="thumb" role="slider" tabindex="0"></div></div>';panel.append(row);
 const s={name,min,max,value,initial:value,format,step,index,row,track:row.querySelector('.track'),thumb:row.querySelector('.thumb'),fill:row.querySelector('.fill'),output:row.querySelector('.value'),x:0,y:0,vx:0,vy:0,mode:'idle',age:0,bounces:0,wave:row.querySelector('.string-wave path'),vibration:null};
 s.thumb.setAttribute('aria-label',name);s.thumb.setAttribute('aria-valuemin',min);s.thumb.setAttribute('aria-valuemax',max);
 s.track.addEventListener('pointerdown',e=>down(e,s));s.thumb.addEventListener('keydown',e=>{let v=s.value;if(['ArrowRight','ArrowUp'].includes(e.key))v+=step*(e.shiftKey?10:1);else if(['ArrowLeft','ArrowDown'].includes(e.key))v-=step*(e.shiftKey?10:1);else if(e.key==='Home')v=min;else if(e.key==='End')v=max;else return;e.preventDefault();stop(s);setValue(s,v);});
 return s;
});
function width(s){return s.track.clientWidth;}
function setValue(s,v){s.value=clamp(Math.round(v/s.step)*s.step,s.min,s.max);s.x=(s.value-s.min)/(s.max-s.min)*width(s);s.y=0;paint(s);}
function paint(s){s.thumb.style.left=s.x+'px';s.thumb.style.top=(22+s.y)+'px';s.fill.style.width=clamp(s.x,0,width(s))+'px';s.output.textContent=s.format(s.value);s.thumb.setAttribute('aria-valuenow',s.value.toFixed(2));s.thumb.setAttribute('aria-valuetext',String(s.format(s.value)));s.thumb.classList.toggle('active',s.mode!=='idle');s.row.classList.toggle('active',s.mode!=='idle');}
function stop(s){if(active===s)stopSlide();s.mode='idle';s.vx=s.vy=s.y=0;if(active===s)active=null;svg.replaceChildren();}
function local(e,s){const r=s.track.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top-22};}
function down(e,s){if(e.button!==0||active)return;e.preventDefault();if(typeof stopScorePlayback==='function')stopScorePlayback();unlockAudio();stop(s);const p=local(e,s);if(!e.target.closest('.thumb'))setValue(s,s.min+clamp(p.x/width(s),0,1)*(s.max-s.min));active=s;s.mode='drag';s.anchor=s.x;s.start=p;s.offset=p.x-s.x;s.pulled=false;s.pointer=e.pointerId;s.dragTime=performance.now();s.track.setPointerCapture(e.pointerId);s.thumb.focus({preventScroll:true});paint(s);}
// One shared simulation drives both the guide and playback.
function verticalBounds(s){
 const base=s.row.offsetTop+36,radius=6.5;
 return{min:-64+radius-base,max:panel.clientHeight+64-radius-base};
}
function trajectory(s,seed=null){
 const limits=verticalBounds(s),startY=clamp(s.y,limits.min,limits.max);
 const direction=seed?.direction||(startY<0?-1:1),pull=Math.abs(startY);
 const lower=Math.min(limits.min*direction,limits.max*direction),upper=Math.max(limits.min*direction,limits.max*direction);
 const w=width(s),h=1/480,reboundGravity=520,restitution=.62,sleepHeight=2.5,reboundTimeScale=.75;
 const snap=x=>{const value=clamp(Math.round((s.min+clamp(x/w,0,1)*(s.max-s.min))/s.step)*s.step,s.min,s.max);return{value,target:(value-s.min)/(s.max-s.min)*w};};
 let x=s.x,y=pull,vx=-(s.x-s.anchor)*5.8,vy=-Math.sqrt(2*1250*pull+(pull*12+75)**2),airborne=false,phase='launch',bounces=0,landing=null,gravitySign=1;
 if(seed){y=startY*direction;vx=seed.vx;vy=seed.vy*direction;airborne=y<=0;phase='launch';}
 const obstacles=rows.filter(r=>r!==s&&r.mode==='idle').map(r=>({index:r.index,x:r.x+r.track.offsetLeft-s.track.offsetLeft,y:(r.row.offsetTop-s.row.offsetTop)*direction,volume:stringVolume(r.index)}));
 const contacts=new Map();
 const points=[{x,y:y*direction,phase}];
 if(pull>8||seed){for(let i=0;i<5760;i++){
  // Slow rebound time without changing its gravity, energy loss, or bounce height.
  const dt=h*(phase==='rebound'?reboundTimeScale:1);
  let impactSpeed=0,boundarySpeed=0,ballHits=[];
  vy+=(phase==='rebound'?reboundGravity:1250)*gravitySign*dt;x+=vx*dt;y+=vy*dt;
  if(y<lower||y>upper){
   boundarySpeed=Math.abs(vy);y=clamp(y,lower,upper);vy*=-.5;
  }
  for(const obstacle of obstacles){
   let dx=x-obstacle.x,dy=y-obstacle.y,d=Math.hypot(dx,dy);if(d>=13)continue;
   if(d<.001){dx=0;dy=vy>0?-1:1;d=1;}
   const nx=dx/d,ny=dy/d,normal=vx*nx+vy*ny;
   x=obstacle.x+nx*13.02;y=obstacle.y+ny*13.02;
   if(normal>=0)continue;
   gravitySign=y>0?-1:1;airborne=true;
   const speed=Math.hypot(vx,vy);vx-=1.78*normal*nx;vy-=1.78*normal*ny;
   // A tiny sideways component prevents an exactly vertical numerical stack.
   if(Math.abs(nx)<.01&&Math.abs(vx)<1)vx=12;
   if(i-(contacts.get(obstacle.index)??-Infinity)>24){ballHits.push({index:obstacle.index,speed,volume:obstacle.volume});contacts.set(obstacle.index,i);}
  }
  if(y*gravitySign<0)airborne=true;
  if(x<0||x>w){boundarySpeed=Math.max(boundarySpeed,Math.abs(vx));x=clamp(x,0,w);vx*=-.42;}
  if(airborne&&y*gravitySign>=0&&vy*gravitySign>0){
   impactSpeed=Math.abs(vy);
   y=0;
   // Capture the first landing position: all later hops are strictly vertical.
   let speed;
   if(phase==='launch'){
    landing=snap(x);x=landing.target;vx=0;
    speed=Math.abs(vy)*.28*Math.sqrt(reboundGravity/1250);
   }else{speed=Math.abs(vy)*restitution;}
   // Restitution dissipates energy at each collision; subpixel hops go to sleep.
   if(speed*speed/(2*reboundGravity)<=sleepHeight){vy=0;phase='landed';}
   else{vy=-speed*gravitySign;phase='rebound';bounces++;}
  }
  points.push({x,y:y*direction,phase,impactSpeed,boundarySpeed,ballHits});
  if(phase==='landed')break;
 }}
 const {value,target}=landing||snap(x);
 points[points.length-1]={...points[points.length-1],x:target,y:0,phase:'landed'};
 return{points,h,duration:(points.length-1)*h,target,value,bounces,direction};
}
function draw(s){svg.replaceChildren();if(!s.pulled||s.mode!=='drag')return;const x0=s.track.offsetLeft+140,y0=s.row.offsetTop+36+170;const make=(tag,attrs)=>{const e=document.createElementNS('http://www.w3.org/2000/svg',tag);Object.entries(attrs).forEach(([k,v])=>e.setAttribute(k,v));svg.append(e);return e;};const p=trajectory(s);
 make('path',{d:`M ${x0+s.anchor-9} ${y0} L ${x0+s.x} ${y0+s.y} L ${x0+s.anchor+9} ${y0}`,fill:'none',stroke:'#7664ed','stroke-width':1.2,opacity:.8});
 let d='';for(let i=0;i<p.points.length;i++){if(i%6!==0&&i!==p.points.length-1)continue;const {x,y}=p.points[i];d+=(i?'L':'M')+(x0+x)+' '+(y0+y)+' ';}make('path',{d,fill:'none',stroke:'#81818e','stroke-width':1,'stroke-dasharray':'1 6','stroke-linecap':'round',opacity:.65});
 make('path',{d:`M ${x0+p.target} ${y0-6} v12`,stroke:'#8070ff','stroke-width':1});const text=make('text',{x:x0+p.target,y:y0-13,fill:'#8474ee','text-anchor':'middle','font-size':11,'font-family':'monospace'});text.textContent=s.format(p.value);
}
for(const s of rows){s.track.addEventListener('pointermove',e=>{if(active!==s||s.pointer!==e.pointerId)return;const previous={x:s.x,y:s.y},now=performance.now();const p=local(e,s);if(!s.pulled&&Math.abs(p.y-s.start.y)>12){s.pulled=true;s.anchor=s.x;}if(s.pulled){stopSlide();s.x=clamp(p.x-s.offset,-70,width(s)+70);const bounds=verticalBounds(s);
 s.y=clamp(p.y-s.start.y,Math.max(-150,bounds.min),Math.min(150,bounds.max));
 if((previous.y>bounds.min&&s.y<=bounds.min)||(previous.y<bounds.max&&s.y>=bounds.max))playBoundary(s,Math.abs(s.y-previous.y)/Math.max(.008,(now-s.dragTime)/1000));
 draw(s);}else{s.x=clamp(p.x-s.offset,0,width(s));s.anchor=s.x;s.value=s.min+s.x/width(s)*(s.max-s.min);
 const elapsed=Math.max(.008,(now-s.dragTime)/1000),speed=Math.abs(s.x-previous.x)/elapsed;
 if(boundaryEntered(previous.x,s.x,width(s)))playBoundary(s,speed);
 if(speed>=2){playSlide(s.index,speed);}else stopSlide();
 }crossStrings(s,previous,{x:s.x,y:s.y},Math.max(.008,(now-s.dragTime)/1000));s.dragTime=now;paint(s);});
 s.track.addEventListener('pointerup',e=>{if(active!==s||s.pointer!==e.pointerId)return;stopSlide();active=null;svg.replaceChildren();if(s.pulled&&Math.abs(s.y)>8){const p=trajectory(s);if(reduced){stop(s);setValue(s,p.value);}else{s.flight=p;s.mode='flight';s.age=0;s.crossIndex=0;wake();}}else{stop(s);setValue(s,s.min+clamp(s.x/width(s),0,1)*(s.max-s.min));}paint(s);});
 const cancel=()=>{if(active===s){stop(s);setValue(s,s.value);}};s.track.addEventListener('pointercancel',cancel);s.track.addEventListener('lostpointercapture',cancel);
}
let collisionSequence=0;
function playBallCollision(source,target,speed,targetVolume){
 const group='collision-'+(++collisionSequence),when=audioContext?.currentTime;
 playTone(frequencies[source.index],clamp(speed/1400,.08,1),1,{when,scoreGroup:group});
 playTone(frequencies[target.index],1,targetVolume,{when,scoreGroup:group});
}
const ballContacts=new Map();
function collideBalls(time){
 let collided=false;
 for(let i=0;i<rows.length;i++)for(let j=i+1;j<rows.length;j++){
  const a=rows[i],b=rows[j];if(a.mode!=='flight'||b.mode!=='flight')continue;
  let dx=b.x+b.track.offsetLeft-a.x-a.track.offsetLeft,dy=b.y+b.row.offsetTop-a.y-a.row.offsetTop,d=Math.hypot(dx,dy);
  if(d>=13)continue;if(d<.001){dx=0;dy=1;d=1;}
  const nx=dx/d,ny=dy/d,avx=a.mode==='flight'?a.vx:0,avy=a.mode==='flight'?a.vy:0,bvx=b.mode==='flight'?b.vx:0,bvy=b.mode==='flight'?b.vy:0;
  const relative=(bvx-avx)*nx+(bvy-avy)*ny;if(relative>=0)continue;
  const key=i+':'+j;if(time-(ballContacts.get(key)??-Infinity)<60)continue;ballContacts.set(key,time);
  const impulse=-(1+.78)*relative/2,overlap=(13-d)/2+.05;
  a.x-=nx*overlap;a.y-=ny*overlap;b.x+=nx*overlap;b.y+=ny*overlap;
  for(const [body,vx,vy] of [[a,avx-impulse*nx,avy-impulse*ny],[b,bvx+impulse*nx,bvy+impulse*ny]]){
   const direction=body.mode==='flight'?body.flight.direction:(vy>0?-1:1);
   body.flight=trajectory(body,{vx,vy,direction});body.mode='flight';body.age=0;body.crossIndex=0;body.vx=vx;body.vy=vy;paint(body);
  }
  playBallCollision(a,b,Math.abs(relative),stringVolume(b.index));collided=true;
 }
 return collided;
}
function tick(time){
 frame=-1;
 const elapsed=last===null?0:clamp((time-last)/1000,0,.032);last=time;let moving=false;
 const steps=Math.max(1,Math.ceil(elapsed*480)),dt=elapsed/steps;
 for(let step=0;step<steps;step++){
 for(const s of rows){
  if(s.mode!=='flight')continue;
  s.age+=dt;const p=s.flight;
  const end=Math.min(Math.floor(s.age/p.h),p.points.length-1);
  for(let j=(s.crossIndex||0)+1;j<=end;j++){
   const point=p.points[j];
   for(const hit of point.ballHits||[])playBallCollision(s,rows[hit.index],hit.speed,hit.volume);
   if(point.boundarySpeed>0)playBoundary(s,point.boundarySpeed);
   crossStrings(s,p.points[j-1],point,p.h);
   if(point.impactSpeed>0&&p.target>0)pluckString(s,p.target,point.impactSpeed,stringVolume(s.index,p.value));
  }
  s.crossIndex=end;
  if(s.age>=p.duration){s.mode='idle';s.vx=s.vy=0;setValue(s,p.value);continue;}
  moving=true;const progress=clamp(s.age/p.h,0,p.points.length-1),i=Math.min(Math.floor(progress),p.points.length-2),f=progress-i;
  const a=p.points[i],b=p.points[i+1];s.x=a.x+(b.x-a.x)*f;s.y=a.y+(b.y-a.y)*f;
  s.vx=(b.x-a.x)/p.h;s.vy=(b.y-a.y)/p.h;
  s.value=s.min+clamp(s.x/width(s),0,1)*(s.max-s.min);paint(s);
 }

  if(collideBalls(time-elapsed*1000+step*dt*1000))moving=true;
 }
 for(const s of rows)if(animateString(s,elapsed))moving=true;
 frame=moving?requestAnimationFrame(tick):0;
}

function wake(){if(!frame){last=null;frame=requestAnimationFrame(tick);}}
function reset(){stopSlide();for(const s of rows){stop(s);s.vibration=null;s.row.classList.toggle('vibrating',false);s.wave.setAttribute('d','');setValue(s,s.initial);}}
document.querySelector('#reset').addEventListener('click',reset);window.addEventListener('blur',()=>{if(active){const s=active;stop(s);setValue(s,s.value);}});new ResizeObserver(()=>{for(const s of rows){stop(s);setValue(s,s.value);}}).observe(panel);reset();
if(document.modelContext?.registerTool){try{Promise.resolve(document.modelContext.registerTool({name:'set_string_lengths',description:'Set the active white length of musical strings, from 0 to 100 percent.',inputSchema:{type:'object',properties:Object.fromEntries(noteNames.map(k=>[k,{type:'number',minimum:0,maximum:100}])),additionalProperties:false},annotations:{readOnlyHint:false},execute(input){if(!input||typeof input!=='object'||Object.keys(input).some(k=>!noteNames.includes(k)||!Number.isFinite(input[k])||input[k]<0||input[k]>100))throw Error('Invalid string lengths');noteNames.forEach((k,i)=>{if(k in input){stop(rows[i]);setValue(rows[i],input[k]);}});return Object.fromEntries(noteNames.map((k,i)=>[k,rows[i].value]));}})).catch(()=>{});}catch{}}

document.querySelector('#sound').addEventListener('click',()=>{unlockAudio();muted=!muted;if(typeof syncScoreMute==='function')syncScoreMute();if(muted)stopSlide();if(master)master.gain.setTargetAtTime(muted?0:.65,audioContext.currentTime,.02);const button=document.querySelector('#sound');button.textContent=muted?'声音关':'声音开';button.setAttribute('aria-pressed',String(!muted));});
