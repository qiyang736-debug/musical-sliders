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
let hoverFlowers=new Set(),particles=[],particleStart=0,clearingFlowers=[],clearVoices=[],clearOutput=null,clearClock=null;
function rosePoints(k){
 const end=k%2?Math.PI:Math.PI*2,count=128*k,points=[];
 for(let i=0;i<=count;i++){const a=end*i/count,r=Math.sin(k*a);points.push({x:r*Math.cos(a),y:r*Math.sin(a)});}
 const xs=points.map(p=>p.x),ys=points.map(p=>p.y),xmin=Math.min(...xs),xmax=Math.max(...xs),ymin=Math.min(...ys),ymax=Math.max(...ys),scale=2/Math.max(xmax-xmin,ymax-ymin);
 return points.map(p=>({x:(p.x-(xmin+xmax)/2)*scale,y:(p.y-(ymin+ymax)/2)*scale}));
}
const roses=Array.from({length:8},(_,i)=>rosePoints(i+1));
function recordMusicNote(f,strength,kind='note',group=null){
 const now=performance.now()/1000,pitch=scoreFrequencies.reduce((best,v,i)=>Math.abs(v-f)<Math.abs(scoreFrequencies[best]-f)?i:best,0);
 if(kind==='slide'&&now-(slideTimes.get(pitch)??-Infinity)<.2)return;
 if(kind==='slide')slideTimes.set(pitch,now);
 if(scoreEpoch===null)scoreEpoch=now;
 const last=scoreEvents.at(-1),time=now-scoreEpoch;
 // Keep overlapping petals readable: dense chords and long pauses both have bounded spacing.
 const position=group&&last?.group===group?last.position:last?last.position+Math.max(20,Math.min(38,(time-last.time)*70)):0;
 displayScore=null;scorePlayhead=null;scoreOffset=null;
 const sound=typeof liveScore!=='undefined'?{...liveScore.at(-1)}:null;
 scoreEvents.push({time,absolute:now,pitch,strength:Math.max(0,Math.min(1,strength)),position,sound,group,volumeY:group?strength:null});
 
 if(!scoreFrame)scoreFrame=requestAnimationFrame(drawMusicScore);
}
function noteShape(ctx,pitch,x,y,r){
 ctx.beginPath();roses[pitch].forEach((p,i)=>{const px=x+p.x*r,py=y+p.y*r;i?ctx.lineTo(px,py):ctx.moveTo(px,py);});ctx.closePath();ctx.stroke();
}
function drawMusicScore(){
 scoreFrame=0;
 const w=musicCanvas.clientWidth||580,h=musicCanvas.clientHeight||170,dpr=Math.min(window.devicePixelRatio||1,2),ctx=musicContext;
 musicCanvas.width=Math.round(w*dpr);musicCanvas.height=Math.round(h*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
 ctx.globalAlpha=1;ctx.strokeStyle=document.documentElement.dataset.theme==='light'?'#bbb7c5':'#514a5e';ctx.lineWidth=.7;ctx.beginPath();ctx.moveTo(0,h-12);ctx.lineTo(w,h-12);ctx.stroke();
 const events=displayScore||scoreEvents,origin=events[0]?.position||0;
 const left=27,right=w-27,maxOffset=Math.max(0,(events.at(-1)?.position||0)-origin-(right-left)),offset=scoreOffset===null?maxOffset:Math.max(0,Math.min(maxOffset,scoreOffset));
 ctx.save();ctx.beginPath();ctx.rect(0,13,w,h-26);ctx.clip();
 for(const event of events){
  const x=left+event.position-origin-offset;if(x<-25||x>w+25)continue;
  const y=flowerY(event,h);
  const reached=scorePlayhead===null||event.time<=scorePlayhead,lit=hoverFlowers.has(event)||(scorePlayhead!==null&&scorePlayhead>=event.time&&scorePlayhead-event.time<.35);
  ctx.globalAlpha=lit?1:reached?(.22+.75*event.strength):.1;ctx.strokeStyle=scoreColor(event.pitch);ctx.lineWidth=lit?2:1.05;ctx.shadowColor=scoreColor(event.pitch);ctx.shadowBlur=lit?10:0;
  noteShape(ctx,event.pitch,x,y,lit?25:23);ctx.shadowBlur=0;
 }
 ctx.restore();ctx.globalAlpha=1;
 const age=clearClock?Math.max(0,audioContext.currentTime-clearClock.start):(performance.now()-particleStart)/1000;
 clearingFlowers=clearingFlowers.filter(f=>age<f.delay);
 for(const f of clearingFlowers){ctx.globalAlpha=f.alpha;ctx.strokeStyle=scoreColor(f.pitch);ctx.lineWidth=1.05;noteShape(ctx,f.pitch,f.x,f.y,23);}
 particleCanvas.width=Math.round(w*dpr);particleCanvas.height=Math.round((h+800)*dpr);particleCanvas.style.height=(h+800)+'px';
 const particleCtx=particleContext;particleCtx.setTransform(dpr,0,0,dpr,0,800*dpr);particleCtx.clearRect(0,-800,w,h+800);
 particles=particles.filter(p=>age+1e-8<p.delay+p.life);
 for(const p of particles){const localAge=age-p.delay;if(localAge<0)continue;const progress=Math.min(1,localAge/p.life),fade=(1-progress)**2;
  const x=p.x+p.vx*localAge,y=p.y+p.vy*localAge;
  particleCtx.globalAlpha=p.alpha*fade;particleCtx.fillStyle=scoreColor(p.pitch);
  particleCtx.beginPath();particleCtx.arc(x,y,p.size,0,Math.PI*2);particleCtx.fill();
 }
 ctx.globalAlpha=1;if((particles.length||clearingFlowers.length)&&!scoreFrame)scoreFrame=requestAnimationFrame(drawMusicScore);
}
new ResizeObserver(()=>{document.querySelector('.panel').style.setProperty('--score-width',musicCanvas.clientWidth+'px');if(!scoreFrame)scoreFrame=requestAnimationFrame(drawMusicScore);}).observe(musicCanvas);
let SCORE_SCAN_SPEED=260;
function clearDuration(count){return Math.min(20,Math.max(5,5+(count-1)*.12));}
function verticalClearSequence(events,h){
 const ordered=[...events].sort((a,b)=>flowerY(a,h)-flowerY(b,h)||a.position-b.position),top=ordered.length?flowerY(ordered[0],h):0;
 return ordered.map((event,index)=>({event,delay:(flowerY(event,h)-top)/SCORE_SCAN_SPEED,volume:1-.8*index/Math.max(1,ordered.length-1)}));
}
document.querySelector('#clear-curve').addEventListener('click',()=>{
 const events=[...(displayScore||scoreEvents)],layout=scoreLayout(),h=musicCanvas.clientHeight||170;
 if(!events.length)return;
 for(const voice of clearVoices){try{voice.stop();}catch{}}clearVoices=[];clearOutput?.disconnect();
 particles=[];clearingFlowers=[];particleStart=performance.now();
 const duration=clearDuration(events.length),sequence=verticalClearSequence(events,h);
 unlockAudio();const t=audioContext?.currentTime||0,output=audioContext&&!muted?audioContext.createGain():null;clearOutput=output;clearClock=output?{start:t,duration}:null;
 if(output){output.connect(master);output.gain.value=.65/Math.sqrt(Math.max(1,events.length));}
 sequence.forEach(({event:e,delay,volume})=>{
  const attack=timbres[e.sound?.instrument||instrument].attack,life=duration-delay,x=27+e.position-layout.origin-layout.offset,y=flowerY(e,h),alpha=.22+.75*e.strength;
  if(x>=-30&&x<=layout.width+30){clearingFlowers.push({x,y,delay,pitch:e.pitch,alpha,color:scoreColor(e.pitch)});
   // A bounded, dispersed sample avoids piling up particles at petal intersections.
   const points=roses[e.pitch].filter(p=>Math.hypot(p.x,p.y)>.2),count=30;
   for(let i=0;i<count;i++){const p=points[Math.floor((i+Math.random())*points.length/count)],speed=10+Math.random()**1.4*85;
    particles.push({pitch:e.pitch,x:x+p.x*23+(Math.random()-.5)*5,y:y+p.y*23+(Math.random()-.5)*5,vx:(Math.random()-.5)*38,vy:-speed,delay:delay+attack,life:life-attack,size:.6+Math.random()*.5,alpha:alpha*(.55+Math.random()*.4),color:scoreColor(e.pitch)});
   }
  }
  if(output)clearVoices.push(...(playTone(scoreFrequencies[e.pitch],1,volume,{output,when:t+delay,fadeUntil:t+duration,instrument:e.sound?.instrument||instrument,capture:false})||[]));
 });
 if(output)setTimeout(()=>output.disconnect(),(duration+.2)*1000);
 scoreEvents.length=0;scoreEpoch=null;slideTimes.clear();displayScore=null;scorePlayhead=null;scoreOffset=null;hoverFlowers.clear();hoverFlower=null;drawMusicScore();
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
 if(!e||(typeof scorePlayback!=='undefined'&&scorePlayback&&!scorePlayback.paused))return;
 const now=performance.now();if(now-(previewTimes.get(e)??-Infinity)<250)return;previewTimes.set(e,now);
 unlockAudio();if(!audioContext)return;await audioContext.resume();const sound=e.sound;
 if(sound?.kind==='note')playTone(sound.f,sound.strength,sound.volume,{instrument:sound.instrument,capture:false});
 else playTone(scoreFrequencies[e.pitch],e.strength,sound?.volume??1,{instrument:'synth',capture:false});
}
function scanScore(sweep=true){
 if(!scanPointer)return;const layout=scoreLayout(),x=scanPointer.x+layout.offset-27+layout.origin;
 const previous=sweep&&scanPrevious!==null?scanPrevious:x;
 const next=new Set();
 for(const e of layout.events){const extent=roses[e.pitch].reduce((m,p)=>Math.max(m,Math.abs(p.x)*23),0);
  if(Math.abs(e.position-x)<=extent)next.add(e);
  if(e.position+extent>=Math.min(previous,x)&&e.position-extent<=Math.max(previous,x)&&!hoverFlowers.has(e))previewFlower(e).catch(()=>{});
 }
 scanPrevious=x;hoverFlowers=next;drawMusicScore();
}
function edgeScroll(time){
 edgeFrame=0;if(!scanPointer)return;const dt=Math.min(.04,(time-(edgeTime||time))/1000);edgeTime=time;
 const {width,max,offset}=scoreLayout(),zone=Math.min(65,width*.18),x=scanPointer.x;
 const speed=x<zone?-SCORE_SCAN_SPEED*(1-x/zone):x>width-zone?SCORE_SCAN_SPEED*(1-(width-x)/zone):0;
 if(speed&&((speed<0&&offset>0)||(speed>0&&offset<max))){panScore(speed*dt);scanScore();}
 edgeFrame=requestAnimationFrame(edgeScroll);
}
musicCanvas.addEventListener('pointermove',e=>{const box=musicCanvas.getBoundingClientRect();scanPointer={x:Math.max(0,Math.min(box.width,e.clientX-box.left))};scanScore();if(!edgeFrame){edgeTime=0;edgeFrame=requestAnimationFrame(edgeScroll);}});
musicCanvas.addEventListener('pointerdown',e=>{unlockAudio();scanPrevious=null;hoverFlowers.clear();const box=musicCanvas.getBoundingClientRect();scanPointer={x:e.clientX-box.left};scanScore(false);});
function leaveScore(){scanPointer=null;scanPrevious=null;hoverFlowers.clear();cancelAnimationFrame(edgeFrame);edgeFrame=0;drawMusicScore();}
musicCanvas.addEventListener('pointerleave',leaveScore);musicCanvas.addEventListener('pointercancel',leaveScore);
musicCanvas.addEventListener('wheel',e=>{e.preventDefault();panScore(Math.abs(e.deltaX)>Math.abs(e.deltaY)?e.deltaX:e.deltaY);scanScore();},{passive:false});
musicCanvas.tabIndex=0;musicCanvas.addEventListener('keydown',e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();panScore(e.key==='ArrowLeft'?-80:80);}});
document.querySelector('#download-score').addEventListener('click',()=>{
 const events=displayScore||scoreEvents;if(!events.length)return;const origin=events[0].position,w=Math.max(54,events.at(-1).position-origin+54),h=140;
 const canvas=document.createElement('canvas'),scale=Math.min(2,16384/w);canvas.width=Math.ceil(w*scale);canvas.height=Math.ceil(h*scale);const ctx=canvas.getContext('2d');ctx.scale(scale,scale);ctx.lineWidth=1.05;
 for(const e of events){ctx.strokeStyle=scoreColor(e.pitch);ctx.globalAlpha=.22+.75*e.strength;noteShape(ctx,e.pitch,27+e.position-origin,flowerY(e,h),23);}
 canvas.toBlob(blob=>{if(blob)downloadBlob(blob,'rose-score.png');},'image/png');
});
