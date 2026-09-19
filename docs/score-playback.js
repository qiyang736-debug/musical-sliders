'use strict';
const liveScore=[];
let scoreCapture=null,scorePlayback=null,scoreGeneration=0,displayedAudioScore=null;
const mainScoreButton=document.querySelector('#play-score');
function recordScoreEvent(event){
 if(typeof clearClock!=='undefined'&&clearClock)return;
 const now=performance.now()/1000;displayedAudioScore=null;
 liveScore.push({...event,time:now});
 if(scoreCapture)scoreCapture.events.push({...event,time:now-scoreCapture.start});
 const locked=typeof scoreActionsLocked==='function'&&scoreActionsLocked();
 mainScoreButton.disabled=locked||!liveScore.some(e=>e.kind!=='slide-stop');
}
function beginScoreCapture(){scoreCapture={start:performance.now()/1000,events:[]};}
function graphicsFor(start,end){return scoreEvents.filter(e=>e.absolute>=start&&e.absolute<=end).map(e=>({...e,time:e.absolute-start}));}
function endScoreCapture(){const take=scoreCapture;scoreCapture=null;const now=performance.now()/1000;return take?{events:take.events,duration:now-take.start,graphics:graphicsFor(take.start,now)}:{events:[],duration:0,graphics:[]};}
function currentScore(){
 if(!liveScore.length)return{events:[],duration:0,graphics:[]};
 const start=liveScore[0].time;return{events:liveScore.map(e=>({...e,time:e.time-start})),duration:liveScore.at(-1).time-start+3.3,graphics:graphicsFor(start-.01,Infinity).map(e=>({...e,time:Math.max(0,e.absolute-start)}))};
}
async function renderScore(score){
 const Offline=window.OfflineAudioContext||window.webkitOfflineAudioContext;
 const context=new Offline(1,Math.max(1,Math.ceil(score.duration*44100)),44100);
 const output=context.createGain(),limiter=context.createDynamicsCompressor();output.gain.value=.65;output.connect(limiter);limiter.connect(context.destination);
 const slide=context.createOscillator(),gain=context.createGain();slide.type='triangle';gain.gain.value=0;slide.connect(gain);gain.connect(output);slide.start(0);
 for(const e of score.events){const t=Math.max(0,e.time);
  if(e.kind==='note')playTone(e.f,e.strength,e.volume,{context,output,instrument:e.instrument,when:t,capture:false});
  else if(e.kind==='slide'){slide.frequency.setValueAtTime(frequencies[e.index],t);gain.gain.cancelScheduledValues(t);gain.gain.setTargetAtTime((.025+.09*clamp(e.speed/900,0,1))*e.volume,t,.012);gain.gain.setTargetAtTime(0,t+.065,.025);}
  else if(e.kind==='slide-stop'){gain.gain.cancelScheduledValues(t);gain.gain.setTargetAtTime(0,t,.015);}
 }
 slide.stop(score.duration);return context.startRendering();
}
function stopScorePlayback(){
 scoreGeneration++;
 const p=scorePlayback;if(!p)return;scorePlayback=null;
 cancelAnimationFrame(p.frame);if(p.source){p.source.onended=null;try{p.source.stop();}catch{}p.source.disconnect();}p.gain?.disconnect();p.button.textContent=p.button.dataset.label||'奏响此刻';
}
function syncScoreMute(){if(scorePlayback?.gain)scorePlayback.gain.gain.setTargetAtTime(muted?0:1,audioContext.currentTime,.01);}
function pauseScorePlayback(){const p=scorePlayback;if(!p||p.paused)return;p.offset=Math.min(p.score.duration,p.offset+audioContext.currentTime-p.started);p.paused=true;p.source.onended=null;p.source.stop();p.source.disconnect();p.gain.disconnect();cancelAnimationFrame(p.frame);p.button.textContent=p.button.dataset.label?p.button.dataset.label+' · 继续':'继续播放';}
function resumeScorePlayback(){
 const p=scorePlayback;if(!p)return;p.paused=false;
 const source=audioContext.createBufferSource(),gain=audioContext.createGain();source.buffer=p.buffer;gain.gain.value=muted?0:1;source.connect(gain);gain.connect(audioContext.destination);p.source=source;p.gain=gain;p.started=audioContext.currentTime;
 source.onended=()=>{if(scorePlayback!==p)return;scorePlayhead=p.score.duration;drawMusicScore();stopScorePlayback();};source.start(0,p.offset);p.button.textContent=p.button.dataset.label?p.button.dataset.label+' · 暂停':'暂停';
 const animate=()=>{if(scorePlayback!==p||p.paused)return;scorePlayhead=p.offset+audioContext.currentTime-p.started;followScorePlayhead();drawMusicScore();p.frame=requestAnimationFrame(animate);};animate();
}
async function toggleScorePlayback(score,button){
 if(scorePlayback?.button===button){if(scorePlayback.loading)return;if(scorePlayback.paused){await audioContext.resume();resumeScorePlayback();}else pauseScorePlayback();return;}
 stopScorePlayback();score=scannedScore(score.graphics||[]);if(!score.events.length)return;
 const generation=scoreGeneration;button.textContent=button.dataset.label?button.dataset.label+' · 准备中':'准备播放…';
 scorePlayback={score,button,loading:true,offset:0,frame:0};
 try{unlockAudio();await audioContext.resume();const buffer=await renderScore(score);if(generation!==scoreGeneration)return;
  Object.assign(scorePlayback,{buffer,loading:false});displayedAudioScore=score;displayScore=score.graphics||[];if(displayScore.length&&typeof forgetEcho==='function')forgetEcho();scorePlayhead=0;scoreOffset=0;resumeScorePlayback();
 }catch(error){if(generation!==scoreGeneration)return;stopScorePlayback();button.textContent='重试播放';console.warn('Score playback:',error.message);}
}
function downloadBlob(blob,name){
 if(!blob?.size)throw Error('生成的音乐文件为空');
 const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.hidden=true;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
}
let mp3LibraryPromise=null;
function loadMp3Library(){
 if(window.lamejs?.Mp3Encoder)return Promise.resolve(window.lamejs);
 if(!mp3LibraryPromise)mp3LibraryPromise=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='vendor/lame.min.js';script.onload=()=>window.lamejs?.Mp3Encoder?resolve(window.lamejs):reject(Error('MP3 编码器未就绪'));script.onerror=()=>{script.remove();reject(Error('无法加载 MP3 编码器'));};document.head.append(script);}).catch(error=>{mp3LibraryPromise=null;throw error;});
 return mp3LibraryPromise;
}
async function encodeMp3Locally(buffer){
 const library=await loadMp3Library(),encoder=new library.Mp3Encoder(1,buffer.sampleRate,192),samples=buffer.getChannelData(0),chunks=[];
 for(let offset=0;offset<samples.length;offset+=1152){const pcm=new Int16Array(Math.min(1152,samples.length-offset));for(let i=0;i<pcm.length;i++){const v=clamp(samples[offset+i]||0,-1,1);pcm[i]=v*(v<0?32768:32767);}const chunk=encoder.encodeBuffer(pcm);if(chunk.length)chunks.push(new Uint8Array(chunk));if(offset%(1152*64)===0)await new Promise(resolve=>setTimeout(resolve,0));}
 const tail=encoder.flush();if(tail.length)chunks.push(new Uint8Array(tail));return new Blob(chunks,{type:'audio/mpeg'});
}
function encodeMp3InWorker(buffer){return new Promise((resolve,reject)=>{
 let worker,timer;const finish=(error,blob)=>{clearTimeout(timer);worker?.terminate();error?reject(error):resolve(blob);};
 try{worker=new Worker('mp3-worker.js?v=2');timer=setTimeout(()=>finish(Error('MP3 后台编码超时')),60000);
 worker.onmessage=e=>{if(e.data.error)return finish(Error(e.data.error));const blob=new Blob(e.data.chunks,{type:'audio/mpeg'});finish(blob.size?null:Error('MP3 编码结果为空'),blob);};
 worker.onerror=e=>{e.preventDefault();finish(Error(e.message||'MP3 后台编码失败'));};worker.onmessageerror=()=>finish(Error('MP3 编码数据传输失败'));
 const samples=buffer.getChannelData(0).slice();worker.postMessage({samples,sampleRate:buffer.sampleRate},[samples.buffer]);
 }catch(error){finish(error);}
});}
async function mp3Blob(buffer){try{return await encodeMp3InWorker(buffer);}catch(error){console.warn('MP3 worker unavailable; using local encoder:',error.message);return encodeMp3Locally(buffer);}}


