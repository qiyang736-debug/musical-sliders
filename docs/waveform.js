'use strict';
let waveAnalyser=null,waveTimer=null,waveSamples=[];
const liveCurve=document.querySelector('#live-curve');
function curveSVG(values,duration){
 const width=640,mid=45,scale=36,n=values.length;
 const points=values.length?values:[0,0];
 const coords=points.map((v,i)=>[10+i*620/Math.max(1,points.length-1),Math.min(1,Math.max(0,v))]);
 const top=coords.map(([x,v])=>x.toFixed(2)+','+(mid-v*scale).toFixed(2));
 const bottom=[...coords].reverse().map(([x,v])=>x.toFixed(2)+','+(mid+v*scale).toFixed(2));
 return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 108" role="img" aria-label="录音音量随时间变化的曲线"><rect width="640" height="108" rx="8" fill="#202026"/><path d="M10 45H630" stroke="#45434f"/><path d="M'+top.join(' L')+' L'+bottom.join(' L')+' Z" fill="#9a89ff" fill-opacity=".25"/><path d="M'+top.join(' L')+'" fill="none" stroke="#b9aaff" stroke-width="1.5"/><text x="10" y="96" fill="#a0a0ae" font-size="12" font-family="sans-serif">0:00</text><text x="630" y="96" text-anchor="end" fill="#a0a0ae" font-size="12" font-family="sans-serif">'+Math.max(0,duration).toFixed(1)+' s</text></svg>';
}
function beginCurve(){
 waveSamples=[];liveCurve.hidden=false;
 if(!waveAnalyser){waveAnalyser=audioContext.createAnalyser();waveAnalyser.fftSize=2048;audioBus.connect(waveAnalyser);}
 const data=new Float32Array(waveAnalyser.fftSize);
 const sample=()=>{waveAnalyser.getFloatTimeDomainData(data);let peak=0;for(const v of data)peak=Math.max(peak,Math.abs(v));waveSamples.push(peak);liveCurve.innerHTML=curveSVG(waveSamples,(performance.now()-recordStart)/1000);};
 sample();waveTimer=setInterval(sample,50);
}
function endCurve(){clearInterval(waveTimer);waveTimer=null;liveCurve.hidden=true;return waveSamples.slice();}
async function attachCurve(item,blob,duration,fallback){
 const figure=document.createElement('div');figure.className='take-curve';
 const link=document.createElement('a');link.textContent='下载曲线 SVG';
 item.append(figure,link);
 let values=fallback;
 try{
  // Decode the finished recording so short attacks between live samples are retained.
  const buffer=await audioContext.decodeAudioData(await blob.arrayBuffer());
  duration=buffer.duration;const channels=Array.from({length:buffer.numberOfChannels},(_,c)=>buffer.getChannelData(c));
  const count=Math.min(640,buffer.length);values=[];
  for(let bin=0;bin<count;bin++){let peak=0;const start=Math.floor(bin*buffer.length/count),end=Math.floor((bin+1)*buffer.length/count);for(const data of channels)for(let i=start;i<end;i++)peak=Math.max(peak,Math.abs(data[i]));values.push(peak);}
 }catch{/* Keep the live captured curve if this browser cannot decode its recording. */}
 const markup=curveSVG(values,duration);figure.innerHTML=markup;
 const url=URL.createObjectURL(new Blob([markup],{type:'image/svg+xml'}));recordingURLs.push(url);
 link.href=url;link.download='musical-sliders-curve-'+Date.now()+'.svg';
}
