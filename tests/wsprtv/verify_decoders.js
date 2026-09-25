// Verifies the wsprtv.com ct_dec definitions in docs/JAWBONE-Balloon-Tracker.md.
// Encodes random values with a JavaScript copy of the firmware's packing
// (telem_add_values_to_Big64 in WSPRbeacon.c, value layouts from process_TELEN_data in main.c)
// and decodes them with wsprtv's own parser/extractor functions.
//
//   git clone --depth 1 https://github.com/wsprtv/wsprtv.github.io.git /tmp/wsprtv
//   node verify_decoders.js /tmp/wsprtv/wsprtv.js
const fs=require('fs');
const src=fs.readFileSync(process.argv[2]||'wsprtv.github.io/wsprtv.js','utf8');
function grab(name){const i=src.indexOf('function '+name+'(');let d=0,j=src.indexOf('{',i);for(let k=j;k<src.length;k++){if(src[k]=='{')d++;else if(src[k]=='}'){d--;if(d==0)return src.slice(i,k+1);}}}
eval(grab('parseCustomTelemetrySpec')+';'+grab('extractCustomTelemetry')+';globalThis.P=parseCustomTelemetrySpec;globalThis.X=extractCustomTelemetry;');
function fw(slot,vr){let v=0n;for(let i=vr.length-1;i>=0;i--){let[val,r]=vr[i];val=((val%r)+r)%r;v=v*BigInt(r)+BigInt(val);}const low=v&63n;v/=64n;v=v*5n+BigInt(slot);v=v*64n+low;return v*2n;}
function raw(B){let v=Number(B>>1n);return Math.floor(v/320)*320+(v%64)*5+(Math.floor(v/64)%5);}
function decode(dec,msgs,labels){globalThis.ct_decoders_param=dec;globalThis.ct_labels_param=labels||null;globalThis.ct_long_labels_param=null;globalThis.ct_units_param=null;
 const spec=P(); if(!spec) throw 'BAD SPEC '+dec; const spot={grid:'FN20XR',lon:-74+1/24-2/24*0,lat:40.7,opaque_ct:undefined};
 const lon0=spot.lon,lat0=spot.lat;
 for(const [i,B] of msgs){const r=raw(B);for(const [f,e] of spec.decoders){let ok=true;for(const x of f){if(x.length==2&&x[0]=='s'&&x[1]!=i){ok=false;break;}if(x.length!=3)continue;let[d,m,ev]=x;if(ev=='s')ev=i;if(Math.trunc(r/d)%m!=ev){ok=false;break;}}if(ok){X(spot,r,e);break;}}}
 return {ct:spot.opaque_ct,dlon:spot.lon-lon0,dlat:spot.lat-lat0,spec};}
