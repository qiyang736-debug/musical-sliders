'use strict';
const musicCanvas=document.querySelector('#performance-curve');
const musicContext=musicCanvas.getContext('2d');
const particleCanvas=document.querySelector('#particle-overlay'),particleContext=particleCanvas.getContext('2d');
const scoreFrequencies=[261.63,293.66,329.63,349.23,392,440,493.88,523.25];
const scoreColors=['#c5b2ee','#b1bcec','#9ccdda','#9cd2bc','#c7d49e','#dfc39f','#ddaebd','#e5d6f1'];
const lightScoreColors=['#7953b1','#5166a8','#347d91','#327e66','#737d32','#9b7137','#a25170','#856191'];
function scoreColor(pitch){return document.documentElement.dataset.theme==='light'?lightScoreColors[pitch]:scoreColors[pitch];}
const scoreEvents=[];
let scoreEpoch=null,scoreFrame=0,scoreOffset=null,displayScore=null,scorePlayhead=null,hoverFlower=null;
const slideTimes=new Map();
let hoverFlowers=new Set(),particles=[],particleStart=0,clearingFlowers=[],clearVoices=[],clearOutput=null,clearClock=null,echoHold=false,clearSpent=false;
const clearButton=document.querySelector('#clear-curve');
const scoreSpeed=document.querySelector('#score-speed');
const downloadScoreButton=document.querySelector('#download-score');
const downloadMusicButton=document.querySelector('#download-music');
const playScoreButton=document.querySelector('#play-score');
function scoreActionsLocked(){return !!(clearSpent||clearClock);}
function hasScoreGraphics(){return !!(scoreEvents.length||(displayScore&&displayScore.length));}
function syncClearButton(){
 if(!clearButton)return;
 const locked=scoreActionsLocked(),has=hasScoreGraphics();
 clearButton.disabled=locked||!has;
 clearButton.title=clearButton.disabled?(locked?'终章已落下':'先留下乐谱，再落下终章'):'落下终章';
}
function syncScoreActions(){
 const locked=scoreActionsLocked(),has=hasScoreGraphics();
 document.querySelector('.curve-heading')?.classList.toggle('is-idle',!has&&!locked);
 if(scoreSpeed)scoreSpeed.disabled=locked;
 if(downloadScoreButton)downloadScoreButton.disabled=locked||!has;
 if(downloadMusicButton&&downloadMusicButton.textContent!=='生成中…')downloadMusicButton.disabled=locked||!has;
 if(playScoreButton){
  const hasNotes=typeof liveScore!=='undefined'&&liveScore.some(e=>e.kind!=='slide-stop');
  playScoreButton.disabled=locked||!hasNotes;
 }
 syncClearButton();
}
let clearHoverStamp=0;
const CLEAR_FADE=.45,CLEAR_END_PAD=1.95,LINGER_ARM=.6;
function rosePoints(k){
 const end=k%2?Math.PI:Math.PI*2,count=128*k,points=[];
 for(let i=0;i<=count;i++){const a=end*i/count,r=Math.sin(k*a);points.push({x:r*Math.cos(a),y:r*Math.sin(a)});}
 const xs=points.map(p=>p.x),ys=points.map(p=>p.y),xmin=Math.min(...xs),xmax=Math.max(...xs),ymin=Math.min(...ys),ymax=Math.max(...ys),scale=2/Math.max(xmax-xmin,ymax-ymin);
 return points.map(p=>({x:(p.x-(xmin+xmax)/2)*scale,y:(p.y-(ymin+ymax)/2)*scale}));
}
const roses=Array.from({length:8},(_,i)=>rosePoints(i+1));
function recordMusicNote(f,strength,kind='note',group=null){
 if(echoHold||clearClock)return;
 const now=performance.now()/1000,pitch=scoreFrequencies.reduce((best,v,i)=>Math.abs(v-f)<Math.abs(scoreFrequencies[best]-f)?i:best,0);
 if(kind==='slide'&&now-(slideTimes.get(pitch)??-Infinity)<.2)return;
 if(kind==='slide')slideTimes.set(pitch,now);
 if(scoreEpoch===null)scoreEpoch=now;
 const last=scoreEvents.at(-1),time=now-scoreEpoch;
 const position=group&&last?.group===group?last.position:last?last.position+Math.max(20,Math.min(38,(time-last.time)*70)):0;
 if(!clearAnimating()){
  displayScore=null;scorePlayhead=null;scoreOffset=null;
  if(clearSpent)clearSpent=false;
  forgetEcho();
 }
 const sound=typeof liveScore!=='undefined'?{...liveScore.at(-1)}:null;
 scoreEvents.push({time,absolute:now,pitch,strength:Math.max(0,Math.min(1,strength)),position,sound,group,volumeY:group?strength:null});
 if(!clearAnimating())syncScoreActions();
 if(!scoreFrame)scoreFrame=requestAnimationFrame(drawMusicScore);
}
function noteShape(ctx,pitch,x,y,r){
 ctx.beginPath();roses[pitch].forEach((p,i)=>{const px=x+p.x*r,py=y+p.y*r;i?ctx.lineTo(px,py):ctx.moveTo(px,py);});ctx.closePath();ctx.stroke();
}
function clearAge(){return audioContext&&clearClock?Math.max(0,audioContext.currentTime-clearClock.start):(performance.now()-particleStart)/1000;}
const PARTICLE_FAST=1.18,PARTICLE_SLOW=1.08,PARTICLE_SLOW_AT=5.5/12;
const PARTICLE_CURVE_A=(PARTICLE_SLOW-PARTICLE_FAST)/(PARTICLE_SLOW_AT*(PARTICLE_SLOW_AT-1));
function particleTravel(from,to,duration){
 if(to<=from)return 0;
 if(!(duration>0))return to-from;
 const T=duration,A=PARTICLE_CURVE_A,C=PARTICLE_FAST;
 const area=t=>A*t*t*t/(3*T*T)-A*t*t/(2*T)+C*t;
 return area(to)-area(from);
}
function clearDeadline(){const d=clearClock?.duration||0;return Math.max(d*.5,d-CLEAR_END_PAD);}
function lingerActive(e){return (e.hoverLinger||0)>0;}
function clearFadeWindow(e){
 const deadline=clearDeadline(),start=e.clearDelay||0;
 return Math.min(CLEAR_FADE+(e.hoverLinger||0),Math.max(.26,deadline-start));
}
function flowerGone(e,age){
 if(e.clearDelay==null)return false;
 if(age>=clearDeadline())return true;
 if(!lingerActive(e))return age>=e.clearDelay;
 return age>=e.clearDelay+clearFadeWindow(e);
}
function spawnClearParticles(e,start,h){
 if(e.clearSpawned||!clearClock)return;
 const y=flowerY(e,h),alpha=e.clearAlpha??(.22+.75*e.strength);
 const points=roses[e.pitch].filter(p=>Math.hypot(p.x,p.y)>.2),count=30;
 const remain=Math.max(.32,clearClock.duration-start);
 for(let i=0;i<count;i++){const p=points[Math.floor((i+Math.random())*points.length/count)],speed=12+Math.random()**1.4*90;
  particles.push({pitch:e.pitch,position:e.position,ox:p.x*23+(Math.random()-.5)*5,y:y+p.y*23+(Math.random()-.5)*5,vx:(Math.random()-.5)*34,vy:-speed,delay:start,life:remain*(.2+Math.random()**.85*.8),size:.6+Math.random()*.55,alpha:alpha*(.55+Math.random()*.4),color:scoreColor(e.pitch)});
 }
 e.clearSpawned=true;
}
function streamLingerFade(e,age,h){
 if(!clearClock||!lingerActive(e)||e.clearDelay==null||age<e.clearDelay||flowerGone(e,age))return;
 if(age-(e.lastSpark||0)<.055)return;
 e.lastSpark=age;
 const fade=1-Math.min(1,(age-e.clearDelay)/Math.max(.08,clearFadeWindow(e)));
 const y=flowerY(e,h),alpha=(e.clearAlpha??(.22+.75*e.strength))*fade,points=roses[e.pitch].filter(p=>Math.hypot(p.x,p.y)>.2);
 const p=points[Math.floor(Math.random()*points.length)]||{x:0,y:0};
 particles.push({pitch:e.pitch,position:e.position,ox:p.x*23+(Math.random()-.5)*4,y:y+p.y*23+(Math.random()-.5)*4,vx:(Math.random()-.5)*16,vy:-(10+Math.random()*32),delay:age,life:.28+Math.random()*.4,size:.4+Math.random()*.35,alpha:alpha*(.3+Math.random()*.4),color:scoreColor(e.pitch)});
}
function flowerLight(e,age,lit){
 const rest=e.clearAlpha??(.22+.75*e.strength);
 let light=lit?1:rest;
 if(lit&&(e.hoverDwell||0)>=LINGER_ARM){
  const dim=1-Math.pow(1-Math.min(1,(e.hoverDwell-LINGER_ARM)/1.5),1.15);
  light=1-(1-rest*.9)*dim;
 }
 if(e.clearDelay!=null&&age>=e.clearDelay){
  const t=Math.min(1,(age-e.clearDelay)/Math.max(.08,clearFadeWindow(e)));
  light*=(1-t)*(1-t);
 }
 return light;
}
function updateClearHoverLinger(age,h){
 const now=performance.now(),dt=clearHoverStamp?Math.min(.05,(now-clearHoverStamp)/1000):0;clearHoverStamp=now;
 if(!clearClock)return;
 if(age>=clearDeadline()){for(const e of displayScore||[])if(e.clearDelay!=null&&!e.clearSpawned)spawnClearParticles(e,age,h);return;}
 for(const e of displayScore||[]){
  if(e.clearDelay==null||flowerGone(e,age))continue;
  if(scanPointer&&hoverFlowers.has(e)&&dt){
   e.hoverDwell=(e.hoverDwell||0)+dt;
   if(e.hoverDwell>=LINGER_ARM)e.hoverLinger=(e.hoverLinger||0)+dt;
  }else e.hoverDwell=0;
  if(age>=e.clearDelay)streamLingerFade(e,age,h);
 }
}
function drawMusicScore(){
 scoreFrame=0;
 const w=musicCanvas.clientWidth||580,h=musicCanvas.clientHeight||170,dpr=Math.min(window.devicePixelRatio||1,2),ctx=musicContext;
 musicCanvas.width=Math.round(w*dpr);musicCanvas.height=Math.round(h*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
 ctx.globalAlpha=1;ctx.strokeStyle=document.documentElement.dataset.theme==='light'?'#bbb7c5':'#514a5e';ctx.lineWidth=.7;
 ctx.beginPath();ctx.moveTo(0,.35);ctx.lineTo(w,.35);ctx.stroke();
 ctx.beginPath();ctx.moveTo(0,h-12);ctx.lineTo(w,h-12);ctx.stroke();
 const events=displayScore||scoreEvents,origin=events[0]?.position||0;
 const left=27,right=w-27,maxOffset=Math.max(0,(events.at(-1)?.position||0)-origin-(right-left)),offset=scoreOffset===null?maxOffset:Math.max(0,Math.min(maxOffset,scoreOffset));
 ctx.save();ctx.beginPath();ctx.rect(0,13,w,h-26);ctx.clip();
 const age=clearAge();updateClearHoverLinger(age,h);
 for(const event of events){
  if(event.clearDelay!=null&&age>=event.clearDelay&&!event.clearSpawned)spawnClearParticles(event,age,h);
  if(event.clearDelay!=null&&flowerGone(event,age))continue;
  const x=left+event.position-origin-offset;if(x<-25||x>w+25)continue;
  const y=flowerY(event,h);
  const reached=scorePlayhead===null||event.time<=scorePlayhead,lit=hoverFlowers.has(event)||(scorePlayhead!==null&&scorePlayhead>=event.time&&scorePlayhead-event.time<.35);
  const light=event.clearDelay!=null?flowerLight(event,age,lit):lit?1:reached?(.22+.75*event.strength):.1;
  const glow=lit&&light>.18;
  ctx.globalAlpha=light;ctx.strokeStyle=scoreColor(event.pitch);ctx.lineWidth=glow?1.2+light*.8:1.05;ctx.shadowColor=scoreColor(event.pitch);ctx.shadowBlur=glow?10*light:0;
  noteShape(ctx,event.pitch,x,y,glow?23+2*light:23);ctx.shadowBlur=0;
 }
 ctx.restore();ctx.globalAlpha=1;
 const pending=events.some(e=>e.clearDelay!=null&&!flowerGone(e,age));
 particleCanvas.width=Math.round(w*dpr);particleCanvas.height=Math.round((h+800)*dpr);particleCanvas.style.height=(h+800)+'px';
 const particleCtx=particleContext;particleCtx.setTransform(dpr,0,0,dpr,0,800*dpr);particleCtx.clearRect(0,-800,w,h+800);
 particles=particles.filter(p=>age+1e-8<p.delay+p.life);
 for(const p of particles){const localAge=age-p.delay;if(localAge<0)continue;const progress=Math.min(1,localAge/p.life),fade=(1-progress)**2;
  const travel=particleTravel(p.delay,age,clearClock?.duration||0);
  const x=left+p.position-origin-offset+p.ox+p.vx*travel,y=p.y+p.vy*travel;
  particleCtx.globalAlpha=p.alpha*fade;particleCtx.fillStyle=scoreColor(p.pitch);
  particleCtx.beginPath();particleCtx.arc(x,y,p.size,0,Math.PI*2);particleCtx.fill();
 }
 if(echoCapture&&age>.08&&!pending&&!particles.length)endEchoCapture();
 if(!pending&&!particles.length&&displayScore?.some(e=>e.clearDelay!=null)){
  displayScore=null;clearClock=null;clearHoverStamp=0;scoreEvents.length=0;scoreEpoch=null;hoverFlowers.clear();hoverFlower=null;syncScoreActions();
 }
 ctx.globalAlpha=1;if((particles.length||pending||echoCapture)&&!scoreFrame)scoreFrame=requestAnimationFrame(drawMusicScore);
}
function clearAnimating(){
 if(!clearClock)return false;
 if(particles.length)return true;
 const age=clearAge();
 return !!(displayScore&&displayScore.some(e=>e.clearDelay!=null&&!flowerGone(e,age)));
}
new ResizeObserver(()=>{document.querySelector('.panel').style.setProperty('--score-width',musicCanvas.clientWidth+'px');if(!scoreFrame)scoreFrame=requestAnimationFrame(drawMusicScore);}).observe(musicCanvas);
let SCORE_SCAN_SPEED=260;
const CLEAR_ENTRY=.32,CLEAR_HOLD_START=1.1,CLEAR_HOLD_END=2.8,CLEAR_MIN=2,CLEAR_MAX=10;
function clearDuration(count){return Math.min(CLEAR_MAX,Math.max(CLEAR_MIN,CLEAR_MIN+(count-1)*.12));}
function clearTone(e){
 const sound=e.sound;
 if(sound?.kind==='note')return {f:sound.f,strength:sound.strength,volume:sound.volume,instrument:sound.instrument};
 return {f:scoreFrequencies[e.pitch],strength:e.strength,volume:sound?.volume??1,instrument:sound?.instrument||instrument};
}
function clearNoteLength(e){const p=timbres[clearTone(e).instrument||instrument]||timbres.pluck;return p.attack+p.decay;}
function verticalClearSequence(events,h){
 const ordered=[...events].sort((a,b)=>flowerY(a,h)-flowerY(b,h)||a.position-b.position);
 if(!ordered.length)return [];
 const rows=[];
 for(const event of ordered){
  const y=flowerY(event,h),last=rows.at(-1);
  if(last&&y-last.y<1.5)last.events.push(event);
  else rows.push({y,events:[event]});
 }
 const sequence=[];let delay=0;
 rows.forEach((row,i)=>{
  const mix=rows.length<2?1:i/(rows.length-1),hold=CLEAR_HOLD_START+(CLEAR_HOLD_END-CLEAR_HOLD_START)*mix;
  const natural=Math.max(...row.events.map(clearNoteLength)),volume=1-.5*i/Math.max(1,rows.length-1);
  for(const event of row.events)sequence.push({event,delay,volume,length:clearNoteLength(event)*hold});
  delay+=natural*CLEAR_ENTRY;
 });
 return sequence;
}
function echoDuration(sequence){return sequence.reduce((max,{delay,length})=>Math.max(max,delay+length+.15),0);}
function scheduleEcho(sequence,output,t,options={}){
 const duration=echoDuration(sequence);
 output.gain.setValueAtTime(.25,t);
 if(duration>.05)output.gain.setValueCurveAtTime(Float32Array.from({length:33},(_,j)=>{const p=j/32,rise=.38+.62*Math.sin(Math.min(1,p/.42)*Math.PI/2),fall=p<.46?1:Math.pow(1-(p-.46)/.54,1.15);return .65*rise*fall;}),t,duration);
 const voices=[];
 for(const {event:e,delay,volume,length} of sequence){
  const tone=clearTone(e);
  voices.push(...(playTone(tone.f,tone.strength,tone.volume*volume,{context:options.context,output,when:t+delay,fadeUntil:t+delay+length,instrument:tone.instrument,capture:false})||[]));
 }
 return {duration,voices};
}
async function renderEcho(sequence){
 if(!sequence?.length)return null;
 const duration=Math.max(.2,echoDuration(sequence));
 const Offline=window.OfflineAudioContext||window.webkitOfflineAudioContext;
 if(!Offline)throw Error('当前浏览器无法导出回响');
 const context=new Offline(1,Math.max(1,Math.ceil(duration*44100)),44100);
 const output=context.createGain(),limiter=context.createDynamicsCompressor();output.connect(limiter);limiter.connect(context.destination);
 scheduleEcho(sequence,output,0,{context});
 return context.startRendering();
}
function scoreSnapshot(){
 const shown=displayScore?.length?displayScore:null;
 if(shown&&shown.length>=scoreEvents.length)return shown.slice();
 return scoreEvents.slice();
}
let lastEcho=null,lastEchoBuffer=null,lastEchoBlob=null,echoCapture=null,echoCaptureTimer=0,echoCaptureDest=null;
const echoButton=document.querySelector('#echo-score');
function forgetEcho(){endEchoCapture();lastEcho=null;lastEchoBuffer=null;lastEchoBlob=null;if(echoButton){echoButton.disabled=true;echoButton.textContent='回响';echoButton.title='先落下终章，再保存回响';}}
function armEchoButton(){
 if(!lastEcho)return;
 echoButton.disabled=false;echoButton.textContent='回响';
 echoButton.title=lastEchoBlob||lastEchoBuffer?'下载从有到无的回响':'下载从有到无的回响';
}
function endEchoCapture(){
 if(echoCaptureTimer){clearTimeout(echoCaptureTimer);echoCaptureTimer=0;}
 if(echoCapture&&echoCapture.state==='recording'){try{echoCapture.stop();}catch{} }
}
function beginEchoCapture(duration){
 if(echoCapture||typeof MediaRecorder==='undefined'||!audioContext||!audioBus||muted)return;
 try{
  echoCaptureDest=audioContext.createMediaStreamDestination();audioBus.connect(echoCaptureDest);
  const mime=['audio/webm;codecs=opus','audio/mp4','audio/webm','audio/ogg;codecs=opus'].find(type=>MediaRecorder.isTypeSupported(type));
  const rec=new MediaRecorder(echoCaptureDest.stream,mime?{mimeType:mime}:{}),chunks=[];
  rec.ondataavailable=event=>{if(event.data?.size)chunks.push(event.data);};
  rec.onstop=()=>{
   try{echoCaptureDest?.disconnect();}catch{}echoCaptureDest=null;
   if(echoCapture!==rec)return;echoCapture=null;
   if(lastEcho&&chunks.length)lastEchoBlob=new Blob(chunks,{type:rec.mimeType||chunks[0].type||'audio/webm'});
   armEchoButton();
  };
  echoCapture=rec;rec.start(100);
  echoCaptureTimer=setTimeout(endEchoCapture,Math.max(800,(duration+.45)*1000));
 }catch(error){console.warn('Echo capture:',error.message);echoCapture=null;}
}
function keepEcho(sequence){
 if(lastEcho||!sequence?.length)return;
 lastEcho=sequence.map(({event,delay,volume,length})=>({event:{...event,sound:event.sound?{...event.sound}:null},delay,volume,length}));
 lastEchoBlob=null;lastEchoBuffer=null;
 armEchoButton();
 renderEcho(lastEcho).then(buffer=>{if(!lastEcho)return;lastEchoBuffer=buffer;armEchoButton();}).catch(error=>console.warn('Echo buffer:',error.message));
}
forgetEcho();
syncScoreActions();
clearButton.addEventListener('click',()=>{
 if(clearButton.disabled||clearSpent||lastEcho||clearClock)return;
 const events=scoreSnapshot(),h=musicCanvas.clientHeight||170;
 if(!events.length)return;
 const sequence=verticalClearSequence(events,h);
 keepEcho(sequence);
 clearSpent=true;syncScoreActions();
 echoHold=true;
 for(const voice of clearVoices){try{voice.stop();}catch{}}clearVoices=[];clearOutput?.disconnect();
 particles=[];clearingFlowers=[];particleStart=performance.now();clearHoverStamp=0;
 try{
  unlockAudio();if(audioContext?.resume)audioContext.resume().catch(()=>{});
  const t=audioContext?audioContext.currentTime:0,output=audioContext&&!muted?audioContext.createGain():null;clearOutput=output;
  const duration=echoDuration(sequence);
  clearClock={start:audioContext?t:performance.now()/1000,duration};
  beginEchoCapture(duration);
  if(output){output.connect(master);clearVoices=scheduleEcho(sequence,output,t).voices;setTimeout(()=>output.disconnect(),(duration+.2)*1000);}
  sequence.forEach(({event:e,delay})=>{
   const tone=clearTone(e),preset=timbres[tone.instrument||instrument]||timbres.pluck;
   e.clearDelay=delay;e.clearAttack=preset.attack;e.clearAlpha=.22+.75*e.strength;e.hoverLinger=0;e.hoverDwell=0;e.clearSpawned=false;e.lastSpark=0;
  });
 }catch(error){console.warn('Clear echo:',error);}
 echoHold=false;
 scoreEvents.length=0;scoreEpoch=null;slideTimes.clear();displayScore=events;scorePlayhead=null;hoverFlowers.clear();hoverFlower=null;syncScoreActions();drawMusicScore();
});
drawMusicScore();

function followScorePlayhead(){
 const events=displayScore||scoreEvents,w=musicCanvas.clientWidth||580,origin=events[0]?.position||0;
 const event=events.findLast(e=>e.time<=scorePlayhead)||events[0];if(!event)return;
 const x=event.position-origin;
 if(x<(scoreOffset||0))scoreOffset=Math.max(0,x-25);
 if(x>(scoreOffset||0)+w-90)scoreOffset=Math.max(0,x-(w-90));
}
function panScore(delta){
 const events=displayScore||scoreEvents,w=musicCanvas.clientWidth||580,max=Math.max(0,(events.at(-1)?.position||0)-(events[0]?.position||0)-(w-54));
 scoreOffset=Math.max(0,Math.min(max,(scoreOffset??max)+delta));drawMusicScore();
}
function flowerY(e,h){if(e.volumeY!=null)return h/2+30-e.volumeY*60;return h/2+(3.5-e.pitch)*4.5+Math.sin(e.position*.043+e.pitch*.7)*14;}
function scoreLayout(){const events=displayScore||scoreEvents,width=musicCanvas.clientWidth||580,origin=events[0]?.position||0,max=Math.max(0,(events.at(-1)?.position||0)-origin-(width-54));return{events,width,origin,max,offset:Math.max(0,Math.min(max,scoreOffset??max))};}
let scanPointer=null,scanPrevious=null,edgeFrame=0,edgeTime=0;
const previewTimes=new WeakMap();
async function previewFlower(e){
 if(!e||clearAnimating()||(typeof scorePlayback!=='undefined'&&scorePlayback&&!scorePlayback.paused))return;
 const now=performance.now();if(now-(previewTimes.get(e)??-Infinity)<250)return;previewTimes.set(e,now);
 unlockAudio();if(!audioContext)return;await audioContext.resume();if(clearClock)return;const sound=e.sound;
 if(sound?.kind==='note')playTone(sound.f,sound.strength,sound.volume,{instrument:sound.instrument,capture:false});
 else playTone(scoreFrequencies[e.pitch],e.strength,sound?.volume??1,{instrument:'pluck',capture:false});
}
function scanScore(sweep=true){
 if(!scanPointer)return;const layout=scoreLayout(),x=scanPointer.x+layout.offset-27+layout.origin;
 const previous=sweep&&scanPrevious!==null?scanPrevious:x;
 const next=new Set();
 for(const e of layout.events){const extent=roses[e.pitch].reduce((m,p)=>Math.max(m,Math.abs(p.x)*23),0);
  if(Math.abs(e.position-x)<=extent&&(e.clearDelay==null||!flowerGone(e,clearAge())))next.add(e);
  if(!clearAnimating()&&e.position+extent>=Math.min(previous,x)&&e.position-extent<=Math.max(previous,x)&&!hoverFlowers.has(e))previewFlower(e).catch(()=>{});
 }
 scanPrevious=x;hoverFlowers=next;drawMusicScore();
}
function scorePanRate(){return SCORE_SCAN_SPEED*(clearClock?1.75:1);}
function edgeScroll(time){
 edgeFrame=0;if(!scanPointer)return;const dt=Math.min(.04,(time-(edgeTime||time))/1000);edgeTime=time;
 const {width,max,offset}=scoreLayout(),zone=Math.min(65,width*.18),x=scanPointer.x,scan=scorePanRate();
 const speed=x<zone?-scan*(1-x/zone):x>width-zone?scan*(1-(width-x)/zone):0;
 if(speed&&((speed<0&&offset>0)||(speed>0&&offset<max))){panScore(speed*dt);scanScore();}
 edgeFrame=requestAnimationFrame(edgeScroll);
}
musicCanvas.addEventListener('pointermove',e=>{const box=musicCanvas.getBoundingClientRect();scanPointer={x:Math.max(0,Math.min(box.width,e.clientX-box.left))};scanScore();if(!edgeFrame){edgeTime=0;edgeFrame=requestAnimationFrame(edgeScroll);}});
musicCanvas.addEventListener('pointerdown',e=>{unlockAudio();scanPrevious=null;hoverFlowers.clear();const box=musicCanvas.getBoundingClientRect();scanPointer={x:e.clientX-box.left};scanScore(false);});
function leaveScore(){scanPointer=null;scanPrevious=null;hoverFlowers.clear();cancelAnimationFrame(edgeFrame);edgeFrame=0;drawMusicScore();}
musicCanvas.addEventListener('pointerleave',leaveScore);musicCanvas.addEventListener('pointercancel',leaveScore);
musicCanvas.addEventListener('wheel',e=>{e.preventDefault();const delta=Math.abs(e.deltaX)>Math.abs(e.deltaY)?e.deltaX:e.deltaY;panScore(delta*(clearClock?1.6:1));scanScore();},{passive:false});
musicCanvas.tabIndex=0;musicCanvas.addEventListener('keydown',e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();panScore(e.key==='ArrowLeft'?-80:80);}});
document.querySelector('#download-score').addEventListener('click',()=>{
 if(scoreActionsLocked())return;
 const events=displayScore||scoreEvents;if(!events.length)return;const origin=events[0].position,w=Math.max(54,events.at(-1).position-origin+54),h=140;
 const canvas=document.createElement('canvas'),scale=Math.min(2,16384/w);canvas.width=Math.ceil(w*scale);canvas.height=Math.ceil(h*scale);const ctx=canvas.getContext('2d');ctx.scale(scale,scale);ctx.lineWidth=1.05;
 for(const e of events){ctx.strokeStyle=scoreColor(e.pitch);ctx.globalAlpha=.22+.75*e.strength;noteShape(ctx,e.pitch,27+e.position-origin,flowerY(e,h),23);}
 canvas.toBlob(blob=>{if(blob)downloadBlob(blob,'rose-score.png');},'image/png');
});