mainScoreButton.addEventListener('click',()=>{if(typeof scoreActionsLocked==='function'&&scoreActionsLocked())return;toggleScorePlayback(displayedAudioScore||currentScore(),mainScoreButton);});
document.querySelector('#clear-curve').addEventListener('click',()=>{stopScorePlayback();liveScore.length=0;displayedAudioScore=null;if(typeof syncScoreActions==='function')syncScoreActions();else mainScoreButton.disabled=true;});
function scannedScore(graphics){
 if(!graphics.length)return{events:[],duration:0,graphics:[]};
 const starts=graphics.map(e=>e.position-roses[e.pitch].reduce((m,p)=>Math.max(m,Math.abs(p.x)*23),0)),origin=Math.min(...starts);
 const events=graphics.map((e,i)=>{const sound=e.sound,time=(starts[i]-origin)/SCORE_SCAN_SPEED;
  return sound?.kind==='note'?{...sound,time}:{kind:'note',f:scoreFrequencies[e.pitch],strength:e.strength,volume:sound?.volume??1,instrument:'pluck',time};
 }).sort((a,b)=>a.time-b.time);
 const duration=Math.max(...events.map(e=>{const p=timbres[e.instrument||'pluck']||timbres.pluck;return e.time+p.attack+p.decay+.05;}));
 return{events,duration,graphics:graphics.map((e,i)=>({...e,time:(starts[i]-origin)/SCORE_SCAN_SPEED}))};
}
document.querySelector('#download-music').addEventListener('click',async event=>{const button=event.currentTarget;if(typeof scoreActionsLocked==='function'&&scoreActionsLocked())return;button.disabled=true;button.textContent='生成中…';button.title='';try{const score=scannedScore(displayScore||scoreEvents);if(!score.events.length)return;const buffer=await renderScore(score);downloadBlob(await mp3Blob(buffer),'musical-score.mp3');}catch(error){console.error('Music export failed:',error);button.textContent='下载失败，重试';button.title=error.message;}finally{if(button.textContent==='生成中…')button.textContent='余音绕梁';if(typeof syncScoreActions==='function')syncScoreActions();else button.disabled=false;}});
document.querySelector('#echo-score').addEventListener('click',async event=>{
 const button=event.currentTarget;if(!lastEcho)return;if(echoCapture&&!lastEchoBuffer&&!lastEchoBlob)return;
 button.disabled=true;button.textContent='生成回响…';button.title='';
 try{
  unlockAudio();if(audioContext)await audioContext.resume();
  let buffer=null;
  if(lastEchoBlob?.size){try{buffer=await audioContext.decodeAudioData(await lastEchoBlob.arrayBuffer());}catch(error){console.warn('Echo decode:',error.message);}}
  if(!buffer)buffer=lastEchoBuffer||await renderEcho(lastEcho);
  if(!buffer)return;
  downloadBlob(await mp3Blob(buffer),'musical-echo.mp3');
 }catch(error){console.error('Echo export failed:',error);button.textContent='下载失败，重试';button.title=error.message;}
 finally{if(lastEcho&&!echoCapture){button.disabled=false;if(button.textContent==='生成回响…')button.textContent='回响';button.title='下载从有到无的回响';}else if(!lastEcho)forgetEcho();}
});
window.addEventListener('pagehide',stopScorePlayback);

const speedSelect=document.querySelector('#score-speed');
try{const saved=localStorage.getItem('musicslider-score-speed');if(['0.5','0.75','1','1.25','1.5','2'].includes(saved))speedSelect.value=saved;}catch{}
SCORE_SCAN_SPEED=260*Number(speedSelect.value);
speedSelect.addEventListener('change',()=>{
 const rate=Number(speedSelect.value);if(![.5,.75,1,1.25,1.5,2].includes(rate))return;
 SCORE_SCAN_SPEED=260*rate;try{localStorage.setItem('musicslider-score-speed',String(rate));}catch{}
 const playback=scorePlayback;if(playback){stopScorePlayback();scorePlayhead=null;drawMusicScore();if(!playback.paused)toggleScorePlayback(playback.score,playback.button);}
});