const R=n=>Math.floor(Math.random()*n);
const T={
 '0':{vr:()=>[[R(1001),1001],[R(1001),1001],[R(2),2],[R(61),61]],dec:'1001:0:1,1001:0:1,2:0:1,61:0:1',exp:v=>v.map(x=>x[0])},
 '1':{vr:()=>[[R(351),351],[R(351),351],[R(351),351]],dec:'351:0:0.1,351:0:0.1,351:0:0.1',exp:v=>v.map(x=>x[0]*0.1)},
 '3':{vr:()=>[[R(121),121],[R(2),2],[R(121),121],[R(2),2]],dec:'121:0:1,2:0:1,121:0:1,2:0:1',exp:v=>v.map(x=>x[0])},
 '5':{vr:()=>[[R(10),10],[R(10),10],[R(24),24],[R(24),24],[R(101),101],[R(101),101]],dec:'10:t100,10:t101,24:0:1,24:0:1,101:0:10,101:0:10',exp:v=>[v[2][0],v[3][0],v[4][0]*10,v[5][0]*10],pos:v=>[v[0][0],v[1][0]]},
 '6':{vr:()=>[[R(501),501],[R(501),501],[R(61),61],[R(61),61]],dec:'501:0:0.01,501:0:0.01,61:0:10,61:0:40',exp:v=>[v[0][0]*.01,v[1][0]*.01,v[2][0]*10,v[3][0]*40]},
 '7':{vr:()=>{const g7=R(10),g8=R(10),g9=R(24),g10=R(24);return [[g9,24],[g7,10],[g10,24],[g8,10],[R(1440),1440],[R(420),420]]},dec:'240:t100,240:t101,1440:0:1,420:0:1',exp:v=>[v[4][0],v[5][0]]},
 '8':{vr:()=>[[R(600),600],[R(6000),6000],[R(60),60],[R(59),59],[R(2),2]],dec:'600:0:0.01,6000:0:1,60:0:10,59:0:1,2:0:1',exp:v=>[v[0][0]*.01,v[1][0],v[2][0]*10,v[3][0],v[4][0]]},
};
let bad=0;
for(const [t,d] of Object.entries(T)) for(const slot of [2,3,4]) for(let k=0;k<300;k++){
  const v=d.vr(); const out=decode(`ct,s:${slot}_`+d.dec,[[slot,fw(slot,v)]]);
  const e=d.exp(v); const got=out.ct||[];
  for(let j=0;j<e.length;j++) if(Math.abs(got[j]-e[j])>1e-9){bad++; if(bad<5) console.log('MISMATCH type',t,'slot',slot,j,got[j],e[j]);}
  if(t=='7'){ // check position refinement monotonic with grid chars
    const g7=v[1][0],g9=v[0][0],g8=v[3][0],g10=v[2][0];
    const expLon=-1/24+((g7*24+g9)+0.5)/(12*240), expLat=-1/48+((g8*24+g10)+0.5)/(24*240);
    if(Math.abs(out.dlon-expLon)>1e-9||Math.abs(out.dlat-expLat)>1e-9){bad++;console.log('POS7',out.dlon,expLon);}
  }
  if(t=='5'){const expLon=-1/24+(v[0][0]+0.5)/(120), expLat=-1/48+(v[1][0]+0.5)/(240); if(Math.abs(out.dlon-expLon)>1e-9||Math.abs(out.dlat-expLat)>1e-9){bad++;console.log('POS5',out.dlon,expLon,out.dlat,expLat);}}
  // wrong-slot must not decode
  const o2=decode(`ct,s:${slot}_`+d.dec,[[slot==2?3:2,fw(slot==2?3:2,v)]]); if(o2.ct){bad++;}
}
// type 2 signed + defaults 78- and 72- full URLs
const T2=s=>{const b=5,div1=b*901*121,div2=div1*2;return `ct,s:${s},${div1}:2:0_5:901:0:0.01,121:0:1,${div2}:61:0:1~ct,s:${s},${div1}:2:1_5:1:t142:IDX0,5:901:0:0.01,1:t142:IDX1,121:0:-1,1:t142:IDX2,${div2}:61:0:1`;};
for(let k=0;k<2000;k++){const tf=R(241)-120; const v=[[R(901),901],[Math.abs(tf),121],[tf<0?1:0,2],[R(61),61]];
 const dec=T2(3).replace('IDX0','0').replace('IDX1','1').replace('IDX2','2'); const o=decode(dec,[[3,fw(3,v)]]);
 const e=[v[0][0]*.01,tf,v[3][0]]; for(let j=0;j<3;j++) if(Math.abs(o.ct[j]-e[j])>1e-9 && !(e[j]==0&&o.ct[j]==0)){bad++; if(bad<8)console.log('T2',j,o.ct,e);} if(o.ct.length!=3){bad++;}}
console.log(bad?('FAILURES '+bad):'all ET type decoder definitions verified'); if(bad) process.exitCode=1;
{const dec='ct,s:2_240:t100,240:t101,1440:0:1,420:0:1~ct,s:3_600:0:0.01,6000:0:1,60:0:10,59:0:1,2:0:1';let b=0;
for(let k=0;k<1000;k++){const v7=T['7'].vr(),v8=T['8'].vr();const o=decode(dec,[[2,fw(2,v7)],[3,fw(3,v8)]]);const e=[v7[4][0],v7[5][0],v8[0][0]*.01,v8[1][0],v8[2][0]*10,v8[3][0],v8[4][0]];for(let j=0;j<e.length;j++)if(Math.abs(o.ct[j]-e[j])>1e-9)b++;}
console.log('78- URL',b?'FAIL':'ok'); if(b) process.exitCode=1;}

{const dec='ct,s:2_240:t100,240:t101,1440:0:1,420:0:1~ct,s:3,545105:2:0_5:901:0:0.01,121:0:1,1090210:61:0:1~ct,s:3,545105:2:1_5:1:t142:2,5:901:0:0.01,1:t142:3,121:0:-1,1:t142:4,1090210:61:0:1';let b=0;
for(let k=0;k<1000;k++){const v7=T['7'].vr();const tf=R(241)-120;const v2=[[R(901),901],[Math.abs(tf),121],[tf<0?1:0,2],[R(61),61]];const o=decode(dec,[[2,fw(2,v7)],[3,fw(3,v2)]]);
 const e=[v7[4][0],v7[5][0],v2[0][0]*.01,tf,v2[3][0]]; if(o.ct.length!=5) b++; for(let j=0;j<5;j++) if(Math.abs(o.ct[j]-e[j])>1e-9) b++;}
console.log('72- URL',b?'FAIL':'ok'); if(b) process.exitCode=1;}
