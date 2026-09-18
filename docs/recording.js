'use strict';
const recordButton=document.querySelector('#record');
const recordStatus=document.querySelector('#record-status');
const recordList=document.querySelector('#record-list');
let recorder=null,recordDestination=null,recordTimer=null,recordStart=0,takeCount=0;
const recordingURLs=[];
function recordingDuration(seconds){return Math.floor(seconds/60).toString().padStart(2,'0')+':'+Math.floor(seconds%60).toString().padStart(2,'0');}
function resetRecordUI(){clearInterval(recordTimer);recordTimer=null;recordButton.disabled=false;recordButton.textContent='● 开始录音';recordButton.setAttribute('aria-pressed','false');}
function addRecording(blob,duration,score){
 takeCount++;
 const item=document.createElement('li'),player=document.createElement('button');
 player.className='take-label';player.textContent='录音 '+takeCount+' · '+recordingDuration(duration);
 player.dataset.label=player.textContent;player.disabled=!score.events.length;
 player.addEventListener('click',()=>toggleScorePlayback(score,player));
 item.append(player);recordList.prepend(item);recordStatus.textContent='';
}
async function startRecording(){
 recordButton.disabled=true;
 try{
  stopScorePlayback();unlockAudio();if(!audioContext||!audioBus)throw Error('无法初始化声音');
  await audioContext.resume();
  if(audioContext.state!=='running')throw Error('音频尚未就绪，请再试一次');
  if(!recordDestination){recordDestination=audioContext.createMediaStreamDestination();audioBus.connect(recordDestination);}
  const mime=['audio/webm;codecs=opus','audio/mp4','audio/webm','audio/ogg;codecs=opus'].find(type=>MediaRecorder.isTypeSupported(type));
  const current=new MediaRecorder(recordDestination.stream,mime?{mimeType:mime}:{}),chunks=[];
  let failed=false,elapsed=0;
  current.ondataavailable=event=>{if(event.data.size)chunks.push(event.data);};
  current.onerror=()=>{failed=true;recordStatus.textContent='录音遇到错误，请重新开始。';resetRecordUI();if(current.state!=='inactive')current.stop();};
  current.onstop=()=>{
   elapsed=(performance.now()-recordStart)/1000;
   const score=endScoreCapture();
   if(!failed&&chunks.length)addRecording(new Blob(chunks,{type:current.mimeType||chunks[0].type||'audio/webm'}),elapsed,score);
   else if(!failed)recordStatus.textContent='没有录到音频，请重新开始。';
   if(recorder===current)recorder=null;resetRecordUI();
  };
  recorder=current;recordStart=performance.now();current.start(250);beginScoreCapture();
  recordButton.textContent='■ 停止录音';recordButton.setAttribute('aria-pressed','true');recordButton.disabled=false;
  const update=()=>{recordStatus.textContent='';recordButton.textContent='■ 停止录音 '+recordingDuration((performance.now()-recordStart)/1000);};
  update();recordTimer=setInterval(update,500);
 }catch(error){endScoreCapture();if(recorder&&recorder.state==='recording')recorder.stop();recorder=null;resetRecordUI();recordStatus.textContent='无法开始录音：'+error.message;}
}
recordButton.addEventListener('click',()=>{
 if(recorder&&recorder.state==='recording'){recordButton.disabled=true;recordButton.textContent='正在保存…';clearInterval(recordTimer);recorder.stop();}
 else startRecording();
});
if(typeof MediaRecorder==='undefined'){recordButton.disabled=true;recordButton.title='当前浏览器不支持录音';recordStatus.textContent='当前浏览器不支持录音，可使用新版 Chrome 或 Safari。';}
window.addEventListener('pagehide',()=>{clearInterval(recordTimer);endScoreCapture();for(const url of recordingURLs)URL.revokeObjectURL(url);});
