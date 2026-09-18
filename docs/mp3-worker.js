importScripts('vendor/lame.min.js');
onmessage=({data})=>{try{const encoder=new lamejs.Mp3Encoder(1,data.sampleRate,192),chunks=[];
for(let offset=0;offset<data.samples.length;offset+=1152){const pcm=new Int16Array(Math.min(1152,data.samples.length-offset));for(let i=0;i<pcm.length;i++){const n=Math.max(-1,Math.min(1,data.samples[offset+i]||0));pcm[i]=n*(n<0?32768:32767);}const chunk=encoder.encodeBuffer(pcm);if(chunk.length)chunks.push(new Uint8Array(chunk));}
const tail=encoder.flush();if(tail.length)chunks.push(new Uint8Array(tail));postMessage({chunks},chunks.map(c=>c.buffer));}catch(e){postMessage({error:e.message});}};
