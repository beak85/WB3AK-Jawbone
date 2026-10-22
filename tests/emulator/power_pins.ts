// rp2040js check of the GPS (GPIO 11) and MS5351 (GPIO 18) power-switch pins: held HIGH (off)
// from reset, then the GPS soft-start PWM ramp after the boot countdown. LOW = switch ON.
//
//   git clone --depth 1 https://github.com/wokwi/rp2040js.git && cd rp2040js && npm ci
//   cp <this repo>/tests/emulator/power_pins.ts .
//   npx tsx power_pins.ts <path>/JAWBONE.uf2 9.2        # simulate 9.2 s (takes a few minutes)
//
// rp2040js stalls on the one-wire PIO program, so to see the GPS turn-on, build a copy of the
// firmware with the dallas_setup() call in InitPicoPins() commented out and `return;` at the top
// of onewire_read(). A valid configuration page is written to flash so the NVRAM check passes.
// Expected: both pins HIGH at ~0.15 ms; after the countdown GPIO 11 ramps (ON-time rising over
// ~100 ms in 20 ms windows: ~0%, 2%, 12%, 29%, 55%, ...) and then stays LOW; GPIO 18 stays HIGH.
import { Simulator } from './src/simulator.js';
import { GPIOPinState } from './src/gpio-pin.js';
import { bootromB1 } from './demo/bootrom.js';
import { loadUF2 } from './demo/load-flash.js';
const [img, secsArg] = process.argv.slice(2);
const sim = new Simulator(); const mcu = sim.rp2040; const clock = sim.clock;
mcu.loadBootrom(bootromB1); loadUF2(img, mcu);
// valid NVRAM page at FLASH_TARGET_OFFSET (256 KB) so the firmware gets past check_data_validity()
{ const nv = new Uint8Array(256).fill(0); const put=(o:number,str:string)=>{for(let i=0;i<str.length;i++) nv[o+i]=str.charCodeAt(i);};
  put(0,'AB1CDE'); put(6,'Q0'); put(8,'0'); put(9,'1'); put(10,'-'); put(11,'1'); put(13,'0'); put(14,'72-'); put(18,'0'); put(19,'18'); put(22,'0'); put(23,'123'); put(26,'0'); put(27,'H'); put(28,'0');
  mcu.flash.set(nv, 256*1024); }
mcu.logger = { debug(){}, info(){}, warn(){}, error(){} } as any;
const t = () => (clock.nanos / 1e9).toFixed(6);
const pins: Record<number,string> = {11:'GPS_EN', 18:'VFO_EN'};
const last: Record<number,string> = {};
let ledOn = 0, lastLed = '';
const poll = () => {
  for (const p of [11,18]) { const v = GPIOPinState[mcu.gpio[p].value]; if (v !== last[p]) { console.log(`t=${t()} ${pins[p]} ${v}${v==='Low'?'  <-- switch ON':v==='High'?'  (switch off)':'  (floating w/ pull-down: switch may be ON)'}`); last[p] = v; } }
  const l = GPIOPinState[mcu.gpio[25].value]; if (l !== lastLed) { if (l === 'High') { ledOn++; } lastLed = l; }
};
mcu.gpio[27].setInputValue(true);   // one-wire bus idles high (pull-up) so the PIO driver doesn't stall
const bucket: Record<number,number> = {};
const ec: Record<number,number> = {11:0,18:0}; const lowNs: Record<number,number>={11:0,18:0}; const lastT: Record<number,number>={11:0,18:0}; let firstLow=-1, lastEdge=0;
for (const p of [11,18]) mcu.gpio[p].addListener((v,o)=>{ ec[p]++; const now=clock.nanos;
  if (o===GPIOPinState.Low) { lowNs[p]+=now-lastT[p]; if(p===11){ const b=Math.floor(now/20e6); bucket[b]=(bucket[b]||0)+(now-lastT[p]); } } lastT[p]=now;
  if (p===11 && v===GPIOPinState.Low && firstLow<0) firstLow=now; if (p===11) lastEdge=now;
  if (ec[p]<=2) console.log(`  [edge] t=${t()} ${pins[p]} ${GPIOPinState[o]} -> ${GPIOPinState[v]}`); });
let brk=0; mcu.onBreak = (c:number)=>{ if(brk++<5) console.log(`  [BKPT ${c}] t=${t()} PC=0x${mcu.core.PC.toString(16)}`); };
const pcs: Record<string,number> = {};
mcu.core.PC = 0x10000000;
const end = Number(secsArg ?? 10) * 1e9, cyc = 1e9/125e6;
while (clock.nanos < end) {
  for (let i = 0; i < 2000; i++) {
    if (mcu.core.waiting) clock.tick(Math.max(clock.nanosToNextAlarm, 1000));
    else clock.tick(mcu.core.executeInstruction() * cyc);
  }
  poll(); const k=(mcu.core.PC>>>0).toString(16); pcs[k]=(pcs[k]||0)+1;
}
console.log(`GPS_EN edges: ${ec[11]} (ramp from t=${(firstLow/1e9).toFixed(4)} to t=${(lastEdge/1e9).toFixed(4)} s), final ${GPIOPinState[mcu.gpio[11].value]}; VFO_EN edges ${ec[18]} final ${GPIOPinState[mcu.gpio[18].value]}`);
for (const [b,v] of Object.entries(bucket).sort((a,b)=>+a[0]-+b[0])) console.log(`  ${(+b*0.02).toFixed(2)}-${(+b*0.02+0.02).toFixed(2)} s: GPS switch ON ${(100*v/20e6).toFixed(1)}% of the time`);
console.log(`t=${t()} end PC=0x${(mcu.core.PC>>>0).toString(16)}`); console.log('top PCs', Object.entries(pcs).sort((a,b)=>b[1]-a[1]).slice(0,6));
