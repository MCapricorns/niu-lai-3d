"use strict";
/* ============ 牛来大冒险 3D · Ox is Coming ============
   引擎:Three.js(内嵌,单文件零依赖,GitHub Pages 直接跑)
   主角:牛来 —— 按 1.png 建模(芥末黄杂毛/蓝弯角/灰紫厚唇/倦眼)
   Boss:牛模王(Ox Alpha 模型成精)每关拦路 + 4-4 最终决战
   玩法:马里奥式物理 · 空中COMBO · 冲刺撞飞 · 选关 · AI自动闯关
====================================================== */
var W=960,H=600,T=40,S=0.08,TAU=Math.PI*2;
var FONT='"ZCOOL KuaiLe","Microsoft YaHei",sans-serif';
var VER="v1.5.0";
var GH={x:-1,y:-1,w:0,h:0}; /* 作者GitHub徽章热区 */
function clamp(v,a,b){return v<a?a:(v>b?b:v);}
function lerp(a,b,t){return a+(b-a)*t;}
function rnd(a,b){return a+Math.random()*(b-a);}
function hash(n){n=Math.sin(n*127.1+311.7)*43758.5453;return n-Math.floor(n);}
function pick(a){return a[Math.floor(Math.random()*a.length)];}
function wx(px){return px*S;}
function wy(py){return (H-py)*S;}

/* ============ 画布 ============ */
var cv=document.getElementById("cv");
var cvMain=cv;
var ctx=cvMain.getContext("2d");
var cv3d=document.createElement("canvas");
cv3d.width=W; cv3d.height=H;

/* ---------------- 音频 ---------------- */
var AC=null, sfxG=null, musG=null, muted=false;
function initAU(){
  if(AC) return;
  try{
    AC=new (window.AudioContext||window.webkitAudioContext)();
    sfxG=AC.createGain(); sfxG.gain.value=0.9; sfxG.connect(AC.destination);
    musG=AC.createGain(); musG.gain.value=0.42; musG.connect(AC.destination);
  }catch(e){ AC=null; }
}
function tone(f,d,type,vol,slide,when){
  if(!AC||muted) return;
  var t0=(when!==undefined?when:AC.currentTime);
  var o=AC.createOscillator(), g=AC.createGain();
  o.type=type||"square"; o.frequency.setValueAtTime(f,t0);
  if(slide) o.frequency.exponentialRampToValueAtTime(Math.max(20,slide),t0+d);
  g.gain.setValueAtTime(0.0001,t0);
  g.gain.exponentialRampToValueAtTime(vol,t0+0.008);
  g.gain.exponentialRampToValueAtTime(0.0001,t0+d);
  o.connect(g); g.connect(sfxG); o.start(t0); o.stop(t0+d+0.02);
}
function noise(d,vol,fp,when){
  if(!AC||muted) return;
  var t0=(when!==undefined?when:AC.currentTime);
  var len=Math.max(1,Math.floor(AC.sampleRate*d));
  var buf=AC.createBuffer(1,len,AC.sampleRate);
  var ch=buf.getChannelData(0);
  for(var i=0;i<len;i++) ch[i]=Math.random()*2-1;
  var s=AC.createBufferSource(); s.buffer=buf;
  var f=AC.createBiquadFilter(); f.type="lowpass"; f.frequency.value=fp||900;
  var g=AC.createGain(); g.gain.setValueAtTime(vol,t0);
  g.gain.exponentialRampToValueAtTime(0.0001,t0+d);
  s.connect(f); f.connect(g); g.connect(sfxG); s.start(t0);
}
function sJump(){ if(!AC)return; /* 哞!正宗短牛叫(慢振动低音,绝不放屁) */
  var t0=AC.currentTime;
  var o=AC.createOscillator(),g=AC.createGain();
  o.type="sawtooth";
  o.frequency.setValueAtTime(150,t0);
  o.frequency.linearRampToValueAtTime(195,t0+0.1);
  o.frequency.linearRampToValueAtTime(140,t0+0.26);
  var lfo=AC.createOscillator(),lg=AC.createGain();
  lfo.frequency.value=5.5; lg.gain.value=12; lfo.connect(lg); lg.connect(o.frequency);
  var flt=AC.createBiquadFilter(); flt.type="lowpass"; flt.frequency.value=700;
  g.gain.setValueAtTime(0.0001,t0);
  g.gain.exponentialRampToValueAtTime(0.24,t0+0.03);
  g.gain.exponentialRampToValueAtTime(0.0001,t0+0.28);
  o.connect(flt); flt.connect(g); g.connect(sfxG);
  o.start(t0); o.stop(t0+0.3); lfo.start(t0); lfo.stop(t0+0.3);
}
function sCoin(n){ if(!AC)return; var p=1+(n||0)*0.035+Math.random()*0.04; /* 连吃音阶递升 */
  tone(988*p,0.07,"square",0.16); tone(1319*p,0.18,"square",0.14); }
function sBell(){ if(!AC)return; tone(880,0.12,"square",0.2); tone(1175,0.12,"square",0.16); tone(1760,0.22,"square",0.1); }
function sStomp(){ if(!AC)return; noise(0.12,0.25,700); tone(180,0.12,"square",0.18,70); }
function sBump(){ if(!AC)return; tone(110,0.1,"square",0.18,70); }
function sBreak(){ if(!AC)return; noise(0.25,0.3,1600); tone(220,0.16,"square",0.14,60); }
function sPower(){ if(!AC)return; var t=AC.currentTime;
  [392,523,659,784,1047].forEach(function(f,i){ tone(f,0.12,"square",0.14,0,t+i*0.07); }); }
function sStarGet(){ if(!AC)return; var t=AC.currentTime;
  [523,659,784,1047,1319,1568].forEach(function(f,i){ tone(f,0.09,"triangle",0.18,0,t+i*0.05); }); }
function sHurt(){ if(!AC)return; tone(400,0.3,"sawtooth",0.2,120); noise(0.2,0.15,500); }
function sDie(){ if(!AC)return; tone(520,0.5,"sawtooth",0.2,90); tone(260,0.6,"square",0.12,50); }
function sSpring(){ if(!AC)return; tone(200,0.25,"square",0.16,700); tone(700,0.12,"square",0.1,300); }
function sFirework(){ if(!AC)return; noise(0.4,0.2,2200); tone(300,0.3,"sawtooth",0.1,60); }
function sFlag(){ if(!AC)return; var t=AC.currentTime;
  [523,587,659,698,784,880,1047,1319].forEach(function(f,i){ tone(f,0.16,"square",0.16,0,t+i*0.1); }); }
function sMoo(){ if(!AC)return; var t0=AC.currentTime;
  var o=AC.createOscillator(),g=AC.createGain(); o.type="sawtooth";
  o.frequency.setValueAtTime(130,t0); o.frequency.linearRampToValueAtTime(150,t0+0.18);
  o.frequency.linearRampToValueAtTime(120,t0+0.5);
  var lfo=AC.createOscillator(); lfo.frequency.value=5.5;
  var lg=AC.createGain(); lg.gain.value=22; lfo.connect(lg); lg.connect(o.frequency);
  g.gain.setValueAtTime(0.0001,t0); g.gain.exponentialRampToValueAtTime(0.3,t0+0.04);
  g.gain.exponentialRampToValueAtTime(0.0001,t0+0.55);
  var f2=AC.createBiquadFilter(); f2.type="lowpass"; f2.frequency.value=650;
  o.connect(f2); f2.connect(g); g.connect(sfxG);
  o.start(t0); o.stop(t0+0.6); lfo.start(t0); lfo.stop(t0+0.6); }
function sHowl(){ if(!AC)return; var t0=AC.currentTime;
  var o=AC.createOscillator(),g=AC.createGain(); o.type="sawtooth";
  o.frequency.setValueAtTime(180,t0); o.frequency.exponentialRampToValueAtTime(320,t0+0.5);
  o.frequency.exponentialRampToValueAtTime(140,t0+1.1);
  g.gain.setValueAtTime(0.0001,t0); g.gain.exponentialRampToValueAtTime(0.22,t0+0.1);
  g.gain.exponentialRampToValueAtTime(0.0001,t0+1.2);
  o.connect(g); g.connect(sfxG); o.start(t0); o.stop(t0+1.25); }
function sWarn(){ if(!AC)return; tone(90,0.4,"sawtooth",0.3,60); tone(70,0.4,"sawtooth",0.25,50); }
function sGoal(){ if(!AC)return; var t=AC.currentTime;
  [392,440,494,587,659,784,880,1175].forEach(function(f,i){ tone(f,0.2,"square",0.15,0,t+i*0.11); }); }
function sClick(){ if(!AC)return; tone(600,0.06,"square",0.12); }
function sOneUp(){ if(!AC)return; var t=AC.currentTime;
  [659,784,880,1047,1319,1568,2093].forEach(function(f,i){ tone(f,0.1,"square",0.14,0,t+i*0.08); }); }
function sSkid(){ if(!AC)return; noise(0.18,0.13,2600); }
function sTackle(){ if(!AC)return; noise(0.14,0.22,1500); tone(260,0.12,"square",0.16,90); }
function sCombo(n){ if(!AC)return; var base=392*Math.pow(1.13,Math.min(n,10)); var t=AC.currentTime;
  [0,4,7,12].forEach(function(s,i){ tone(base*Math.pow(2,s/12),0.08,"triangle",0.12,0,t+i*0.03); }); }
function sFire(){ if(!AC)return; noise(0.3,0.18,900); tone(180,0.25,"sawtooth",0.12,60); }
function sPerfect(){ if(!AC)return; var t=AC.currentTime;
  [784,988,1175,1568,2093].forEach(function(f,i){ tone(f,0.14,"square",0.15,0,t+i*0.08); }); }
function sNiuLai(){ if(!AC)return; /* Boss登场大喊:牛——来!! */
  var t0=AC.currentTime;
  function shout(f1,f2,d,at,vol){
    var o=AC.createOscillator(),g=AC.createGain();
    o.type="sawtooth";
    o.frequency.setValueAtTime(f1,at);
    o.frequency.exponentialRampToValueAtTime(f2,at+d*0.55);
    o.frequency.exponentialRampToValueAtTime(f2*0.78,at+d);
    var lfo=AC.createOscillator(),lg=AC.createGain();
    lfo.frequency.value=7; lg.gain.value=13; lfo.connect(lg); lg.connect(o.frequency);
    var flt=AC.createBiquadFilter(); flt.type="lowpass";
    flt.frequency.setValueAtTime(800,at); flt.frequency.exponentialRampToValueAtTime(1800,at+d);
    g.gain.setValueAtTime(0.0001,at);
    g.gain.exponentialRampToValueAtTime(vol,at+0.05);
    g.gain.setValueAtTime(vol,at+d*0.7);
    g.gain.exponentialRampToValueAtTime(0.0001,at+d);
    o.connect(flt); flt.connect(g); g.connect(sfxG);
    o.start(at); o.stop(at+d+0.05); lfo.start(at); lfo.stop(at+d+0.05);
  }
  shout(180,300,0.36,t0,0.4);
  shout(240,540,0.7,t0+0.4,0.45);
  noise(0.5,0.12,600,t0+0.4);
}

/* ---------------- 音乐 ---------------- */
var MUS={on:true,tempo:0,pat:null,step:0,next:0,timer:null};
var PATS=[
 {tempo:132, lead:[72,0,76,0,79,0,76,0,81,79,76,0,72,0,74,0,76,0,74,0,72,0,67,0,71,0,72,0,74,0,72,0],
  bass:[48,0,0,52,0,0,55,0,48,0,0,52,0,0,55,0,45,0,0,48,0,0,52,0,43,0,0,48,0,0,52,0], hat:1},
 {tempo:120, lead:[69,0,0,0,72,0,74,0,72,0,69,0,67,0,69,0,72,0,0,0,76,0,74,0,72,0,74,0,69,0,0,0],
  bass:[45,0,0,0,50,0,0,0,45,0,0,0,52,0,0,0,44,0,0,0,48,0,0,0,45,0,0,0,52,0,50,0], hat:1},
 {tempo:112, lead:[76,0,0,0,79,0,83,0,79,0,76,0,74,0,76,0,81,0,0,0,79,0,76,0,74,0,72,0,74,0,76,0],
  bass:[40,0,0,0,47,0,0,0,43,0,0,0,50,0,0,0,45,0,0,0,52,0,0,0,43,0,0,0,50,0,48,0], hat:0},
 {tempo:150, lead:[64,64,0,64,0,64,0,67,64,64,0,62,0,60,62,64,63,63,0,63,0,63,0,66,63,63,0,62,0,60,62,63],
  bass:[40,0,0,40,0,40,0,0,40,0,0,40,0,40,0,0,39,0,0,39,0,39,0,0,39,0,0,39,0,39,0,0], hat:1},
 {tempo:168, lead:[57,57,0,57,60,57,0,60,57,57,0,57,62,60,0,62,58,58,0,58,62,58,0,62,58,58,0,57,60,62,0,60],
  bass:[33,33,0,33,40,0,33,0,33,33,0,33,41,0,33,0,34,34,0,34,42,0,34,0,34,34,0,33,40,0,33,0], hat:1},
 {tempo:100, lead:[72,0,76,0,79,0,84,0,79,0,76,0,72,0,74,0,76,0,0,0,79,0,84,0,86,0,84,0,83,0,79,0],
  bass:[48,0,0,0,55,0,0,0,52,0,0,0,57,0,0,0,53,0,0,0,59,0,0,0,55,0,0,0,60,0,55,0], hat:0}
];
function musicStart(pi){
  if(!AC||!MUS.on) return;
  musicStop();
  var p=PATS[pi]; MUS.pat=p; MUS.tempo=p.tempo; MUS.step=0;
  MUS.next=AC.currentTime+0.1;
  MUS.timer=setInterval(musicTick,40);
}
function musicStop(){ if(MUS.timer){clearInterval(MUS.timer);MUS.timer=null;} }
function musicTick(){
  if(!AC||!MUS.pat) return;
  var sp=60/MUS.tempo/2;
  while(MUS.next<AC.currentTime+0.18){
    var st=MUS.step, p=MUS.pat;
    var n=p.lead[st%p.lead.length], b=p.bass[st%p.bass.length];
    var tt=MUS.next;
    if(n>0){
      tone2(n,sp*1.4,"triangle",0.11,tt,musG);
      tone2(n+12,sp*1.4,"square",0.035,tt,musG);
      tone2(n-12,sp*1.4,"triangle",0.05,tt,musG);
    }
    if(st%2===0&&b>0){ tone2(b,sp*1.6,"sawtooth",0.10,tt,musG); tone2(b,sp*1.6,"triangle",0.08,tt,musG); }
    if(p.hat&&st%2===0){ noise2(0.05,0.05,6000,tt); }
    if(st%4===2){ noise2(0.03,0.03,3000,tt); }
    MUS.next+=sp; MUS.step++;
  }
}
function tone2(f,d,type,vol,when,dest){
  var o=AC.createOscillator(),g=AC.createGain();
  o.type=type; o.frequency.value=440*Math.pow(2,(f-69)/12);
  g.gain.setValueAtTime(0.0001,when);
  g.gain.exponentialRampToValueAtTime(vol,when+0.01);
  g.gain.exponentialRampToValueAtTime(0.0001,when+d);
  o.connect(g); g.connect(dest); o.start(when); o.stop(when+d+0.02);
}
function noise2(d,vol,fp,when){
  var len=Math.max(1,Math.floor(AC.sampleRate*d));
  var buf=AC.createBuffer(1,len,AC.sampleRate);
  var ch=buf.getChannelData(0);
  for(var i=0;i<len;i++) ch[i]=Math.random()*2-1;
  var s=AC.createBufferSource(); s.buffer=buf;
  var f=AC.createBiquadFilter(); f.type="highpass"; f.frequency.value=fp;
  var g=AC.createGain(); g.gain.setValueAtTime(vol,when);
  g.gain.exponentialRampToValueAtTime(0.0001,when+d);
  s.connect(f); f.connect(g); g.connect(musG); s.start(when);
}

/* ---------------- 输入 ---------------- */
var keys={left:false,right:false,run:false,jump:false};
var keyMap={ArrowLeft:"left",KeyA:"left",ArrowRight:"right",KeyD:"right",ShiftLeft:"run",ShiftRight:"run",KeyX:"run",Space:"jump",ArrowUp:"jump",KeyW:"jump",KeyZ:"jump"};
var justPressed={};
function resetKeys(){ keys.left=false; keys.right=false; keys.run=false; keys.jump=false; justPressed={}; }
window.addEventListener("keydown",function(e){
  if(e.code==="KeyM"){muted=!muted;return;}
  if(e.code==="KeyR"&&(GS.state==="play"||GS.state==="pause")){ loadLevel(GS.li,true); sClick(); return; }
  if(e.code==="KeyO"&&(GS.state==="play"||GS.state==="bossintro")){
    GS.auto=!GS.auto; if(GS.auto){ GS.lives=99; niuHoller("妈妈——!! 牛来无敌!!"); sNiuLai(); addShake(16); flash=0.35; }
    else popText(PL.x+14,PL.y-40,"手动模式","#ffd43f");
    sClick(); return;
  }
  if(e.code==="KeyP"||e.code==="Escape"){
    if(GS.state==="play"){ GS.state="pause"; sClick(); }
    else if(GS.state==="pause"){
      if(e.code==="Escape"){ GS.auto=false; GS.state="select"; makeSky(); musicStop(); sClick(); }
      else { GS.state="play"; sClick(); }
    }
    else if(GS.state==="select"){ GS.state="title"; makeSky(); sClick(); }
    return;
  }
  if(e.code==="Enter"||e.code==="Space"){
    if(GS.state==="title"){ GS.state="select"; makeSky(); sClick(); e.preventDefault(); return; }
    if(GS.state==="select"){ startLevel(GS.selIdx); e.preventDefault(); return; }
    if(GS.state==="gameover"||GS.state==="win"){ GS.auto=false; GS.state="title"; makeSky(); buildTitle3D(); sClick(); return; }
  }
  if(GS.state==="title"&&e.code==="KeyA"){ GS.auto=true; startGame(); GS.lives=99; return; }
  if(GS.state==="select"){
    var mv=0;
    if(e.code==="ArrowLeft") mv=-1; else if(e.code==="ArrowRight") mv=1;
    else if(e.code==="ArrowUp") mv=-4; else if(e.code==="ArrowDown") mv=4;
    if(mv){ GS.selIdx=(GS.selIdx+mv+LEVELS.length)%LEVELS.length; sClick(); e.preventDefault(); return; }
  }
  var k=keyMap[e.code];
  if(k){ keys[k]=true; justPressed[k]=true; e.preventDefault(); }
});
window.addEventListener("keyup",function(e){
  var k=keyMap[e.code]; if(k){ keys[k]=false; }
});
/* 修"自动前进":切窗口/切标签清空按键,防卡键 */
window.addEventListener("blur",resetKeys);
document.addEventListener("visibilitychange",function(){ if(document.hidden) resetKeys(); });
window.addEventListener("pointerdown",function(){ initAU(); if(AC&&AC.state==="suspended")AC.resume(); });
function bindTouch(id,k,j){
  var el=document.getElementById(id); if(!el)return;
  var on=function(e){ e.preventDefault(); initAU(); if(AC&&AC.state==="suspended")AC.resume(); keys[k]=true; if(j)justPressed[k]=true; };
  var off=function(e){ e.preventDefault(); keys[k]=false; };
  el.addEventListener("touchstart",on,{passive:false});
  el.addEventListener("touchend",off,{passive:false});
  el.addEventListener("touchcancel",off,{passive:false});
  el.addEventListener("mousedown",on);
  el.addEventListener("mouseup",off);
}
if("ontouchstart" in window||navigator.maxTouchPoints>0){
  var td=document.getElementById("touch"); td.style.display="block";
  bindTouch("btnL","left"); bindTouch("btnR","right"); bindTouch("btnJ","jump",true); bindTouch("btnB","run");
  var bai=document.getElementById("btnAI");
  if(bai){
    var aiToggle=function(e){ e.preventDefault(); if(GS.state==="play"||GS.state==="bossintro"){ GS.auto=!GS.auto; if(GS.auto)GS.lives=99; sClick(); } };
    bai.addEventListener("touchstart",aiToggle,{passive:false});
    bai.addEventListener("mousedown",aiToggle);
  }
}

/* ---------------- 特效 ---------------- */
var parts=[], texts=[], shake=0, freeze=0, flash=0;
function part(o){ parts.push(o); }
function popText(x,y,txt,col){ texts.push({x:x,y:y,txt:txt,t:0,col:col||"#fff"}); }
function addShake(a){ shake=Math.min(18,shake+a); }
function burst(x,y,type,n,spd){
  for(var i=0;i<n;i++){
    var a=Math.random()*TAU, v=rnd(spd*0.3,spd);
    part({x:x,y:y,vx:Math.cos(a)*v,vy:Math.sin(a)*v-spd*0.3,g:type==="dust"?-40:900,life:rnd(0.3,0.8),t:0,type:type,size:rnd(2,4),col:pick(["#ffe08a","#ffcf3f","#ff9a3f","#fff"])});
  }
}
function updateFX(dt){
  for(var i=parts.length-1;i>=0;i--){
    var p=parts[i]; p.t+=dt; p.x+=p.vx*dt; p.y+=p.vy*dt; p.vy+=p.g*dt;
    if(p.t>=p.life) parts.splice(i,1);
  }
  for(var j=texts.length-1;j>=0;j--){ var tx=texts[j]; tx.t+=dt; if(tx.t>0.9) texts.splice(j,1); }
  shake=Math.max(0,shake-dt*30); freeze=Math.max(0,freeze-dt); flash=Math.max(0,flash-dt*2.2);
  if(GS.springSq>0) GS.springSq=Math.max(0,GS.springSq-dt*2.4);
}

/* ---------- 关卡数据 ---------- */
function LV(w,name,theme){
  this.w=w; this.h=15; this.T=new Uint8Array(w*15);
  this.name=name; this.theme=theme; this.ents=[];
  this.coins=[]; this.startX=3; this.flagX=-1; this.flagY=8;
}
LV.prototype.set=function(x,y,c){ if(x>=0&&x<this.w&&y>=0&&y<this.h) this.T[y*this.w+x]=c; };
LV.prototype.get=function(x,y){ if(x<0||x>=this.w||y<0||y>=this.h) return 0; return this.T[y*this.w+x]; };
LV.prototype.fill=function(x1,x2,y1,y2,c){ for(var x=x1;x<=x2;x++)for(var y=y1;y<=y2;y++)this.set(x,y,c); };
LV.prototype.walls=function(){ this.fill(0,0,0,14,2); this.fill(this.w-1,this.w-1,0,14,2); };
LV.prototype.ground=function(x1,x2){ this.fill(x1,x2,12,14,1); };
LV.prototype.groundAll=function(){ this.ground(0,this.w-1); };
LV.prototype.pit=function(x1,x2){ this.fill(x1,x2,10,14,0); };
LV.prototype.brick=function(x,y,n){ for(var i=0;i<n;i++)this.set(x+i,y,3); };
LV.prototype.q=function(x,y,k){ this.set(x,y,k===1?5:k===2?6:k===3?7:4); };
LV.prototype.plat=function(x,y,n){ for(var i=0;i<n;i++)this.set(x+i,y,9); };
LV.prototype.solid=function(x,y1,y2){ this.fill(x,x,y1,y2,2); };
LV.prototype.coin=function(x,y){ this.coins.push({x:x,y:y,t:Math.random()*TAU}); };
LV.prototype.coinRow=function(x,y,n){ for(var i=0;i<n;i++)this.coin(x+i,y); };
LV.prototype.coinArc=function(x,y){ this.coin(x,y); this.coin(x+1,y-1); this.coin(x+2,y); };
LV.prototype.ent=function(o){ o.k=o.k||"wolf"; this.ents.push(o); };
LV.prototype.wolf=function(x){ this.ent({k:"wolf",x:x,y:12}); };
LV.prototype.leopard=function(x){ this.ent({k:"leopard",x:x,y:12}); };
LV.prototype.raven=function(x,y){ this.ent({k:"raven",x:x,y:y}); };
LV.prototype.bird=function(x,y){ this.ent({k:"bird",x:x,y:y}); };
LV.prototype.spring=function(x,y){ this.set(x,y===undefined?12:y,12); };
LV.prototype.spike=function(x,n){ for(var i=0;i<n;i++)this.set(x+i,12,10); };
LV.prototype.lava=function(x,n){ for(var i=0;i<n;i++){ this.set(x+i,12,11); this.set(x+i,13,11); this.set(x+i,14,11);} };
LV.prototype.pipe=function(x,h){
  var top=12-h;
  this.set(x,top,13);
  for(var y=top+1;y<=12;y++) this.set(x,y,14);
};
LV.prototype.flag=function(x){ this.flagX=x; this.flagY=8; for(var y=8;y<=11;y++)this.set(x,y,15); this.set(x,12,2); };
LV.prototype.mplat=function(x1,y1,x2,y2){ this.ents.push({k:"move",x:x1,y:y1,x2:x2,y2:y2}); };
LV.prototype.cr=function(x,n){ for(var i=0;i<n;i++)this.set(x+i,11,16); }; /* 碎板:踩上1秒塌 */
LV.prototype.cannon=function(x){ this.ent({k:"cannon",x:x,y:11}); }; /* 火球炮台 */
LV.prototype.bigc=function(x,y,n){ n=n||1; for(var i=0;i<n;i++)this.coins.push({x:x+i,y:y,t:Math.random()*TAU,big:true}); };

var LEVELS=[];
function defLevel(w,name,theme,fn){ var lv=new LV(w,name,theme); fn(lv); lv.walls(); LEVELS.push(lv); }

defLevel(112,"1-1 格莱美草原",0,function(g){
  g.ground(0,111); g.startX=3;
  g.coinRow(12,10,4);
  g.bigc(18,9);
  g.q(20,8,1); g.brick(24,8,3); g.q(26,8,2); g.brick(28,8,3);
  g.wolf(36);
  g.pit(40,43);
  g.coinArc(41,10);
  g.wolf(48); g.wolf(52);
  g.pit(55,58); g.plat(55,10,2); g.coinRow(56,9,2);
  g.spring(64);
  g.coinRow(63,6,4);
  g.q(70,8,1); g.brick(72,8,2); g.q(76,8,1);
  g.raven(82,6);
  g.coinRow(84,11,5);
  g.wolf(90); g.leopard(95);
  g.pit(96,99);
  g.mplat(96,10,101,7);
  g.bird(104,7);
  g.flag(105);
});
defLevel(118,"1-2 云雀千问",0,function(g){
  g.ground(0,117); g.startX=3;
  g.coinRow(10,9,5);
  g.plat(16,9,4); g.coinRow(17,8,3); g.bird(18,6);
  g.q(26,8,3); g.brick(28,8,1); g.q(30,8,1);
  g.pipe(22,2); g.pipe(26,3);
  g.wolf(34); g.wolf(38);
  g.pit(42,45); g.plat(42,10,4);
  g.spring(50); g.coinRow(50,7,3);
  g.raven(56,7);
  g.brick(60,8,4); g.q(63,8,1);
  g.pit(66,70); g.mplat(66,10,71,7);
  g.wolf(76); g.leopard(80);
  g.coinRow(84,11,6);
  g.q(90,8,2); g.plat(92,9,3); g.coinRow(95,7,3);
  g.pit(98,101); g.spring(105); g.coinRow(104,6,4);
  g.leopard(110); g.flag(112);
});
defLevel(122,"1-3 鸡屁踢山谷",0,function(g){
  g.ground(0,121); g.startX=3;
  g.coinRow(8,10,4);
  g.wolf(15);
  g.pit(18,22); g.plat(18,9,2); g.coinArc(20,8);
  g.q(26,8,1); g.q(28,8,2);
  g.brick(32,8,5); g.q(34,8,1);
  g.pit(40,43); g.spring(46);
  g.coinRow(46,5,5);
  g.wolf(52); g.wolf(56); g.raven(60,6);
  g.pit(64,69); g.mplat(64,10,69,7);
  g.coinRow(66,8,3);
  g.bird(72,7);
  g.brick(76,8,4); g.q(79,8,3); g.coinRow(80,11,4);
  g.wolf(88);
  g.pit(91,94); g.plat(91,9,4);
  g.q(98,8,1); g.q(100,8,1);
  g.leopard(104); g.wolf(109);
  g.pit(112,115); g.spring(117); g.coinRow(116,5,3);
  g.flag(118);
});
defLevel(126,"1-4 草原图灵",0,function(g){
  g.ground(0,125); g.startX=3;
  g.coinRow(6,9,5); g.q(14,8,1);
  g.wolf(20); g.wolf(24);
  g.pit(28,31); g.coinArc(29,9);
  g.raven(34,7); g.raven(38,6);
  g.brick(42,8,6); g.q(44,8,1); g.q(46,8,3);
  g.pit(50,54); g.mplat(50,10,55,6);
  g.spring(60); g.coinRow(59,5,4);
  g.wolf(66); g.leopard(70); g.leopard(74);
  g.pit(78,82); g.plat(78,8,2); g.coinRow(80,7,2);
  g.bird(86,7);
  g.q(90,8,2); g.q(92,8,1); g.wolf(96);
  g.pit(100,104); g.mplat(100,10,106,10);
  g.spring(108); g.coinRow(108,5,4);
  g.leopard(114); g.wolf(118);
  g.flag(120);
});
defLevel(114,"2-1 逗包戈壁",1,function(g){
  g.ground(0,113); g.startX=3;
  g.wolf(12); g.coinRow(10,10,3);
  g.pit(18,21); g.coinArc(19,9);
  g.q(26,8,1); g.q(28,8,1);
  g.leopard(34); g.wolf(38);
  g.pit(42,46); g.plat(42,9,3);
  g.raven(50,6);
  g.spring(54); g.coinRow(54,6,4);
  g.pit(60,63); g.spring(66);
  g.wolf(72); g.leopard(76);
  g.brick(80,8,5); g.q(82,8,3);
  g.pit(88,92); g.mplat(88,10,93,7);
  g.bird(96,6);
  g.wolf(100); g.coinRow(104,11,4);
  g.flag(108);
});
defLevel(120,"2-2 奇米仙人谷",1,function(g){
  g.ground(0,119); g.startX=3;
  g.coinRow(8,9,4); g.wolf(14);
  g.pit(18,22); g.plat(18,9,2); g.coinArc(20,8);
  g.q(26,8,2); g.pipe(24,2); g.pipe(30,4); g.leopard(32);
  g.pit(36,40); g.spring(42);
  g.q(46,8,1); g.coinRow(48,11,4);
  g.raven(54,6); g.raven(58,7);
  g.pit(62,66); g.mplat(62,10,67,7);
  g.brick(70,8,4); g.q(72,8,3);
  g.leopard(78); g.wolf(82);
  g.pit(86,89); g.plat(86,9,4);
  g.spring(94); g.coinRow(93,5,3);
  g.bird(100,6);
  g.pit(104,108); g.mplat(105,10,108,10);
  g.wolf(112); g.flag(114);
});
defLevel(126,"2-3 maxmini沙丘",1,function(g){
  g.ground(0,125); g.startX=3;
  g.wolf(10); g.leopard(14); g.leopard(18);
  g.pit(24,27); g.spring(30);
  g.coinRow(29,6,4);
  g.q(36,8,1); g.q(38,8,1); g.q(40,8,2);
  g.pit(44,49); g.mplat(45,10,49,7);
  g.raven(54,6);
  g.brick(58,8,5); g.q(60,8,3); g.coinRow(62,11,4);
  g.pit(68,72); g.plat(69,9,3);
  g.wolf(76); g.leopard(80);
  g.spring(84); g.coinRow(84,5,4);
  g.pit(90,94); g.mplat(90,10,95,10);
  g.bird(98,7);
  g.q(102,8,1); g.wolf(106); g.leopard(110);
  g.pit(114,117); g.spring(119);
  g.coinRow(118,5,3);
  g.flag(121);
});
defLevel(130,"2-4 深思遗迹",1,function(g){
  g.ground(0,129); g.startX=3;
  g.coinRow(8,9,4); g.q(16,8,1);
  g.wolf(22); g.leopard(26);
  g.pit(30,34); g.plat(30,9,2);
  g.raven(38,7);
  g.spring(42); g.coinRow(42,6,4);
  g.pit(48,52); g.mplat(48,10,53,6);
  g.brick(56,8,6); g.q(58,8,1); g.q(60,8,3);
  g.leopard(68); g.wolf(72);
  g.pit(76,80); g.plat(77,8,3);
  g.bird(84,6); g.q(88,8,2);
  g.wolf(92); g.leopard(96);
  g.pit(100,105); g.mplat(101,10,104,10);
  g.spring(108); g.coinRow(108,5,4);
  g.wolf(114); g.leopard(118);
  g.pit(122,125); g.coinArc(123,9);
  g.flag(126);
});
defLevel(114,"3-1 月之阳面",2,function(g){
  g.ground(0,113); g.startX=3;
  g.coinRow(10,9,4);
  g.q(18,8,1); g.wolf(24);
  g.pit(28,31); g.coinArc(29,9);
  g.q(36,8,2); g.spring(40); g.coinRow(40,6,4);
  g.wolf(46); g.raven(50,6);
  g.pit(54,58); g.plat(54,9,3);
  g.brick(62,8,4); g.q(64,8,3);
  g.leopard(70);
  g.pit(74,78); g.mplat(74,10,79,7);
  g.bird(82,6);
  g.wolf(86); g.wolf(90);
  g.coinRow(94,11,5);
  g.pit(98,101); g.spring(104);
  g.coinRow(103,5,3);
  g.flag(108);
});
defLevel(122,"3-2 克老得冰谷",2,function(g){
  g.ground(0,121); g.startX=3;
  g.coinRow(8,10,4); g.wolf(16);
  g.pit(20,24); g.plat(20,9,2); g.coinArc(22,8);
  g.q(28,8,1); g.pipe(26,2); g.pipe(33,3); g.raven(38,6);
  g.spring(40); g.coinRow(40,5,4);
  g.leopard(42); g.wolf(46);
  g.pit(50,55); g.mplat(50,10,55,7);
  g.brick(58,8,5); g.q(60,8,3);
  g.bird(66,6);
  g.pit(70,74); g.plat(70,9,3);
  g.wolf(78); g.leopard(82);
  g.q(86,8,2); g.coinRow(88,11,4);
  g.pit(94,98); g.mplat(94,10,99,10);
  g.spring(102); g.coinRow(102,5,4);
  g.raven(108,7); g.flag(116);
});
defLevel(126,"3-3 羊驼雪峰",2,function(g){
  g.ground(0,125); g.startX=3;
  g.wolf(12); g.leopard(16);
  g.pit(20,23); g.spring(26);
  g.q(30,8,1); g.coinRow(32,11,4);
  g.pit(36,41); g.mplat(37,10,41,6);
  g.raven(46,6);
  g.brick(50,8,6); g.q(52,8,1); g.q(54,8,2);
  g.pit(60,64); g.plat(60,8,2);
  g.wolf(68); g.leopard(72);
  g.bird(76,7);
  g.spring(80); g.coinRow(80,5,4);
  g.pit(86,91); g.mplat(86,10,91,7);
  g.wolf(96); g.q(100,8,3);
  g.pit(104,108); g.plat(104,9,3);
  g.raven(112,6); g.coinRow(114,11,4);
  g.flag(120);
});
defLevel(130,"3-4 格罗可雪原",2,function(g){
  g.ground(0,129); g.startX=3;
  g.coinRow(8,9,4); g.q(16,8,1);
  g.wolf(22); g.leopard(26);
  g.pit(30,35); g.mplat(30,10,35,7);
  g.spring(38); g.coinRow(38,5,4);
  g.raven(44,6); g.raven(48,7);
  g.brick(52,8,6); g.q(54,8,2); g.q(56,8,3);
  g.leopard(64); g.wolf(68);
  g.pit(72,76); g.plat(72,8,3);
  g.bird(80,6);
  g.q(84,8,1); g.coinRow(86,11,5);
  g.pit(92,97); g.mplat(92,10,97,10);
  g.wolf(100); g.leopard(104);
  g.spring(108); g.coinRow(108,5,4);
  g.pit(114,118); g.plat(114,9,3);
  g.raven(122,6); g.flag(124);
});
defLevel(114,"4-1 柴特鸡屁踢",3,function(g){
  g.ground(0,113); g.startX=3;
  g.coinRow(10,9,4);
  g.lava(18,3); g.coinArc(19,9);
  g.q(26,8,1); g.wolf(30);
  g.lava(34,4); g.plat(34,10,4);
  g.spring(42); g.coinRow(42,5,4);
  g.raven(48,6);
  g.q(52,8,2); g.lava(56,4); g.mplat(56,10,61,7);
  g.wolf(64); g.leopard(68);
  g.lava(72,3);
  g.brick(76,8,4); g.q(78,8,3);
  g.pit(82,85);
  g.wolf(88); g.coinRow(90,11,4);
  g.lava(94,5); g.mplat(95,10,98,10);
  g.spring(102); g.coinRow(102,5,3);
  g.flag(108);
});
defLevel(120,"4-2 索拉裂谷",3,function(g){
  g.ground(0,119); g.startX=3;
  g.coinRow(8,10,3); g.wolf(14);
  g.lava(18,3); g.coinArc(19,9);
  g.q(26,8,1); g.pipe(24,2); g.pipe(29,4); g.raven(36,6);
  g.lava(40,5); g.mplat(40,10,45,7);
  g.spring(42); g.q(46,8,2);
  g.wolf(52); g.leopard(56);
  g.lava(60,4); g.plat(60,9,4);
  g.brick(68,8,5); g.q(70,8,3);
  g.lava(76,4); g.spring(82);
  g.coinRow(81,5,4);
  g.wolf(88); g.leopard(92);
  g.lava(96,5); g.mplat(96,10,101,10);
  g.bird(104,6); g.q(108,8,1);
  g.flag(114);
});
defLevel(126,"4-3 曼巴火焰之路",3,function(g){
  g.ground(0,125); g.startX=3;
  g.wolf(10); g.leopard(14);
  g.lava(18,3); g.coinArc(19,9);
  g.q(24,8,1); g.spring(28);
  g.coinRow(28,5,4);
  g.lava(34,5); g.mplat(34,10,39,6);
  g.raven(44,6);
  g.brick(48,8,6); g.q(50,8,2); g.q(52,8,3);
  g.wolf(60); g.lava(64,4); g.plat(64,9,4);
  g.spring(72); g.coinRow(72,5,4);
  g.leopard(78);
  g.lava(82,6); g.mplat(82,10,87,7);
  g.wolf(92); g.bird(96,6);
  g.lava(100,4); g.coinRow(101,9,3);
  g.q(106,8,1);
  g.leopard(110);
  g.flag(120);
});
defLevel(100,"4-4 Anthropic Dario",3,function(g){
  g.ground(0,99); g.startX=6;
  g.solid(4,0,14); g.solid(95,0,14);
  g.coinRow(14,10,3); g.q(20,8,1);
  g.lava(26,4); g.mplat(26,10,31,10);
  g.coinRow(36,10,3);
  g.brick(64,8,4); g.q(66,8,1);
  g.coinRow(78,10,3);
  g.flagX=-1;
});
/* ===== 第5世界:月面攻势(主题4 · 星空地球背景) ===== */
defLevel(116,"5-1 问芯月面基地",4,function(g){
  g.groundAll(); g.startX=3;
  g.coinRow(10,10,4); g.q(18,8,1);
  g.wolf(26);
  g.pit(30,34); g.plat(30,10,2); g.coinArc(31,7);
  g.spring(38); g.coinRow(38,5,4);
  g.q(44,8,2); g.brick(46,8,2); g.q(48,8,1);
  g.raven(54,6);
  g.pit(58,63); g.mplat(58,10,63,7);
  g.leopard(68); g.wolf(72);
  g.brick(76,8,4); g.q(78,8,3);
  g.pit(82,86); g.plat(83,9,2); g.coinRow(85,7,2);
  g.spring(90); g.coinRow(90,5,3);
  g.bird(96,6); g.wolf(100);
  g.flag(106);
});
defLevel(124,"5-2 万嗒环形山",4,function(g){
  g.groundAll(); g.startX=3;
  g.coinRow(8,10,4);
  g.pit(14,20); g.mplat(14,10,18,7);
  g.pit(24,31); g.mplat(24,9,29,6); g.coinRow(26,5,3);
  g.wolf(34);
  g.pit(38,46); g.plat(39,10,2); g.plat(43,8,2);
  g.q(50,8,1); g.raven(54,6);
  g.pit(58,66); g.mplat(58,10,64,7);
  g.spring(70); g.coinRow(70,5,4);
  g.leopard(76); g.wolf(80);
  g.pit(84,90); g.mplat(84,9,89,9); g.coinRow(88,7,2);
  g.brick(94,8,4); g.q(96,8,2);
  g.bird(102,6);
  g.pit(106,110); g.plat(107,9,2);
  g.flag(116);
});
defLevel(118,"5-3 蚩谱矩阵",4,function(g){
  g.groundAll(); g.startX=3;
  g.coinRow(8,9,4); g.q(16,8,3); g.brick(18,8,3);
  g.pipe(24,2); g.pipe(28,3);
  g.wolf(34);
  g.brick(38,8,6); g.q(40,8,1); g.q(42,8,2);
  g.pit(48,52); g.plat(48,9,3);
  g.raven(56,6);
  g.solid(60,9,11); g.solid(61,9,11); g.plat(60,7,2); g.coinRow(60,6,2);
  g.brick(66,8,5); g.q(68,8,3);
  g.leopard(76); g.wolf(80);
  g.pit(84,88); g.spring(90); g.coinRow(90,5,4);
  g.bird(96,6);
  g.pit(100,105); g.mplat(100,10,105,7);
  g.flag(110);
});
defLevel(110,"5-4 牛模王的服务器",4,function(g){
  g.groundAll(); g.startX=3;
  g.coinRow(10,9,4);
  g.ent({k:"miniboss",x:24});
  g.pit(30,34); g.plat(30,10,3); g.coinRow(31,8,2);
  g.q(38,8,1); g.brick(40,8,2); g.q(42,8,3);
  g.ent({k:"miniboss",x:56});
  g.raven(64,6);
  g.spring(68); g.coinRow(68,5,4);
  g.pit(72,77); g.mplat(72,10,77,7);
  g.brick(82,8,4); g.q(84,8,1);
  g.leopard(92);
  g.flag(98);
});

/* ---------- 关卡加长:每关追加一段专属特色机关(16关16种玩法) ---------- */
function extendLevels(){
  for(var i=0;i<LEVELS.length;i++){
    var old=LEVELS[i];
    if(old.flagX<0) continue; /* 4-4 boss关保持原样 */
    var cut=old.flagX-6, w2=old.w+52;
    var lv=new LV(w2,old.name,old.theme);
    for(var x=0;x<cut;x++)for(var y=0;y<15;y++){ var c=old.get(x,y); if(c)lv.set(x,y,c); }
    for(var e2=0;e2<old.ents.length;e2++){ if(old.ents[e2].x<cut-4) lv.ents.push(old.ents[e2]); }
    for(var c2=0;c2<old.coins.length;c2++){ if(old.coins[c2].x<cut-2) lv.coins.push(old.coins[c2]); }
    lv.startX=old.startX;
    lv.ground(cut,w2-1);
    featureSection(lv,cut,i);
    lv.flag(w2-6);
    lv.walls();
    LEVELS[i]=lv;
  }
}
function featureSection(lv,x0,idx){
  lv.coinRow(x0+3,10,3);
  switch(idx){
    case 0: /* 1-1 弹簧高塔+金币拱门 */
      lv.spring(x0+6); lv.coinRow(x0+5,6,4);
      lv.plat(x0+12,8,3); lv.coinRow(x0+12,7,3);
      lv.spring(x0+18); lv.coinArc(x0+24,7);
      lv.plat(x0+22,6,3); lv.q(x0+27,6,1);
      lv.wolf(x0+34); lv.coinRow(x0+32,11,4);
      break;
    case 1: /* 1-2 云雀护送走廊 */
      lv.plat(x0+5,10,3); lv.bird(x0+6,7);
      lv.plat(x0+11,8,3); lv.bird(x0+12,5); lv.coinRow(x0+11,7,3);
      lv.plat(x0+17,9,2); lv.coinArc(x0+17,7);
      lv.plat(x0+23,7,3); lv.coinRow(x0+23,6,3); lv.bird(x0+24,4);
      lv.leopard(x0+32); lv.coinRow(x0+30,11,5);
      break;
    case 2: /* 1-3 双层砖阵 */
      lv.brick(x0+5,8,6); lv.q(x0+8,8,2);
      lv.brick(x0+14,10,4); lv.plat(x0+14,7,4); lv.coinRow(x0+14,6,4);
      lv.pit(x0+20,x0+24); lv.plat(x0+20,9,2); lv.coinArc(x0+21,7);
      lv.brick(x0+28,8,5); lv.q(x0+30,8,1);
      lv.wolf(x0+36); lv.wolf(x0+39);
      break;
    case 3: /* 1-4 交叉移动平台 */
      lv.pit(x0+4,x0+12); lv.mplat(x0+4,10,x0+9,6);
      lv.pit(x0+14,x0+22); lv.mplat(x0+14,6,x0+19,10);
      lv.coinRow(x0+8,5,3); lv.coinRow(x0+16,10,3);
      lv.pit(x0+24,x0+30); lv.plat(x0+25,8,2); lv.coinRow(x0+27,7,2);
      lv.leopard(x0+36); lv.q(x0+38,8,3);
      break;
    case 4: /* 2-1 尖刺窄桥 */
      lv.spike(x0+5,3); lv.plat(x0+5,9,3); lv.coinRow(x0+5,8,3);
      lv.spike(x0+12,4); lv.plat(x0+12,8,2); lv.coinArc(x0+13,6);
      lv.raven(x0+18,6);
      lv.spike(x0+22,3); lv.spring(x0+27); lv.coinRow(x0+26,5,4);
      lv.wolf(x0+34); lv.coinRow(x0+33,11,4);
      break;
    case 5: /* 2-2 管道峡谷 */
      lv.pipe(x0+5,2); lv.pipe(x0+9,3); lv.coinRow(x0+6,7,2);
      lv.pipe(x0+14,4); lv.coinArc(x0+15,6);
      lv.pipe(x0+20,2); lv.pipe(x0+24,3); lv.coinRow(x0+21,6,2);
      lv.leopard(x0+30); lv.wolf(x0+34);
      break;
    case 6: /* 2-3 沙丘弹跳长廊 */
      lv.spring(x0+4); lv.spring(x0+8); lv.spring(x0+12);
      lv.coinRow(x0+3,5,3); lv.coinRow(x0+7,4,3); lv.coinRow(x0+11,5,3);
      lv.q(x0+16,8,2); lv.raven(x0+19,6);
      lv.spring(x0+24); lv.coinArc(x0+25,6);
      lv.leopard(x0+32); lv.leopard(x0+36);
      break;
    case 7: /* 2-4 遗迹塌方 */
      lv.brick(x0+4,10,2); lv.brick(x0+4,9,2); lv.q(x0+6,8,1);
      lv.solid(x0+10,9,11); lv.solid(x0+11,9,11); lv.plat(x0+10,7,2);
      lv.brick(x0+16,8,4); lv.coinRow(x0+16,7,4);
      lv.pit(x0+22,x0+26); lv.mplat(x0+22,10,x0+26,7);
      lv.wolf(x0+32); lv.q(x0+35,8,3);
      break;
    case 8: /* 3-1 冰湖独木跳 */
      lv.pit(x0+4,x0+7); lv.plat(x0+5,10,1);
      lv.pit(x0+9,x0+13); lv.plat(x0+10,9,1); lv.plat(x0+12,10,1);
      lv.pit(x0+15,x0+20); lv.plat(x0+16,9,1); lv.plat(x0+18,8,1); lv.coinArc(x0+17,6);
      lv.bird(x0+23,6);
      lv.wolf(x0+30); lv.coinRow(x0+28,11,5);
      break;
    case 9: /* 3-2 冰雪双桥 */
      lv.pit(x0+4,x0+10); lv.plat(x0+5,10,2); lv.plat(x0+8,8,2); lv.coinRow(x0+8,7,2);
      lv.pit(x0+13,x0+19); lv.mplat(x0+13,9,x0+18,9);
      lv.coinRow(x0+15,7,3);
      lv.q(x0+23,8,2); lv.raven(x0+26,6);
      lv.leopard(x0+32); lv.wolf(x0+36);
      break;
    case 10: /* 3-3 雪峰之字攀登 */
      lv.plat(x0+4,10,2); lv.plat(x0+8,8,2); lv.plat(x0+12,6,2);
      lv.coinRow(x0+8,7,2); lv.coinRow(x0+12,5,2);
      lv.plat(x0+17,8,2); lv.plat(x0+21,10,2);
      lv.spring(x0+26); lv.coinRow(x0+25,5,3);
      lv.q(x0+31,8,1); lv.wolf(x0+35); lv.leopard(x0+38);
      break;
    case 11: /* 3-4 暴风雪渡鸦群 */
      lv.raven(x0+5,6); lv.raven(x0+9,7); lv.raven(x0+13,5);
      lv.coinRow(x0+5,10,3); lv.coinRow(x0+10,9,3);
      lv.plat(x0+17,8,3); lv.coinRow(x0+17,7,3);
      lv.raven(x0+23,6);
      lv.spring(x0+28); lv.q(x0+32,8,3);
      lv.leopard(x0+37);
      break;
    case 12: /* 4-1 熔岩弹簧跳 */
      lv.lava(x0+4,3); lv.spring(x0+3); lv.coinRow(x0+3,5,3);
      lv.lava(x0+9,4); lv.plat(x0+10,9,2); lv.coinArc(x0+10,7);
      lv.lava(x0+16,3); lv.spring(x0+15); lv.coinRow(x0+15,5,3);
      lv.lava(x0+22,4); lv.mplat(x0+22,10,x0+26,10);
      lv.wolf(x0+32); lv.coinRow(x0+30,11,4);
      break;
    case 13: /* 4-2 岩浆平台接力 */
      lv.lava(x0+4,x0+9); lv.mplat(x0+4,10,x0+8,7);
      lv.lava(x0+11,x0+16); lv.mplat(x0+12,8,x0+15,10);
      lv.coinRow(x0+6,6,3); lv.coinRow(x0+13,10,3);
      lv.lava(x0+19,x0+24); lv.plat(x0+20,9,2); lv.plat(x0+23,8,2);
      lv.q(x0+28,8,2); lv.raven(x0+31,6);
      lv.leopard(x0+36);
      break;
    default: /* 4-3 火焰尖刺混跑 */
      lv.lava(x0+4,3); lv.spike(x0+9,2); lv.plat(x0+9,9,2);
      lv.coinRow(x0+4,10,3);
      lv.lava(x0+14,4); lv.spring(x0+13); lv.coinRow(x0+13,5,3);
      lv.raven(x0+20,6); lv.lava(x0+23,3); lv.plat(x0+23,9,3);
      lv.q(x0+29,8,1); lv.wolf(x0+33); lv.leopard(x0+37);
  }
}
extendLevels();

/* ============ 全局状态 ============ */
var GS={state:"title",li:0,score:0,coins:0,lives:5,time:300,hs:0,levelIntro:0,bossActive:false,boss:null,winT:0,
  combo:0,bestCombo:0,perfect:false,auto:false,selIdx:0,springSq:0,sCoin:0,sKill:0,sBonus:0,holler:null,hollerT:0};
var GT=0;
try{ GS.hs=parseInt(localStorage.getItem("niu_best")||"0",10)||0; }catch(e){}
var curLV=null,tiles=null,coinsEnt=[],ents=[],itms=[],bumps=[],fires=[];
var camX=0;
var PL={x:0,y:0,vx:0,vy:0,w:28,h:36,face:1,ground:false,coyote:0,jbuf:0,big:false,inv:0,star:0,dead:false,anim:0,prevY:0,squash:0,springK:0};
function solid(c){ return c===1||c===2||c===3||c===4||c===5||c===6||c===7||c===8||c===13||c===14; }function tileAt(tx,ty){ if(tx<0||tx>=curLV.w||ty<0||ty>=curLV.h) return 0; return tiles[ty*curLV.w+tx]; }
function setTile(tx,ty,c){ if(tx>=0&&tx<curLV.w&&ty>=0&&ty<curLV.h) tiles[ty*curLV.w+tx]=c; }

function loadLevel(i,fresh){
  GS.li=i; curLV=LEVELS[i];
  tiles=curLV.T.slice(0);
  coinsEnt=[]; ents=[]; itms=[]; bumps=[]; fires=[];
  GS.combo=0; GS.perfect=false;
  var j;
  for(j=0;j<curLV.coins.length;j++){ var c=curLV.coins[j]; coinsEnt.push({x:c.x*T+T/2,y:c.y*T+T/2,t:c.t,taken:false}); }
  for(j=0;j<curLV.ents.length;j++){
    var e=curLV.ents[j];
    if(e.k==="move"){ ents.push({k:"move",x1:e.x*T,y1:e.y*T,x2:e.x2*T,y2:e.y2*T,x:e.x*T,y:e.y*T,w:T*2,h:14,px:e.x*T,py:e.y*T,t:Math.random()*TAU}); }
    else if(e.k==="miniboss"){ ents.push({k:"miniboss",w:66,h:60,x:e.x*T,y:9*T,vy:0,vx:0,face:-1,dead:false,t:Math.random()*TAU,hp:2,maxhp:2,hurtT:0,met:false}); }
    else ents.push({k:e.k,w:e.k==="leopard"?30:26,h:e.k==="leopard"?24:22,x:e.x*T+T/2-13,y:e.y*T,vy:0,vx:0,face:Math.random()<0.5?1:-1,dead:false,t:Math.random()*TAU,baseY:e.y*T});
  }
  /* 每关终点都有牛模王拦路(4-4 是真身决战) */
  if(curLV.flagX>0){
    ents.push({k:"miniboss",w:66,h:60,x:(curLV.flagX-10)*T,y:9*T,vy:0,vx:0,face:-1,dead:false,t:Math.random()*TAU,hp:2,maxhp:2,hurtT:0,met:false});
  }
  PL.x=curLV.startX*T; PL.y=11*T; PL.vy=0; PL.vx=0; PL.face=1; PL.big=fresh?PL.big:false;
  PL.star=0; PL.inv=fresh?PL.inv:0; PL.dead=false; PL.anim=0; PL.squash=0;
  GS.state="play"; GS.levelIntro=2.0; GS.time=300; GS.bossActive=false;
  GS.boss=null;
  camX=clamp(PL.x-W*0.4,0,curLV.w*T-W);
  musicStart(curLV.theme);
  if(typeof makeSky==="function") makeSky();
  buildWorld3D();
  popText(PL.x+14,PL.y-40,curLV.name,"#ffe08a");
}
function startGame(){
  initAU(); if(AC&&AC.state==="suspended")AC.resume();
  GS.score=0; GS.coins=0; GS.sCoin=0; GS.sKill=0; GS.sBonus=0; GS.lives=GS.auto?99:5;
  loadLevel(0,true);
  sClick();
}
function startLevel(i){
  initAU(); if(AC&&AC.state==="suspended")AC.resume();
  GS.score=0; GS.coins=0; GS.sCoin=0; GS.sKill=0; GS.sBonus=0; GS.lives=GS.auto?99:5;
  loadLevel(i,true);
  sClick();
}

/* ============ 玩家 ============ */
function damagePlayer(){
  if(GS.auto) return; /* 牛来模式:无敌 */
  if(PL.inv>0||PL.dead||GS.state!=="play") return;
  if(PL.star>0) return;
  if(PL.big){ PL.big=false; PL.inv=1.6; sHurt(); flash=0.8; addShake(6); popText(PL.x+14,PL.y-20,"变小了!","#ff9a3f"); PL.h=36; }
  else{ die(); }
}
function die(){
  if(PL.dead) return;
  if(GS.auto){ /* 牛来模式:不灭,掉坑回升继续冲 */
    PL.y=5*T; PL.vy=-420; sSpring();
    popText(PL.x+14,PL.y-30,"牛来不灭!","#5ad4ff");
    return;
  }
  PL.dead=true; PL.vy=-720; sDie(); addShake(8);
  GS.state="dead"; GS.deadT=0;
}
function stomp(e){
  e.dead=true; e.squash=0.4;
  GS.combo=(GS.combo||0)+1;
  if(GS.combo>GS.bestCombo) GS.bestCombo=GS.combo;
  var cm=Math.min(GS.combo,8);
  var base=e.k==="leopard"?300:e.k==="raven"?250:200;
  var sc=base*cm;
  GS.score+=sc; GS.sKill+=sc; popText(e.x+e.w/2,e.y+8,"+"+sc,"#ffe08a");
  sStomp();
  if(cm>=2){
    sCombo(cm); addShake(3+Math.min(6,cm)); freeze=cm>=3?0.07:0.045;
    popText(e.x+e.w/2,e.y-16,"COMBO x"+cm+"!","#ff9a3f");
    burst(e.x+e.w/2,e.y+e.h/2,"spark",Math.min(22,8+cm*3),220+cm*45);
    if(cm>=3) part({x:e.x+e.w/2,y:e.y+e.h/2,vx:0,vy:0,g:0,life:0.35,t:0,type:"ring",size:6,col:"rgba(255,210,90,0.9)"});
  } else { addShake(4); freeze=0.05; burst(e.x+e.w/2,e.y+e.h/2,"spark",8,220); }
  if(GS.combo===3) popText(PL.x+14,PL.y-48,"牛气冲天!","#ffd43f");
  if(GS.combo===5) popText(PL.x+14,PL.y-48,"太牛了!!","#ff5a5a");
  if(GS.combo>=8) popText(PL.x+14,PL.y-48,"无敌牛王!!!","#5ad4ff");
  PL.vy=keys.jump?-790:-470; PL.anim=0;
}
function collectCoin(c,fromBlock){
  c.taken=true; GS.coins++; GS.score+=100; GS.sCoin+=100;
  GS.streakT=1.6; GS.streak=(GS.streak||0)+1;
  if(GS.coins%100===0){ GS.lives++; sOneUp(); popText(PL.x+14,PL.y-30,"+1 命!","#7fff7f"); }
  sCoin(GS.streak);
  burst(c.x,c.y,"spark",6,180);
  popText(c.x,c.y-8,"+100","#ffe08a");
}
function spawnCoinDrop(x,y){
  var c={x:x,y:y,t:Math.random()*TAU,taken:false};
  coinsEnt.push(c);
  if(THREE_OK&&dynGroup){ var cm=cyl(0.5,0.5,0.12,0xf4b840,12); cm.rotation.z=Math.PI/2; cm.position.set(worldX(x),worldY(y),0); dynGroup.add(cm); c.mesh=cm; }
}
function spawnItem(k,tx,ty){
  itms.push({k:k,x:tx*T+T/2-10,y:ty*T-14,w:20,h:22,vx:0,vy:-380,dead:false,t:0});
}
function updatePlayer(dt){
  var p=PL;
  p.anim+=dt;
  p.inv=Math.max(0,p.inv-dt); p.star=Math.max(0,p.star-dt); p.squash=Math.max(0,p.squash-dt);
  GS.streakT-=dt; if(GS.streakT<=0) GS.streak=0; /* 金币连吃断了就归零 */
  var targetH=p.big?50:36;
  if(p.h!==targetH){ var feet0=p.y+p.h; p.h=targetH; p.y=feet0-p.h; }
  if(p.star>0 && Math.random()<0.35){
    part({x:p.x+14+rnd(-8,8),y:p.y+18,vx:rnd(-30,30),vy:rnd(-60,-10),g:0,life:0.4,t:0,type:"star",size:3,col:pick(["#ff5a5a","#ffd43f","#5ad4ff","#8aff5a","#ff5ad4"])});
  }
  /* —— 马里奥式物理:加速/急刹打滑/空中惯性/全速冲刺气流 —— */
  var accel=1900, maxv=(keys.run?352:230);
  var dir=(keys.right?1:0)-(keys.left?1:0);
  if(dir!==0){
    p.face=dir;
    var turning=(p.vx*dir<-20);
    if(p.ground&&turning&&Math.abs(p.vx)>90){
      p.vx+=dir*3400*dt;
      if(Math.random()<0.6) part({x:p.x+14,y:p.y+p.h-2,vx:-dir*rnd(60,140),vy:rnd(-70,-15),g:-40,life:0.3,t:0,type:"dust",size:3,col:"rgba(255,245,210,0.95)"});
      if(!p._skidS){ sSkid(); p._skidS=true; }
    } else {
      p.vx+=dir*(p.ground?accel:accel*0.86)*dt;
      p._skidS=false;
    }
    if(p.ground&&Math.abs(p.vx)>60&&Math.random()<0.2) part({x:p.x+7-dir*4,y:p.y+p.h,vx:-dir*rnd(20,50),vy:rnd(-40,-10),g:-30,life:0.3,t:0,type:"dust",size:3,col:"rgba(220,200,160,0.8)"});
    if(Math.abs(p.vx)>285){ /* 冲撞速度:金色气流=可以撞飞敌人 */
      p.dashT=(p.dashT||0)+dt;
      if(p.dashT>0.04){ p.dashT=0;
        part({x:p.x+14-dir*12,y:p.y+rnd(4,30),vx:-dir*rnd(140,230),vy:rnd(-15,15),g:0,life:0.2,t:0,type:"dust",size:3,col:pick(["rgba(255,215,90,0.9)","rgba(255,255,255,0.85)"])});
      }
    }
  } else {
    var fr=(p.ground?1500:240)*dt;
    if(p.vx>0) p.vx=Math.max(0,p.vx-fr); else if(p.vx<0) p.vx=Math.min(0,p.vx+fr);
    p._skidS=false;
  }
  p.vx=clamp(p.vx,-maxv,maxv);
  if(p.ground){ p.coyote=0.1; p.jbuf=Math.max(0,p.jbuf-dt); }
  else p.coyote=Math.max(0,p.coyote-dt);
  if(justPressed.jump){ p.jbuf=0.12; justPressed.jump=false; }
  if(p.jbuf>0&&p.coyote>0){
    p.vy=PL.big?-800:-690; p.ground=false; p.coyote=0; p.jbuf=0; p.squash=0.12;
    sJump(); popText(p.x+14,p.y-16,"哞!","#ffd43f");
    burst(p.x+14,p.y+p.h,"dust",6,90);
  }
  /* 马里奥式重力:按住=飘,松开=截断;下落更重 */
  var grav=(p.vy<0)?(keys.jump?1250:3300):2250;
  p.vy+=grav*dt; p.vy=Math.min(p.vy,1000);
  p.prevY=p.y;
  p.x+=p.vx*dt; if(!GS.auto) collideX(p); /* 牛来模式:穿墙 */
  p.y+=p.vy*dt; collideY(p);
  if(!p._wasG&&p.ground){
    if(p._vyPrev>420){ burst(p.x+14,p.y+p.h,"dust",7,140); addShake(Math.min(5,p._vyPrev/220)); part({x:p.x+14,y:p.y+p.h,vx:0,vy:0,g:0,life:0.3,t:0,type:"ring",size:4,col:"rgba(255,255,255,0.6)"}); }
    if(p.vy>=0) GS.combo=0; /* 落地清连击(弹簧不算) */
  }
  p._wasG=p.ground; p._vyPrev=p.vy;
  if(p.y>H+40){ if(!p.dead){ die(); } }
  if(p.springK>0){ p.springK-=dt; }
  hazardCheck();
  /* 金币磁吸 */
  for(var i=0;i<coinsEnt.length;i++){ var c=coinsEnt[i]; c.t+=dt;
    if(!c.taken){
      var dxm=(p.x+p.w/2)-c.x, dym=(p.y+p.h/2)-c.y;
      var dm2=dxm*dxm+dym*dym;
      if(dm2<12100){ var pull=Math.min(1,dt*(5+(PL.star>0?4:0))); c.x+=dxm*pull; c.y+=dym*pull; }
      if(dm2<900||(Math.abs(c.x-(p.x+p.w/2))<26&&Math.abs(c.y-(p.y+p.h/2))<34)) collectCoin(c,false);
    }
  }
  for(var j=itms.length-1;j>=0;j--){ var it=itms[j]; it.t+=dt;
    if(it.k==="star"){ it.vy+=900*dt; }
    else{ it.vy+=1400*dt; if(it.vy>0&&it.__g){ it.vx=60; } }
    it.x+=it.vx*dt; it.y+=it.vy*dt;
    var tx0=Math.floor(it.x/T),tx1=Math.floor((it.x+it.w)/T),ty=Math.floor((it.y+it.h)/T);
    if(eSolid(tileAt(tx0,ty))||eSolid(tileAt(tx1,ty))){ if(it.vy>0){it.y=ty*T-it.h-0.01;it.vy=it.k==="star"?-420:0;it.__g=true;} else if(it.vy<0){it.vy=0;} }
    var txl=Math.floor(it.x/T),txr=Math.floor((it.x+it.w)/T);
    if(it.vx>0&&eSolid(tileAt(txr,Math.floor((it.y+it.h/2)/T)))){ it.vx=-60; }
    if(it.vx<0&&eSolid(tileAt(txl,Math.floor((it.y+it.h/2)/T)))){ it.vx=60; }
    if(Math.abs(it.x-(p.x+p.w/2))<26&&Math.abs(it.y+it.h/2-(p.y+p.h/2))<34){
      it.dead=true;
      if(it.k==="milk"){
        var canGrow=!p.big;
        if(canGrow){
          var hRow=Math.floor((p.y-16)/T);
          for(var gc=Math.floor((p.x+2)/T);gc<=Math.floor((p.x+p.w-2)/T);gc++){ if(solid(tileAt(gc,hRow))){ canGrow=false; break; } }
        }
        if(canGrow){ p.big=true; sPower(); popText(p.x+14,p.y-26,"变大啦!","#ff8a5a"); }
        else { GS.score+=1000; sPower(); popText(p.x+14,p.y-26,"+1000"+(p.big?"":" (头顶没空间)"),"#ff8a5a"); }
        burst(it.x,it.y,"spark",12,240);
      }
      else if(it.k==="star"){ p.star=9; sStarGet(); popText(p.x+14,p.y-26,"牛角无敌!","#5ad4ff"); burst(it.x,it.y,"spark",16,300); }
      else if(it.k==="bell"){ GS.lives++; sBell(); popText(p.x+14,p.y-26,"+1 命! 牛铃铛","#7fff7f"); burst(it.x,it.y,"spark",14,260); }
    }
    if(it.dead||it.y>H+60||it.t>14){ /* 掉出世界/超时14秒:消失(最后3秒闪烁) */
      if(it.mesh&&dynGroup){ dynGroup.remove(it.mesh); it.mesh=null; } itms.splice(j,1); continue; }
  }
  updateEnemies(dt);
  for(var m=0;m<ents.length;m++){
    var en=ents[m];
    if(en.k==="bird"&&!en.dead&&Math.abs(en.x+13-(p.x+p.w/2))<28&&Math.abs(en.y+10-(p.y+p.h/2))<30){
      en.dead=true; GS.score+=500; sBell(); popText(en.x+13,en.y-10,"+500 云雀的祝福","#ffd43f");
      burst(en.x+13,en.y+8,"spark",16,260);
    }
  }
  if(curLV.flagX>0&&Math.abs((p.x+p.w/2)-curLV.flagX*T)<18&&p.y+10<12*T&&GS.state==="play"){
    startClear();
  }
  if(GS.li===15&&!GS.bossActive&&!GS.boss&&p.x>24*T){
    startBossIntro();
  }
  GS.time-=dt;
  if(GS.time<0){ GS.time=0; die(); }
}

/* ============ 碰撞 ============ */
function collideX(o){
  var top=o.y+3,bot=o.y+o.h-3;
  var ty0=Math.floor(top/T),ty1=Math.floor(bot/T);
  o.hitL=false;o.hitR=false;
  if(o.vx>0){
    var tx=Math.floor((o.x+o.w)/T);
    for(var ty=ty0;ty<=ty1;ty++){
      if(solid(tileAt(tx,ty))){ o.x=tx*T-o.w-0.01; o.vx=0; o.hitR=true; break; }
    }
  }else if(o.vx<0){
    var tx2=Math.floor(o.x/T);
    for(var ty2=ty0;ty2<=ty1;ty2++){
      if(solid(tileAt(tx2,ty2))){ o.x=(tx2+1)*T+0.01; o.vx=0; o.hitL=true; break; }
    }
  }
}
function collideY(o){
  var lx=o.x+4,rx=o.x+o.w-4;
  var tx0=Math.floor(lx/T),tx1=Math.floor(rx/T);
  o.ground=false;o.hitB=false;o.hitT=false;
  if(o.vy>0){
    var ty=Math.floor((o.y+o.h)/T);
    for(var tx=tx0;tx<=tx1;tx++){
      var c=tileAt(tx,ty);
      if(c===12&&o===PL){
        o.y=ty*T-o.h-0.01; o.vy=-1040; o.springK=0.3; GS.springSq=1; sSpring();
        bumps.push({x:tx,y:ty,t:0,sp:true});
        o.hitB=true; o.ground=true;
        break;
      }
      if(solid(c)){ o.y=ty*T-o.h-0.01; o.vy=0; o.ground=true;o.hitB=true; break; }
      if(c===9&&(o.prevY+o.h)<=ty*T+6&&o.vy>=0){ o.y=ty*T-o.h-0.01; o.vy=0; o.ground=true;o.hitB=true; break; }
    }
    /* —— 移动平台单向碰撞(修复穿模/跳不上去) —— */
    if(o===PL&&o.vy>=0){
      for(var mi=0;mi<ents.length;mi++){
        var mp=ents[mi];
        if(mp.k!=="move") continue;
        if(o.x+o.w-4>mp.x&&o.x+4<mp.x+mp.w){
          var mtop=mp.y;
          if((o.prevY+o.h)<=mtop+9&&(o.y+o.h)>=mtop){
            o.y=mtop-o.h-0.01; o.vy=0; o.ground=true; o.hitB=true;
            o._onPlat=mp;
            break;
          }
        }
      }
    }
  }else if(o.vy<0){
    var ty2=Math.floor(o.y/T);
    for(var tx2=tx0;tx2<=tx1;tx2++){
      var c2=tileAt(tx2,ty2);
      if(solid(c2)){
        o.y=(ty2+1)*T+0.01; o.vy=0; o.hitT=true;
        if(o===PL) bumpBlock(tx2,ty2);
        break;
      }
    }
  }
}
function bumpBlock(tx,ty){
  var c=tiles[ty*curLV.w+tx];
  if(c===3){
    setTile(tx,ty,0); sBreak(); addShake(3);
    GS.score+=50;
    for(var i=0;i<6;i++) part({x:tx*T+20,y:ty*T+20,vx:rnd(-180,180),vy:rnd(-320,-80),g:900,life:0.8,t:0,type:"shard",size:4,col:pick(["#c9793f","#a85a28","#e0a060"])});
    popText(tx*T+20,ty*T,"+50","#ffe08a");
    refreshWorldBlock(tx,ty);
  } else if(c===4||c===5||c===6||c===7){
    setTile(tx,ty,8);
    bumps.push({x:tx,y:ty,t:0,sp:false});
    if(c===4){ var cc={x:tx*T+T/2,y:ty*T-4,t:0,taken:false}; collectCoin(cc,true);
      part({x:tx*T+20,y:ty*T-6,vx:0,vy:-260,g:600,life:0.5,t:0,type:"spark",size:4,col:"#ffe08a"}); }
    else if(c===5){ spawnItem("milk",tx,ty); sPower(); }
    else if(c===6){ spawnItem("star",tx,ty); sStarGet(); }
    else if(c===7){ spawnItem("bell",tx,ty); sBell(); }
    refreshWorldBlock(tx,ty);
  } else if(c===2){ sBump(); bumps.push({x:tx,y:ty,t:0,sp:false}); }
}
function hazardCheck(){
  var tx0=Math.floor((PL.x+5)/T),tx1=Math.floor((PL.x+PL.w-5)/T);
  var ty0=Math.floor((PL.y+4)/T),ty1=Math.floor((PL.y+PL.h-2)/T);
  for(var tx=tx0;tx<=tx1;tx++)for(var ty=ty0;ty<=ty1;ty++){
    var c=tileAt(tx,ty);
    if(c===10){ damagePlayer(); addShake(2); return; }
    if(c===11){ if(PL.star>0){ popText(PL.x+14,PL.y-20,"岩浆:不怕!","#5ad4ff"); return; } die(); return; }
  }
}

/* ============ 敌人 ============ */
function eSolid(v){ return solid(v)||v===12||v===10; }
function eSolidAhead(e){
  var tx=Math.floor((e.x+e.w/2+e.face*(e.w/2+4))/T);
  var ty=Math.floor((e.y+e.h+6)/T);
  var v=tileAt(tx,ty);
  return eSolid(v)||v===9; /* 薄平台也算地面,不会走空掉落 */
}
function eWallAhead(e){
  var tx=Math.floor((e.x+e.w/2+e.face*(e.w/2+2))/T);
  var ty2=Math.floor((e.y+e.h/2)/T);
  return eSolid(tileAt(tx,ty2));
}
function updateEnemies(dt){
  var p=PL;
  for(var i=0;i<ents.length;i++){
    var e=ents[i];
    e.t+=dt;
    if(e.k==="move"){
      var tt=(Math.sin(e.t*1.4)+1)/2;
      var nx=lerp(e.x1,e.x2,tt),ny=lerp(e.y1,e.y2,tt);
      var dx=clamp(nx-e.x,-220*dt,220*dt),dy=clamp(ny-e.y,-160*dt,160*dt);
      if(p.ground&&Math.abs((p.y+p.h)-e.y)<8&&p.x+p.w>e.x+2&&p.x<e.x+e.w-2&&!p.dead){
        p.x+=dx; p.y+=dy;
      }
      e.x+=dx; e.y+=dy;
      continue;
    }
    if(e.dead){ e.squash-=dt; if(e.fly) e.x+=e.fly*430*dt; if(e.squash<0) e.gone=true; continue; }
    if(e.k==="raven"){
      e.x+=(e.face)*40*dt;
      e.y=e.baseY-18+Math.sin(e.t*2.2)*34;
      if(Math.random()<0.01) e.face*=-1;
    } else if(e.k==="miniboss"){
      /* 牛模王分身:追着牛来跑,撞墙小跳,踩头2次干掉 */
      if(e.hurtT>0){ e.hurtT-=dt; }
      else{
        if(!e.met&&Math.abs(p.x-e.x)<430){ e.met=true; sNiuLai(); addShake(8); flash=0.4; popText(e.x+e.w/2,e.y-30,"数据归我——!!","#ff5adf"); popText(PL.x+14,PL.y-52,"牛模王 拦路!","#c05aff"); }
        e.face=(p.x>e.x)?1:-1;
        var ms=Math.abs(p.x-e.x)<300?128:66;
        e.vx=e.face*ms; e.x+=e.vx*dt;
        e.vy+=1400*dt; e.y+=e.vy*dt;
        var b0=Math.floor((e.x+4)/T),b1=Math.floor((e.x+e.w-4)/T),by=Math.floor((e.y+e.h)/T);
        var lb=false;
        for(var qb=b0;qb<=b1;qb++){ if(eSolid(tileAt(qb,by))){ e.y=by*T-e.h-0.01; e.vy=0; lb=true; break; } }
        if(lb&&eWallAhead(e)){ e.vy=-620; }
        else if(lb&&!eSolidAhead(e)){ e.face*=-1; } /* 崖边掉头,绝不跳坑 */
        if(!lb&&e.y>H+40){ e.gone=true; } /* 掉坑=阵亡,禁止复活刷新 */
      }
    } else {
      var spd=e.k==="leopard"?135:72;
      if(Math.abs(p.x-e.x)<320&&GS.state==="play"&&!p.dead){
        e.face=(p.x>e.x)?1:-1;
      }
      e.vx=e.face*spd;
      e.x+=e.vx*dt;
      if(eWallAhead(e)) e.face*=-1;
      if(!eSolidAhead(e)&&e.vy===0){ e.face*=-1; }
      e.vy+=1400*dt;
      e.y+=e.vy*dt;
      var tx0=Math.floor((e.x+3)/T),tx1=Math.floor((e.x+e.w-3)/T),ty=Math.floor((e.y+e.h)/T);
      var landed=false;
      for(var q=tx0;q<=tx1;q++){ var gv=tileAt(q,ty); if(eSolid(gv)||gv===9){ e.y=ty*T-e.h-0.01; e.vy=0; landed=true; break; } }
      if(!landed&&e.y>H+80){ e.gone=true; }
    }
    if(e.gone) continue;
    if(!e.dead&&!p.dead&&GS.state==="play"&&e.k!=="bird"){ /* 云雀永远友好 */
      var ov=overlap(e.x+3,e.y+4,e.w-6,e.h-6,p.x+3,p.y+3,p.w-6,p.h-3);
      if(ov){
        if(GS.auto&&!p.dead){ /* 牛来模式:碰谁谁死 */
          if(e.k==="miniboss"){
            if(e.hurtT<=0){
              e.hp--; e.hurtT=1.0;
              sBreak(); addShake(7); burst(e.x+e.w/2,e.y+e.h/2,"spark",16,300);
              if(e.hp<=0){
                e.dead=true; e.squash=0.5; e.fly=p.face;
                GS.score+=2000; GS.sKill+=2000; popText(e.x+e.w/2,e.y-10,"牛模王被撞爆!+2000","#c05aff");
                for(var cd9=0;cd9<6;cd9++) spawnCoinDrop(e.x+e.w/2+rnd(-70,70),e.y-20-cd9*14);
                sPerfect();
              } else popText(e.x+e.w/2,e.y-10,"牛模王 HP:"+e.hp,"#ff5a5a");
            }
            p.vy=-540;
          } else {
            e.dead=true; e.squash=0.35;
            GS.score+=300; GS.sKill+=300; sBreak(); addShake(4);
            popText(e.x+e.w/2,e.y,"碰!+300","#8aff5a");
            p.vy=-260;
          }
        } else {
        var stomping=(p.vy>0&&(p.y+p.h-6)<e.y+e.h*0.5);
        if(e.k==="miniboss"){
          if(stomping){
            /* 踩头永远弹起;无敌帧内不重复计伤、绝不扣血 */
            p.vy=keys.jump?-820:-540;
            if(e.hurtT<=0){
              e.hp--; e.hurtT=1.0;
              GS.combo=(GS.combo||0)+1; if(GS.combo>GS.bestCombo)GS.bestCombo=GS.combo;
              sBreak(); addShake(9); freeze=0.07;
              burst(e.x+e.w/2,e.y+e.h/2,"spark",16,320);
              if(e.hp<=0){
                e.dead=true; e.squash=0.5; e.fly=p.face;
                GS.score+=2000; GS.sKill+=2000; popText(e.x+e.w/2,e.y-10,"牛模王被踩爆!+2000","#c05aff");
                for(var cd=0;cd<6;cd++) spawnCoinDrop(e.x+e.w/2+rnd(-70,70),e.y-20-cd*14);
                sPerfect();
              } else {
                popText(e.x+e.w/2,e.y-10,"牛模王 HP:"+e.hp,"#ff5a5a");
              }
            }
          } else if(p.star>0&&e.hurtT<=0){
            e.hp--; e.hurtT=1.0;
            sBreak(); addShake(9);
            burst(e.x+e.w/2,e.y+e.h/2,"spark",12,300);
            if(e.hp<=0){
              e.dead=true; e.squash=0.5; e.fly=p.face;
              GS.score+=2000; popText(e.x+e.w/2,e.y-10,"牛模王被撞爆!+2000","#c05aff");
              for(var cd2=0;cd2<6;cd2++) spawnCoinDrop(e.x+e.w/2+rnd(-70,70),e.y-20-cd2*14);
              sPerfect();
            } else popText(e.x+e.w/2,e.y-10,"牛模王 HP:"+e.hp,"#ff5a5a");
          } else if(Math.abs(p.vx)>285&&e.hurtT<=0){ /* 冲撞也能撞小牛模王 */
            e.hp--; e.hurtT=1.0;
            p.vx=-p.face*260; p.vy=-320;
            sTackle(); addShake(8); freeze=0.05;
            burst(e.x+e.w/2,e.y+e.h/2,"spark",12,300);
            if(e.hp<=0){
              e.dead=true; e.squash=0.5; e.fly=p.face;
              GS.score+=2000; GS.sKill+=2000; popText(e.x+e.w/2,e.y-10,"牛模王被撞爆!+2000","#c05aff");
              for(var cd3=0;cd3<6;cd3++) spawnCoinDrop(e.x+e.w/2+rnd(-70,70),e.y-20-cd3*14);
              sPerfect();
            } else popText(e.x+e.w/2,e.y-10,"牛模王 HP:"+e.hp,"#ff5a5a");
          } else if(e.hurtT<=0){ damagePlayer(); }
        }
        else if(stomping){
          stomp(e);
        } else if(p.star>0){
          e.dead=true; e.squash=0.3;
          GS.score+=200; sBreak(); addShake(3);
          burst(e.x+e.w/2,e.y+e.h/2,"spark",10,300);
          popText(e.x+e.w/2,e.y,"+200","#5ad4ff");
        } else if(Math.abs(p.vx)>285){ /* 全速冲刺=冲撞攻击(金色气流时生效) */
          e.dead=true; e.squash=0.35; e.fly=p.face;
          GS.combo=(GS.combo||0)+1; if(GS.combo>GS.bestCombo)GS.bestCombo=GS.combo;
          var tsc=e.k==="leopard"?250:180;
          GS.score+=tsc; GS.sKill+=tsc; popText(e.x+e.w/2,e.y,"冲撞!+"+tsc,"#8aff5a");
          sTackle(); addShake(5); freeze=0.04;
          p.vx*=0.74; p.vy=Math.min(p.vy,-140);
          burst(e.x+e.w/2,e.y+e.h/2,"spark",10,260);
        }
        else damagePlayer();
        }
      }
    }
  }
  /* 小怪物理隔离:互相推开+转向,不再穿模叠一起 */
  for(var si=0;si<ents.length;si++){ var sa=ents[si];
    if(sa.dead||sa.gone||sa.k==="move"||sa.k==="bird"||sa.k==="raven"||sa.k==="miniboss") continue;
    for(var sj=si+1;sj<ents.length;sj++){ var sb=ents[sj];
      if(sb.dead||sb.gone||sb.k==="move"||sb.k==="bird"||sb.k==="raven"||sb.k==="miniboss") continue;
      if(overlap(sa.x,sa.y,sa.w,sa.h,sb.x,sb.y,sb.w,sb.h)){
        if(sa.x<sb.x){ sa.x-=2.5; sb.x+=2.5; sa.face=-1; sb.face=1; }
        else { sa.x+=2.5; sb.x-=2.5; sa.face=1; sb.face=-1; }
      }
    }
  }
  /* 互推后若嵌进墙里:退回来(防穿模) */
  for(var sk=0;sk<ents.length;sk++){ var sw9=ents[sk];
    if(sw9.dead||sw9.gone||sw9.k==="move"||sw9.k==="bird"||sw9.k==="raven") continue;
    var l9=Math.floor((sw9.x+2)/T), r9=Math.floor((sw9.x+sw9.w-2)/T), m9=Math.floor((sw9.y+sw9.h/2)/T);
    if(solid(tileAt(l9,m9))){ sw9.x=(l9+1)*T+0.02; sw9.face=1; }
    else if(solid(tileAt(r9,m9))){ sw9.x=r9*T-sw9.w-0.02; sw9.face=-1; }
  }
  for(var k=ents.length-1;k>=0;k--){
    if(ents[k].gone||(ents[k].dead&&ents[k].squash<0)){ if(ents[k].mesh&&dynGroup){ dynGroup.remove(ents[k].mesh); ents[k].mesh=null; } ents.splice(k,1); }
  }
}
function overlap(ax,ay,aw,ah,bx,by,bw,bh){
  return ax<bx+bw&&ax+aw>bx&&ay<by+bh&&ay+ah>by;
}

/* ============ Boss:牛模王(Ox Alpha 模型成精) ============ */
function startBossIntro(){
  GS.bossActive=false; GS.bossIntro=2.2;
  GS.state="bossintro";
  musicStart(4);
  sWarn(); sHowl(); sNiuLai(); addShake(14); flash=0.7;
  popText(86*T+55,12*T-122,"Anthropic Dario:你的算力,归我了!!","#ff2a9a");
  GS.boss={x:86*T,y:12*T-84,w:110,h:84,vx:0,face:-1,state:"idle",t:0,hp:5,maxhp:5,stun:0,warn:0,hurt:0,atk:1.2,dead:false,phase:1,thrown:false};
  spawnBoss3D();
}
function updateBoss(dt){
  var b=GS.boss,p=PL;
  if(!b) return;
  b.t+=dt; b.hurt=Math.max(0,b.hurt-dt);
  if(b.hp<=2&&b.phase===1){ b.phase=2; popText(b.x+b.w/2,b.y-30,"Anthropic Dario:封你账号!!","#c05aff"); sWarn(); addShake(8); flash=0.6; }
  if(b.state==="idle"){
    b.face=(p.x>b.x)?1:-1;
    b.x=clamp(b.x+b.face*(b.phase===2?122:92)*dt,32*T,93*T-b.w); /* 别走出竞技场 */
    b.atk-=dt;
    if(b.atk<=0){
      if(Math.random()<(b.phase===2?0.55:0.35)){ b.state="throw"; b.warn=0.6; b.thrown=false; sWarn(); }
      else { b.state="warn"; b.warn=b.phase===2?0.6:0.9; sWarn(); }
    }
  } else if(b.state==="warn"){
    b.warn-=dt;
    if(Math.random()<0.2) addShake(1);
    if(b.warn<=0){
      b.state="dash"; b.face=(p.x>b.x)?1:-1; b.vx=b.face*(b.phase===2?650:540);
      sHowl();
    }
  } else if(b.state==="throw"){
    b.warn-=dt;
    if(!b.thrown&&b.warn<0.3){
      b.thrown=true;
      var nFb=b.phase===2?3:2;
      for(var fi=0;fi<nFb;fi++){
        var ft2=rnd(0.7,0.95);
        var sx2=b.x+b.w/2+b.face*36, sy2=b.y+20+fi*7;
        fires.push({x:sx2,y:sy2,vx:(p.x+p.w/2-sx2)/ft2+(fi-1)*55,vy:((p.y-sy2)-490*ft2*ft2)/ft2,t:0});
      }
      sFire(); addShake(3);
    }
    if(b.warn<=0){ b.state="idle"; b.atk=rnd(b.phase===2?1.3:2.2,b.phase===2?2.1:3.4); }
  } else if(b.state==="dash"){
    b.x+=b.vx*dt;
    var left=Math.floor(b.x/T),right=Math.floor((b.x+b.w)/T);
    var midty=Math.floor((b.y+b.h/2)/T);
    if((b.vx>0&&solid(tileAt(right,midty)))||(b.vx<0&&solid(tileAt(left,midty)))||b.x<150||b.x>95*T-40-b.w){
      addShake(12); sBreak(); freeze=0.08;
      b.state="stun"; b.stun=2.4; b.vx=0;
      burst(b.x+b.w/2,b.y+b.h/2,"shard",10,260);
    }
  } else if(b.state==="stun"){
    b.stun-=dt;
    if(Math.random()<0.3) part({x:b.x+b.w/2+rnd(-40,40),y:b.y+rnd(-10,10),vx:rnd(-20,20),vy:-30,g:0,life:0.5,t:0,type:"star",size:4,col:"#ffe08a"});
    if(b.stun<=0){ b.state="idle"; b.atk=rnd(1.8,3.0); }
  }
  if(!b.dead&&!p.dead&&GS.state==="play"){
    var ov=overlap(b.x+6,b.y+4,b.w-12,b.h-8,p.x+4,p.y+3,p.w-8,p.h-3);
    if(ov){
      if(GS.auto){ /* 牛来模式:直接撞死牛模王 */
        if(b.hurt<=0){
          b.hp--; b.hurt=1.2; b.state="idle"; b.atk=2.2;
          sBreak(); addShake(10); freeze=0.06;
          burst(b.x+b.w/2,b.y+30,"spark",14,300);
          popText(b.x+b.w/2,b.y-16,b.hp>0?("Anthropic Dario HP:"+b.hp):"Anthropic Dario 崩了!","#ff5a5a");
          if(b.hp<=0){ defeatBoss(); }
        }
        p.vy=-560;
      } else {
      var stomping=(p.vy>0&&(p.y+p.h-8)<b.y+b.h*0.55);
      if(stomping){
        /* 踩头永远弹起;无敌帧内不重复计伤、绝不扣血 */
        p.vy=keys.jump?-840:-560;
        if(b.hurt<=0){
          b.hp--; b.hurt=1.2; b.state="idle"; b.atk=2.2;
          sBreak(); addShake(10); freeze=0.06;
          popText(b.x+b.w/2,b.y-16,b.hp>0?("Anthropic Dario HP:"+b.hp):"Anthropic Dario 崩了!","#ff5a5a");
          burst(b.x+b.w/2,b.y+30,"spark",14,300);
          if(b.hp<=0){ defeatBoss(); }
        }
      } else if(p.star>0){ b.hp--; b.hurt=1.2; if(b.hp<=0){ defeatBoss(); } else { burst(b.x+b.w/2,b.y+30,"spark",10,260); sHurt(); }
        p.vy=-500;
      } else { damagePlayer(); }
      }
    }
  }
}
function updateFires(dt){
  var p=PL;
  for(var i=fires.length-1;i>=0;i--){
    var f=fires[i]; f.t+=dt;
    f.vy+=980*dt; f.x+=f.vx*dt; f.y+=f.vy*dt;
    if(Math.random()<0.5) part({x:f.x,y:f.y,vx:rnd(-30,30),vy:rnd(-40,10),g:-60,life:0.3,t:0,type:"dust",size:3,col:pick(["#ff8a3f","#ffc63f","#ff5a3f"])});
    var hitP=!p.dead&&GS.state==="play"&&overlap(f.x-9,f.y-9,18,18,p.x+3,p.y+3,p.w-6,p.h-3);
    if(hitP&&!GS.auto) damagePlayer(); /* 牛来模式:火球都躲开 */
    var tx=Math.floor(f.x/T),ty=Math.floor(f.y/T);
    if(hitP||solid(tileAt(tx,ty))||f.t>6||f.y>H+60){
      burst(f.x,f.y,"fir",8,180);
      if(f.mesh&&dynGroup){ dynGroup.remove(f.mesh); f.mesh=null; }
      fires.splice(i,1);
    }
  }
}
function defeatBoss(){
  var b=GS.boss; b.dead=true; GS.bossActive=false;
  for(var i2=fires.length-1;i2>=0;i2--){ if(fires[i2].mesh&&dynGroup) dynGroup.remove(fires[i2].mesh); }
  fires=[];
  GS.state="winseq"; GS.winT=0;
  sGoal(); sFirework(); addShake(14);
  for(var i=0;i<40;i++) part({x:b.x+b.w/2,y:b.y+b.h/2,vx:rnd(-320,320),vy:rnd(-380,60),g:500,life:rnd(0.6,1.3),t:0,type:"fir",size:rnd(3,6),col:pick(["#ffd43f","#ff6a3f","#5ad4ff","#8aff5a","#fff"])});
  burst(b.x+b.w/2,b.y+b.h/2,"ring",1,0);
  /* 金币雨:牛模王被打爆掉落 */
  for(var cd4=0;cd4<20;cd4++) spawnCoinDrop(b.x+b.w/2+rnd(-150,150),b.y+rnd(10,60)-cd4*5);
}

/* ============ 流程状态 ============ */
function startClear(){
  GS.state="clear"; GS.clearT=0; sFlag(); addShake(4);
  PL.vx=0; PL.vy=0;
  GS.perfect=true;
  for(var i=0;i<coinsEnt.length;i++){ if(!coinsEnt[i].taken){ GS.perfect=false; break; } }
  if(GS.perfect){ GS.score+=5000; GS.sBonus+=5000; sPerfect(); popText(PL.x+14,PL.y-56,"完美收集!+5000","#ffd43f"); }
  try{ var bk="niu_best_lv"+GS.li; var pv=parseInt(localStorage.getItem(bk)||"0",10)||0; if(GS.score>pv) localStorage.setItem(bk,""+GS.score); }catch(e){}
}
function handleDead(dt){
  GS.deadT+=dt;
  PL.vy+=1500*dt; PL.y+=PL.vy*dt;
  if(GS.deadT>1.8){
    if(!GS.auto) GS.lives--;
    if(GS.lives<0){
      GS.state="gameover";
      if(GS.score>GS.hs){ GS.hs=GS.score; try{localStorage.setItem("niu_best",""+GS.hs);}catch(e){} }
      musicStop();
    } else loadLevel(GS.li,false);
  }
}
function handleClear(dt){
  GS.clearT+=dt;
  var fy=11*T-36;
  if(PL.y<fy){ PL.y+=240*dt; if(PL.y>fy){PL.y=fy; PL.vy=0;} }
  else {
    PL.vx=120; PL.face=1;
    PL.x+=PL.vx*dt;
    collideX(PL);
    var tyy=Math.floor((PL.y+PL.h+4)/T);
    var txL=Math.floor((PL.x+4)/T),txR=Math.floor((PL.x+PL.w-4)/T);
    var land=solid(tileAt(txL,tyy))||solid(tileAt(txR,tyy));
    if(!land){ PL.y+=160*dt; var ty2=Math.floor((PL.y+PL.h)/T); if(solid(tileAt(txL,ty2))||solid(tileAt(txR,ty2))){ PL.y=ty2*T-PL.h-0.01; } }
  }
  if(Math.random()<0.12) part({x:rnd(PL.x-200,PL.x+600),y:rnd(80,420),vx:rnd(-20,20),vy:rnd(-40,60),g:60,life:0.8,t:0,type:"fir",size:rnd(2,5),col:pick(["#ffd43f","#ff6a3f","#5ad4ff","#8aff5a","#fff","#ff9ad4"])});
  if(Math.random()<0.05) sFirework();
  /* 结算:剩余时间换分 */
  if(GS.time>0){
    var drain=Math.min(GS.time,dt*80);
    GS.time-=drain; var tb=Math.round(drain*20); GS.score+=tb; GS.sBonus+=tb;
    if(Math.random()<0.3) sClick();
  }
  if(GS.clearT>2.6){
    var nx=GS.li+1;
    if(nx<LEVELS.length) loadLevel(nx,true);
    else { GS.state="win"; musicStop(); sGoal(); sFirework(); if(GS.score>GS.hs){ GS.hs=GS.score; try{localStorage.setItem("niu_best",""+GS.hs);}catch(e){} } }
  }
}
function handleWinseq(dt){
  GS.winT+=dt;
  if(Math.random()<0.25){
    var bx=rnd(200,760),by=rnd(60,330);
    for(var i=0;i<10;i++) part({x:bx,y:by,vx:rnd(-160,160),vy:rnd(-160,160),g:220,life:rnd(0.6,1.2),t:0,type:"fir",size:rnd(2,5),col:pick(["#ffd43f","#ff6a3f","#5ad4ff","#8aff5a","#fff","#ff9ad4"])});
    sFirework();
  }
  if(GS.winT>4.2){ GS.state="win"; musicStop(); sGoal(); if(GS.score>GS.hs){ GS.hs=GS.score; try{localStorage.setItem("niu_best",""+GS.hs);}catch(e){} } }
}

/* ============ AI 全自动闯关 ============ */
var AIB={stuckT:0,lastX:0,cool:0,jH:0,mode:"run",modeT:0,fails:0};
function groundBelow(tx,ty){
  if(tx<0||tx>=curLV.w) return -1;
  for(var y=Math.max(0,ty);y<15;y++){ var c=tileAt(tx,y); if(solid(c)||c===9) return y; }
  return -1;
}
/* ============ 牛来模式驾驶:无敌穿墙·自动跳跃·见坑就跳·见boss就撞 ============ */
function aiControl(dt){
  var p=PL;
  AIB.cool-=dt;
  keys.run=true; keys.left=false; keys.right=true;
  var px=p.x+p.w/2, feet=p.y+p.h;
  var footRow=Math.max(0,Math.floor((feet-4)/T));
  var wantJump=false, hold=0.55;
  /* 前方没地面(坑/岩浆口) → 提前跳 */
  var gapEdge=-1;
  for(var d=10;d<=180;d+=10){
    var gx=Math.floor((px+d)/T);
    if(groundBelow(gx,Math.max(0,footRow))<0){ gapEdge=d; break; }
  }
  if(p.ground&&gapEdge>=0&&gapEdge<56){ wantJump=true; hold=0.62; }
  /* 前方挡路(地面上的墙/管道) → 穿墙前先跳一下,免得贴脸难看 */
  if(p.ground&&gapEdge<0){
    var fx=Math.floor((px+34)/T);
    if(solid(tileAt(fx,footRow-1))&&!solid(tileAt(fx,footRow-2))&&!solid(tileAt(fx,footRow+1))){ wantJump=true; hold=0.5; }
  }
  /* boss战:冲向牛模王,贴身就是撞,撞完反弹再回 */
  if(GS.boss&&!GS.boss.dead&&GS.state==="play"){
    var b=GS.boss, bx=b.x+b.w/2;
    if(Math.abs(bx-px)>70){ keys.right=bx>px; keys.left=bx<px; }
    else { keys.right=false; keys.left=false; if(p.ground) wantJump=true; }
    if(px>92*T){ keys.right=false; keys.left=true; }
    if(px<7*T){ keys.left=false; keys.right=true; }
  }
  /* 竞技场边缘:防止穿墙跑出地图(5-4/4-4 边界墙有限制) */
  if(px>curLV.w*T-3*T){ keys.right=false; keys.left=true; }
  /* 死亡回升后继续 */
  if(!p.dead&&GS.state==="play"&&p.y>H+40&&GS.auto){
    p.y=5*T; p.vy=-420;
  }
  /* 旗前停(自然触发过关) */
  if(curLV.flagX>0&&px>curLV.flagX*T-26){ keys.right=false; keys.left=false; }
  if(wantJump&&p.ground&&AIB.cool<=0){ justPressed.jump=true; AIB.cool=0.5; AIB.jH=hold; }
  if(AIB.jH>0){ AIB.jH-=dt; keys.jump=true; } else keys.jump=false;
}
function aiControlOld(dt){
  var p=PL;
  AIB.cool-=dt;
  keys.run=true; keys.left=false; keys.right=true;
  var px=p.x+p.w/2, feet=p.y+p.h;
  var footRow=Math.max(0,Math.floor((feet-4)/T));
  var cfx=Math.floor((px+30)/T), cfy=Math.floor((feet-8)/T);
  var wantJump=false, hold=0.35;
  if(AIB.mode==="backoff"){
    /* 后撤助跑:拉开距离再冲刺起跳(治高墙/宽坑) */
    AIB.modeT-=dt;
    keys.right=false; keys.left=true;
    if(AIB.modeT<=0){ AIB.mode="run"; AIB.stuckT=0; AIB.lastX=p.x; }
  } else {
    /* —— 道具优先:奶瓶/铃铛/星星主动去吃 —— */
    var tgt=null,bd=1e9;
    for(var ti2=0;ti2<itms.length;ti2++){ var im=itms[ti2];
      var ddx=im.x+10-px, ddy=im.y+11-feet, ad=Math.abs(ddx);
      if(ad<300&&ddy>-200&&ddy<130&&ad<bd){ bd=ad; tgt=im; }
    }
    if(tgt){
      keys.right=ddx>4; keys.left=ddx<-4;
      if(tgt.y+11<feet-44&&Math.abs(ddx)<80&&p.ground){ wantJump=true; hold=0.4; }
    }
    /* —— 缺口:精确测距,贴边才起跳(太早会跳进坑) —— */
    var gapEdge=-1;
    for(var d=10;d<=170;d+=12){
      var gx=Math.floor((px+d)/T);
      if(groundBelow(gx,footRow)<0){ gapEdge=d; break; }
    }
    if(p.ground&&gapEdge>=0&&gapEdge<48){ wantJump=true; hold=0.62; }
    /* —— 撞墙:低速先后撤助跑,高速直接爬墙跳 —— */
    var wallLow=solid(tileAt(cfx,cfy))&&!solid(tileAt(cfx,cfy-1));
    var wallHigh=solid(tileAt(cfx,cfy))&&solid(tileAt(cfx,cfy-1));
    if(!tgt&&p.ground&&wallLow){ wantJump=true; hold=0.5; }
    if(!tgt&&p.ground&&wallHigh){
      if(Math.abs(p.vx)<240&&AIB.cool<=0){ AIB.mode="backoff"; AIB.modeT=AIB.fails>0?0.85:0.6; AIB.cool=1.4; }
      else if(Math.abs(p.vx)>=240&&(gapEdge<0||gapEdge>60)){ wantJump=true; hold=0.62; }
    }
    /* —— 头顶?/砖块:对齐后跳起顶(主动吃奶/铃铛/星星/金币) —— */
    if(!tgt&&p.ground&&!wantJump&&(gapEdge<0||gapEdge>90)){
      var bRow=cfy-3;
      for(var hc=cfx;hc>=cfx-1;hc--){
        var hv=tileAt(hc,bRow);
        var blw=tileAt(hc,bRow+1);
        if(hv>=3&&hv<=7&&!solid(blw)&&blw!==13&&blw!==14){
          var bx2=hc*T+T/2;
          if(Math.abs(bx2-px)<24){ wantJump=true; hold=0.32; }
          else if(bx2>px){ keys.right=true; keys.left=false; }
          else { keys.right=false; keys.left=true; }
          break;
        }
      }
    }
    /* 空中救援:前方没落点就往回拉 */
    if(!p.ground&&p.vy>150){
      var aheadOK=groundBelow(Math.floor((px+40)/T),Math.floor((p.y+p.h)/T))>=0;
      if(!aheadOK){
        var behindOK=groundBelow(Math.floor((px-40)/T),Math.floor((p.y+p.h)/T))>=0;
        keys.right=false; keys.left=behindOK;
      }
    }
    /* 敌人 → 跳踩 */
    if(!(tgt&&bd<140)){
      for(var i=0;i<ents.length;i++){ var e=ents[i];
        if(e.dead||e.gone||e.k==="move"||e.k==="bird") continue;
        var dx=e.x+e.w/2-px, dy=e.y+e.h-feet;
        if(dx>-6&&dx<128&&dy>-84&&dy<44){ wantJump=true; hold=0.4; }
      }
    }
    /* 火球 → 跳避 */
    for(var f=0;f<fires.length;f++){ var ff=fires[f];
      var fdx=ff.x-px, fdy=ff.y-(p.y+18);
      if(Math.abs(fdy)<54&&Math.abs(fdx)<160&&((fdx>0&&ff.vx<0)||(fdx<0&&ff.vx>0))){ wantJump=true; hold=0.4; }
    }
    /* 尖刺/岩浆 */
    var h1=tileAt(Math.floor((px+34)/T),Math.floor((feet+6)/T));
    if(h1===10||h1===11){ wantJump=true; hold=0.5; }
    /* Boss 战:贴身顺方向跳过冲刺,不背向逃跑(防止退进岩浆自杀) */
    if(GS.boss&&!GS.boss.dead&&GS.state==="play"){
      var b=GS.boss, bx=b.x+b.w/2;
      if(b.state==="stun"){
        keys.right=bx>px+10; keys.left=bx<px-10;
        if(Math.abs(bx-px)<95&&p.ground){ wantJump=true; hold=0.62; }
      } else if(b.state==="dash"){
        keys.right=b.vx>0; keys.left=b.vx<0; /* 顺着冲撞方向跳过它头顶 */
        if(Math.abs(bx-px)<270&&p.ground){ wantJump=true; hold=0.62; }
      } else if(b.state==="warn"){
        keys.right=bx<px; keys.left=bx>px;
        if(Math.abs(bx-px)<300&&p.ground){ wantJump=true; hold=0.4; }
      } else if(b.state==="throw"){
        keys.right=false; keys.left=false;
        if(p.ground&&fires.length>0){ wantJump=true; hold=0.4; }
      } else {
        keys.right=bx>px+170; keys.left=bx<px-170;
      }
      /* 竞技场边界:左边岩浆右边墙,不许出界 */
      if(px<34*T){ keys.left=false; keys.right=true; }
      if(px>93*T){ keys.right=false; keys.left=true; }
    }
    /* 到旗子前停(自然触发过关) */
    if(curLV.flagX>0&&px>curLV.flagX*T-26){ keys.right=false; keys.left=false; }
    /* 卡死检测:交替 跳/后撤助跑 */
    if(Math.abs(p.x-AIB.lastX)<6){ AIB.stuckT+=dt; } else { AIB.stuckT=0; AIB.lastX=p.x; }
    if(AIB.stuckT>1.0&&p.ground){
      AIB.fails++; AIB.stuckT=0;
      if(AIB.fails%2===0||AIB.fails>=3){ AIB.mode="backoff"; AIB.modeT=AIB.fails>=3?1.0:0.6; } /* 连续失败:越退越远助跑 */
      else { wantJump=true; hold=0.62; }
    }
    if(AIB.fails>0&&p.ground&&!wallHigh&&Math.abs(p.vx)>240){ AIB.fails=0; }
  }
  /* 冷却0.5s:防止土狼时间内空中二段跳(连跳bug) */
  if(wantJump&&p.ground&&AIB.cool<=0){ justPressed.jump=true; AIB.cool=0.5; AIB.jH=hold; }
  if(AIB.jH>0){ AIB.jH-=dt; keys.jump=true; } else keys.jump=false;
}

/* ============ 更新 ============ */
function update(dt){
  GT+=dt;
  if(freeze>0){ updateFX(dt); return; }
  if(GS.auto&&(GS.state==="play")) aiControl(dt);
  if(GS.state==="play"&&GS.auto){ GS.hollerT=(GS.hollerT||0)-dt; if(GS.hollerT<=0){ niuHoller(NIUSAY[(Math.random()*NIUSAY.length)|0]); GS.hollerT=5.5+Math.random()*5; } }
  if(GS.state==="play"){ updatePlayer(dt); updateBoss(dt); updateFires(dt); }
  else if(GS.state==="bossintro"){
    GS.bossIntro-=dt;
    PL.vy+=1500*dt; PL.y+=Math.min(PL.vy*dt,18);
    var ty=Math.floor((PL.y+PL.h)/T),tx0=Math.floor((PL.x+4)/T),tx1=Math.floor((PL.x+PL.w-4)/T);
    for(var tx=tx0;tx<=tx1;tx++){ if(solid(tileAt(tx,ty))){ PL.y=ty*T-PL.h-0.01; PL.vy=0; break; } }
    if(GS.bossIntro<=0){ GS.state="play"; GS.bossActive=true; }
  }
  else if(GS.state==="dead"){ handleDead(dt); }
  else if(GS.state==="clear"){ handleClear(dt); }
  else if(GS.state==="winseq"){ handleWinseq(dt); }
  if(GS.state==="play"||GS.state==="clear"){
    camX=clamp(lerp(camX,PL.x-W*0.42,1-Math.pow(0.002,dt)),0,curLV.w*T-W);
  }
  updateFX(dt);
  if(GS.state==="title"||GS.state==="select"||GS.state==="gameover"||GS.state==="win"){
    if(Math.random()<0.02) part({x:rnd(-100,1060),y:rnd(-200,-40),vx:rnd(-10,10),vy:rnd(40,90),g:0,life:6,t:0,type:"fir",size:rnd(2,4),col:"rgba(255,255,255,0.8)"});
    if(GS.state==="title"||GS.state==="select"||GS.state==="win") camX+=dt*30;
  }
}

/* ==================== THREE.JS 3D ==================== */
var THREE_OK=false, scene=null, camera=null, renderer=null;
var statics=null;
var mCalf=null, mBoss=null;
/* 牛来模式:霸屏喊话(妈妈梗) */
var NIUSAY=["妈妈——!!","娘——!!","俺是牛来!!","哞——!!","牛来了,快跑!!","妈妈救我!!","给老子闪开!!","牛来·宇宙无敌!!","吃我一角!!","母亲大人,俺来啦!!","莫怕,娘在!!","牛来驾到,妈妈快看!!"];
function niuHoller(txt){
  GS.holler=txt; GS.hollerT=2.6;
  popText(PL.x+14,PL.y-84,txt,"#ff5ad4");
}
var meshPool=[];
if(typeof THREE!=="undefined"){
  try{
    renderer=new THREE.WebGLRenderer({canvas:cv3d,alpha:true,antialias:true});
    renderer.setSize(W,H);
    renderer.setClearColor(0x000000,0);
    renderer.shadowMap.enabled=true;
    renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    scene=new THREE.Scene();
    camera=new THREE.PerspectiveCamera(50,W/H,0.1,300);
    scene.add(new THREE.AmbientLight(0xffffff,0.62));
    var sun=new THREE.DirectionalLight(0xffe9c0,0.95);
    sun.position.set(6,14,10);
    sun.castShadow=true;
    sun.shadow.mapSize.set(1024,1024);
    sun.shadow.camera.left=-40; sun.shadow.camera.right=40;
    sun.shadow.camera.top=22; sun.shadow.camera.bottom=-22;
    sun.shadow.camera.far=80;
    scene.add(sun);
    var fill=new THREE.DirectionalLight(0x88bbff,0.25); fill.position.set(-8,6,-4); scene.add(fill);
    THREE_OK=true;
  }catch(e){ THREE_OK=false; }
}

/* ---------- 材质 ---------- */
function lam(color,extra){
  var m=new THREE.MeshLambertMaterial({color:color}); return m;
}
function clay(geo,amt){
  if(!geo.attributes||!geo.attributes.position) return geo;
  var p=geo.attributes.position;
  for(var i=0;i<p.count;i++){
    var x=p.getX(i),y=p.getY(i),z=p.getZ(i);
    var h=hash(x*3.7+y*7.3+z*11.1);
    var h2=hash(x*5.1+z*9.7+y*2.3);
    var h3=hash(y*8.4+x*1.9+z*4.2);
    p.setXYZ(i,x+(h-0.5)*amt,y+(h2-0.5)*amt,z+(h3-0.5)*amt);
  }
  geo.computeVertexNormals();
  return geo;
}
function box(w,h,d,color,amt){
  var g=new THREE.BoxGeometry(w,h,d);
  if(amt) clay(g,amt);
  var m=new THREE.Mesh(g,new THREE.MeshLambertMaterial({color:color}));
  m.castShadow=true; m.receiveShadow=true;
  return m;
}
function ball(r,color,wseg,hseg){
  var g=new THREE.SphereGeometry(r,wseg||10,hseg||8);
  var m=new THREE.Mesh(g,new THREE.MeshLambertMaterial({color:color}));
  m.castShadow=true;
  return m;
}
function cyl(r1,r2,h,color,seg){
  var g=new THREE.CylinderGeometry(r1,r2,h,seg||10);
  var m=new THREE.Mesh(g,new THREE.MeshLambertMaterial({color:color}));
  m.castShadow=true;
  return m;
}
function goldM(){ return new THREE.MeshLambertMaterial({color:0xffd23f,emissive:0x664400}); }
function makeTextSprite(txt,size,col){
  var c=document.createElement("canvas"); c.width=256;c.height=128;
  var g=c.getContext("2d");
  g.font="bold 90px "+FONT; g.textAlign="center"; g.textBaseline="middle";
  g.strokeStyle="#5a3a00"; g.lineWidth=10; g.strokeText(txt,128,64);
  g.fillStyle=col||"#fff"; g.fillText(txt,128,64);
  var tex=new THREE.CanvasTexture(c);
  var sp=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true}));
  sp.scale.set(size*2,size,1);
  return sp;
}

/* ==================== 建模:牛来(严格按 1.png) ====================
   芥末黄杂毛胖梨身 · 蓝色弯角 · 灰紫大口鼻厚唇
   下垂倦眼+浓眉 · 白手套 · 灰紫脚 · 人形直立站姿 */
function buildCalf(){
  var g=new THREE.Group();
  var fur=0xc9a24e, furD=0xa8843a, furL=0xd9bc72, snout=0x9d92ab, snoutD=0x837796, glove=0xdedbd4, foot=0x9d92ab, hornC=0x3f74e0, hornD=0x2a4fa8;
  /* —— 身体:梨形胖躯干(上窄下宽) —— */
  var body=ball(0.78,fur,14,12); body.scale.set(1.02,1.16,0.94); body.position.y=1.02; clay(body.geometry,0.06); g.add(body);
  var belly=ball(0.58,furL,11,9); belly.scale.set(0.88,0.98,0.8); belly.position.set(0.03,0.88,0.16); g.add(belly);
  /* 杂色毛斑 */
  for(var sp=0;sp<10;sp++){
    var dot=ball(0.09,furD,5,4);
    var a=hash(sp*3.7)*TAU, ty=0.4+hash(sp+61)*1.2;
    dot.position.set(Math.cos(a)*0.52,ty,Math.sin(a)*0.46);
    dot.scale.setScalar(0.6+hash(sp+9)*0.8);
    g.add(dot);
  }
  /* —— 头:宽扁圆,略埋进肩膀(短颈毛绒感) —— */
  var head=new THREE.Group(); head.position.set(0,1.95,0);
  var skull=ball(0.58,fur,14,12); skull.scale.set(1.14,0.92,1.0); clay(skull.geometry,0.05); head.add(skull);
  var cheekL=ball(0.2,fur,7,5); cheekL.position.set(0.28,-0.14,0.32); head.add(cheekL);
  var cheekR=cheekL.clone(); cheekR.position.z=-0.32; head.add(cheekR);
  /* —— 灰紫大口鼻 + 前突厚唇(面无表情撅嘴) —— */
  var muzzle=ball(0.3,snout,11,9); muzzle.scale.set(0.78,0.74,1.5); muzzle.position.set(0.42,-0.16,0); clay(muzzle.geometry,0.04); head.add(muzzle);
  var lipU=ball(0.24,snoutD,9,7); lipU.scale.set(0.82,0.42,1.48); lipU.position.set(0.5,-0.26,0); head.add(lipU);
  var lipL=ball(0.2,snoutD,9,7); lipL.scale.set(0.76,0.36,1.32); lipL.position.set(0.48,-0.42,0); head.add(lipL);
  var n1=ball(0.045,0x5a5068,6,4); n1.position.set(0.64,-0.12,0.12); head.add(n1);
  var n2=n1.clone(); n2.position.z=-0.12; head.add(n2);
  /* —— 下垂倦眼:厚上眼皮压眼 + 直视深色瞳 —— */
  function eye(side){
    var eg=new THREE.Group();
    var w=ball(0.15,0xf2ede6,10,8); eg.add(w);
    var pu=ball(0.062,0x2a2018,8,6); pu.position.set(0.09,0,side*0.1); eg.add(pu);
    var gl=ball(0.02,0xffffff,5,4); gl.position.set(0.12,0.04,side*0.12); eg.add(gl);
    var lid=ball(0.155,fur,10,8); lid.scale.set(1.02,0.62,1.04); lid.position.set(-0.01,0.075,0); eg.add(lid);
    return eg;
  }
  var e1=eye(1); e1.position.set(0.34,0.14,0.26); head.add(e1);
  var e2=eye(-1); e2.position.set(0.34,0.14,-0.26); head.add(e2);
  /* 浓眉(微微皱) */
  var browL=box(0.26,0.06,0.06,0x4a3a20,0.01); browL.position.set(0.36,0.32,0.26); browL.rotation.z=-0.18; head.add(browL);
  var browR=browL.clone(); browR.position.z=-0.26; browR.rotation.z=0.18; head.add(browR);
  /* —— 蓝色弯角:向外再向上弯 —— */
  function horn(side){
    var hg=new THREE.Group();
    var seg1=cyl(0.11,0.14,0.3,hornC,9); seg1.position.set(0.02,0.14,0); hg.add(seg1);
    var seg2=cyl(0.08,0.11,0.3,hornC,9); seg2.position.set(0.12,0.38,0); seg2.rotation.z=-0.5; hg.add(seg2);
    var seg3=cyl(0.04,0.08,0.26,hornD,8); seg3.position.set(0.28,0.54,0); seg3.rotation.z=-1.05; hg.add(seg3);
    hg.position.set(-0.06,0.42,side*0.4);
    hg.rotation.x=side*0.1;
    return hg;
  }
  head.add(horn(1)); head.add(horn(-1));
  /* —— 侧耳 —— */
  var ear1=ball(0.16,fur,8,6); ear1.scale.set(0.4,0.75,1.4); ear1.position.set(-0.12,0.22,0.58); ear1.rotation.z=0.2; head.add(ear1);
  var ear2=ear1.clone(); ear2.position.z=-0.58; ear2.rotation.z=-0.2; head.add(ear2);
  g.add(head);
  g.userData.head=head;
  /* —— 短腿 + 灰紫脚 —— */
  var legs=[];
  for(var li=0;li<2;li++){
    var lg=new THREE.Group();
    var thigh=cyl(0.2,0.22,0.44,fur,9); thigh.position.y=-0.2; lg.add(thigh);
    var footM=box(0.34,0.2,0.36,foot,0.03); footM.position.y=-0.52; lg.add(footM);
    lg.position.set(li===0?0.24:-0.2,0.62,0);
    g.add(lg); legs.push(lg);
  }
  g.userData.legs=legs;
  /* —— 胖胳膊 + 白手套 —— */
  var arms=[];
  for(var ai=0;ai<2;ai++){
    var ag=new THREE.Group();
    var upper=cyl(0.15,0.17,0.42,fur,8); upper.position.y=-0.18; ag.add(upper);
    var glv=ball(0.17,glove,9,7); glv.scale.set(1,0.92,1); glv.position.y=-0.5; ag.add(glv);
    ag.position.set(ai===0?0.5:0.02,1.28,ai===0?0.38:-0.38);
    ag.rotation.z=ai===0?0.24:-0.24;
    g.add(ag); arms.push(ag);
  }
  g.userData.arms=arms;
  /* —— 小尾巴 —— */
  var tail=box(0.08,0.34,0.08,furD,0.04); tail.position.set(-0.68,1.0,0); tail.rotation.z=0.75;
  g.add(tail); g.userData.tail=tail;
  var tuftTail=ball(0.12,furD,6,5); tuftTail.position.set(-0.76,0.82,0); g.add(tuftTail);
  return g;
}

/* ==================== 建模:敌人 ==================== */
function buildWolf(){
  var g=new THREE.Group();
  var bodyC=0x70767c, darkC=0x555b61;
  var body=ball(0.42,bodyC,10,8); body.scale.set(1.35,0.95,1.0); body.position.y=0.45; g.add(body);
  var head=new THREE.Group(); head.position.set(0.55,0.6,0);
  var skull=box(0.42,0.4,0.38,darkC,0.04); head.add(skull);
  var snout=box(0.24,0.2,0.24,0x8a8f96,0.03); snout.position.set(0.28,-0.06,0); head.add(snout);
  var ear1=cyl(0.01,0.08,0.2,0x3a3f45,5); ear1.position.set(-0.02,0.32,0.14); head.add(ear1);
  var ear2=ear1.clone(); ear2.position.z=-0.14; head.add(ear2);
  var eye1=ball(0.06,0xffd23f,6,5); eye1.position.set(0.22,0.12,0.16); head.add(eye1);
  var eye2=eye1.clone(); eye2.position.z=-0.16; head.add(eye2);
  g.add(head); g.userData.head=head;
  var legs=[];
  for(var i=0;i<4;i++){
    var lg=box(0.14,0.3,0.14,darkC,0.03);
    lg.position.set(i<2?0.32:-0.3,0.16,0.16);
    g.add(lg); legs.push(lg);
  }
  legs[0].position.z=0.16; legs[1].position.z=-0.16; legs[2].position.z=0.16; legs[3].position.z=-0.16;
  g.userData.legs=legs;
  g.userData.tail=box(0.06,0.26,0.06,0x3a3f45,0.03);
  g.userData.tail.position.set(-0.6,0.55,0); g.add(g.userData.tail);
  return g;
}
function buildLeopard(){
  var g=new THREE.Group();
  var bodyC=0xf0a93b, darkC=0x8a5a1e;
  var body=ball(0.4,bodyC,10,8); body.scale.set(1.5,0.85,0.95); body.position.y=0.45; g.add(body);
  for(var i=0;i<6;i++){
    var dot=ball(0.055,darkC,5,4);
    var a=i*1.1;
    dot.position.set(Math.cos(a)*0.5,-0.1+Math.sin(a*2)*0.2,Math.sin(a)*0.38);
    g.add(dot);
  }
  var head=new THREE.Group(); head.position.set(0.6,0.62,0);
  var skull=box(0.36,0.34,0.34,bodyC,0.04); head.add(skull);
  var snout=box(0.2,0.16,0.2,0xffe0b0,0.03); snout.position.set(0.24,-0.05,0); head.add(snout);
  var ear1=cyl(0.01,0.07,0.16,0xb5762a,5); ear1.position.set(0,0.26,0.12); head.add(ear1);
  var ear2=ear1.clone(); ear2.position.z=-0.12; head.add(ear2);
  var eye1=ball(0.055,0x2a5a1a,6,5); eye1.position.set(0.2,0.1,0.13); head.add(eye1);
  var eye2=eye1.clone(); eye2.position.z=-0.13; head.add(eye2);
  g.add(head); g.userData.head=head;
  g.userData.legs=[];
  for(var j=0;j<4;j++){
    var lg2=box(0.13,0.28,0.13,darkC,0.03);
    lg2.position.set(j<2?0.34:-0.28,0.15,j<2?0.14:-0.14);
    g.add(lg2); g.userData.legs.push(lg2);
  }
  var tail=box(0.05,0.4,0.05,darkC,0.03); tail.position.set(-0.68,0.5,0); tail.rotation.z=2.2; g.add(tail);
  return g;
}
function buildRaven(){
  var g=new THREE.Group();
  var body=ball(0.28,0x2a2a30,10,7); body.scale.set(1.3,0.9,0.9); g.add(body);
  var head=ball(0.18,0x2a2a30,8,6); head.position.set(0.24,0.2,0); g.add(head);
  var beak=cyl(0.01,0.05,0.16,0xf0a832,5); beak.rotation.z=-Math.PI/2; beak.position.set(0.44,0.18,0); g.add(beak);
  var eye=ball(0.04,0xffd23f,5,4); eye.position.set(0.32,0.26,0.1); g.add(eye);
  var eye2=eye.clone(); eye2.position.z=-0.1; g.add(eye2);
  var wingL=box(0.5,0.1,0.36,0x1a1a20,0.02); wingL.position.set(-0.1,0.1,0.24); g.add(wingL);
  var wingR=wingL.clone(); wingR.position.z=-0.24; g.add(wingR);
  g.userData.wingL=wingL; g.userData.wingR=wingR;
  return g;
}
function buildBird(){
  var g=new THREE.Group();
  var body=ball(0.22,0xffffff,9,7); body.scale.set(1.25,0.9,0.95); g.add(body);
  var head=ball(0.15,0xffffff,8,6); head.position.set(0.16,0.2,0); g.add(head);
  var beak=cyl(0.01,0.04,0.12,0xf0a832,5); beak.rotation.z=-Math.PI/2; beak.position.set(0.33,0.18,0); g.add(beak);
  var eye1=ball(0.035,0x1a1a1a,5,4); eye1.position.set(0.24,0.26,0.08); g.add(eye1);
  var eye2=eye1.clone(); eye2.position.z=-0.08; g.add(eye2);
  var wingL=box(0.4,0.08,0.28,0xe8eef5,0.02); wingL.position.set(-0.05,0.06,0.2); g.add(wingL);
  var wingR=wingL.clone(); wingR.position.z=-0.2; g.add(wingR);
  g.userData.wingL=wingL; g.userData.wingR=wingR;
  return g;
}

/* ==================== 建模:牛模王 ====================
   Ox Alpha 模型成精:暗黑版巨型牛来
   发光红眼 · 悬浮算力方块环 · 二阶段过载红光 */
function buildBoss(){
  var g=new THREE.Group();
  /* —— 达里奥·A (Dario-A 谐音版 CEO 建模):一眼看得出:金边眼镜+西装+灰发+胡茬 —— */
  /* 身体:深蓝西装 */
  var torso=box(1.4,1.5,0.8,0x1c2a4a); torso.position.y=1.7; torso.castShadow=true; g.add(torso);
  var lapel=box(0.72,1.52,0.1,0x16203c); lapel.position.set(0,1.7,0.43); g.add(lapel);
  var shirt=box(0.5,0.9,0.08,0xf0f2f6); shirt.position.set(0,1.9,0.5); g.add(shirt);
  var tie=box(0.18,0.95,0.07,0x8a2030); tie.position.set(0,1.75,0.56); g.add(tie);
  /* 肩膀 */
  var shL=box(0.5,0.5,0.66,0x1c2a4a); shL.position.set(-0.95,2.35,0); g.add(shL);
  var shR=box(0.5,0.5,0.66,0x1c2a4a); shR.position.set(0.95,2.35,0); g.add(shR);
  /* 手臂:一手指着你,一手抱公文箱(书呆子 AI CEO) */
  var armL=box(0.34,1.1,0.34,0x1c2a4a); armL.position.set(-1.02,1.35,0.05); armL.rotation.x=-0.5; g.add(armL);
  var handL=ball(0.17,0xd8a078,7,5); handL.position.set(-1.22,1.75,0.42); g.add(handL);
  var armR=box(0.34,1.0,0.34,0x1c2a4a); armR.position.set(1.02,1.5,0.15); armR.rotation.x=0.3; g.add(armR);
  var handR=ball(0.17,0xd8a078,7,5); handR.position.set(1.1,1.0,0.42); g.add(handR);
  /* 公文箱(书呆子标识) */
  var brief=box(0.7,0.5,0.28,0x4a3a2a); brief.position.set(1.1,0.72,0.42); g.add(brief);
  var briefH=box(0.1,0.14,0.08,0x6a5540); briefH.position.set(1.1,1.02,0.42); g.add(briefH);
  /* 头:灰发+眼镜+胡茬 */
  var head=new THREE.Group(); head.position.y=3.05; g.add(head);
  var skull=box(0.86,0.94,0.8,0xe8c8a8); skull.position.y=-0.15; skull.castShadow=true; head.add(skull);
  /* 灰发(向后梳+重点额头) */
  var hair=box(0.9,0.34,0.84,0xb8b4ac); hair.position.set(0,0.34,-0.04); head.add(hair);
  var hairT=box(0.92,0.12,0.4,0xb8b4ac); hairT.position.set(0,0.12,-0.35); head.add(hairT);
  /* 额头 : Dario 显眼的前额 */
  var brow=box(0.6,0.1,0.05,0xc8a888); brow.position.set(0,0.16,0.41); head.add(brow);
  /* 金边眼镜:招牌 */
  var lensL=box(0.26,0.2,0.04,0xcfe4f2); lensL.position.set(-0.2,-0.02,0.43); head.add(lensL);
  var lensR=box(0.26,0.2,0.04,0xcfe4f2); lensR.position.set(0.2,-0.02,0.43); head.add(lensR);
  var frame=box(0.7,0.045,0.045,0xd8b540); frame.position.set(0,-0.02,0.44); head.add(frame);
  var brL=box(0.045,0.3,0.045,0xd8b540); brL.position.set(-0.34,-0.02,0.44); head.add(brL);
  var brR=box(0.045,0.3,0.045,0xd8b540); brR.position.set(0.34,-0.02,0.44); head.add(brR);
  /* 柔和眼睛(眼镜里) */
  var eyeL=ball(0.05,0x2a2a2a,6,4); eyeL.position.set(-0.2,-0.02,0.46); head.add(eyeL);
  var eyeR=ball(0.05,0x2a2a2a,6,4); eyeR.position.set(0.2,-0.02,0.46); head.add(eyeR);
  /* 嘴+络腮胡茬 */
  var mouth=box(0.4,0.06,0.04,0x9a6a52); mouth.position.set(0,-0.42,0.42); head.add(mouth);
  var beard=box(0.7,0.22,0.06,0xa8a29a); beard.position.set(0,-0.33,0.43); beard.opacity=1; head.add(beard);
  var jaw=box(0.8,0.18,0.1,0xd8c0a0); jaw.position.set(0,-0.6,0.24); head.add(jaw);
  g.userData.head=head;
  /* 手臂保存给动画 */
  g.userData.arms=[armL,armR];
  /* 招牌:BOSS 胸牌(写 A 不写真名) */
  var badge=box(0.16,0.22,0.05,0xa89a7c); badge.position.set(-0.28,2.1,0.48); g.add(badge);
  var bdt=makeTextSprite("Dario",0.3,"#3a2a10"); bdt.position.set(0,2.12,0.58); bdt.userData.keepGlow=true; g.add(bdt);
  /* 算力方块环(升级:一圈浮动的A/G式 AI 芯片) */
  var orbit=new THREE.Group();
  for(var i=0;i<8;i++){
    var cb=box(0.14,0.14,0.2,0x3a5a8a,0.01);
    cb.material=new THREE.MeshLambertMaterial({color:0x3a5a8a,emissive:0x1a3a6a,emissiveIntensity:0.9});
    var a=i/8*TAU;
    cb.position.set(Math.cos(a)*1.25,0,Math.sin(a)*1.25);
    cb.userData.keepGlow=true;
    cb.rotation.y=a;
    orbit.add(cb);
  }
  orbit.position.y=2.9;
  g.add(orbit);
  g.userData.orbit=orbit;
  return g;
}
function buildItem3D(k){
  var g=new THREE.Group();
  if(k==="milk"){
    var b=cyl(0.2,0.2,0.5,0xffffff,12); b.position.y=0.22; g.add(b);
    var bTop=cyl(0.13,0.18,0.12,0xf0f0f4,10); bTop.position.y=0.52; g.add(bTop);
    var cap=cyl(0.13,0.13,0.1,0xe03a3a,9); cap.position.y=0.62; g.add(cap);
    var lbl=makeTextSprite("奶",0.5,"#4a7adf"); lbl.position.set(0,0.26,0.22); g.add(lbl);
    var shine=box(0.06,0.34,0.03,0xdfe8f5,0); shine.position.set(0.13,0.3,0.16); g.add(shine);
  } else if(k==="star"){
    var star=new THREE.Mesh(new THREE.OctahedronGeometry(0.4),goldM());
    star.position.y=0.4; star.castShadow=true; g.add(star);
    var halo=cyl(0.55,0.55,0.03,goldM(),14); halo.position.y=0.4; halo.rotation.x=Math.PI/2; g.add(halo);
  } else if(k==="bell"){
    var bell=cyl(0.03,0.3,0.36,0xf4b840,12); bell.position.y=0.3; g.add(bell);
    var handle=cyl(0.05,0.05,0.12,0xf4b840,7); handle.position.y=0.54; g.add(handle);
    var knob=ball(0.09,0xf4b840,7,5); knob.position.y=0.1; g.add(knob);
  }
  return g;
}

/* ==================== 3D 世界构建 ==================== */
var dynGroup=(typeof THREE!=="undefined"&&scene)?new THREE.Group():null;
if(dynGroup) scene.add(dynGroup);
var worldBlocks={};
var instBox=null, instGrass=null, instSpike=null, instLava=null;
var instMatLava=null;
var qLabelSprites=[];
var pMax=420;
var pGeo=(typeof THREE!=="undefined")?new THREE.BufferGeometry():null;
var pPos=new Float32Array(pMax*3), pCol=new Float32Array(pMax*3);
var pMat=null,pPoints=null;
if(pGeo&&scene){ pGeo.setAttribute("position",new THREE.BufferAttribute(pPos,3));
pGeo.setAttribute("color",new THREE.BufferAttribute(pCol,3));
pMat=new THREE.PointsMaterial({size:0.22,vertexColors:true,transparent:true,opacity:0.95,depthWrite:false,sizeAttenuation:true});
pPoints=new THREE.Points(pGeo,pMat); pPoints.frustumCulled=false;
scene.add(pPoints); }
var colCache={};
function ccol(h){ if(!colCache[h]) colCache[h]=new THREE.Color(h); return colCache[h]; }
var textPool=[]; var TEXTPOOL=18;
var ringMeshes=[];
var THEME3=[
  {dirt:0x8a5a2b,grass:0x59c14d,brick:0xc9793f,solid:0x6b5648,q:0xffc63f,plat:0xc98a4a,lava:0xff6a1f,spike:0x9aa0a8,"deco":"tree"},
  {dirt:0xd9a45c,grass:0xefc06e,brick:0xc9793f,solid:0x8f6a3f,q:0xffc63f,plat:0xb98a4a,lava:0xff6a1f,spike:0xc4b48f,"deco":"cactus"},
  {dirt:0x9fc4dd,grass:0xffffff,brick:0x9db8d8,solid:0x7090ac,q:0xffc63f,plat:0xa8c4e0,lava:0xff6a1f,spike:0xd0e0ee,"deco":"pine"},
  {dirt:0x4a3030,grass:0x5a4040,brick:0x6a4040,solid:0x3a2a2a,q:0xffc63f,plat:0x5a5040,lava:0xff6a1f,spike:0x8f9098,"deco":"rock"},
  {dirt:0x5a5a62,grass:0x8a8a94,brick:0x6a6a72,solid:0x4a4a52,q:0xffc63f,plat:0x7a7a84,lava:0xff6a1f,spike:0x9aa0a8,"deco":"rock"}
];
function disposeGroup(g){ if(!g) return;
  var arr=[];
  g.traverse(function(o){ arr.push(o); });
  for(var i=0;i<arr.length;i++){ var o=arr[i];
    if(o.geometry&&o.geometry.dispose) o.geometry.dispose();
    if(o.material&&o.material.dispose){ o.material.dispose(); }
  }
  g.clear(); if(g.parent) g.parent.remove(g);
}
function clearDyn(){
  disposeGroup(dynGroup);
  dynGroup=new THREE.Group(); scene.add(dynGroup);
  worldBlocks={}; qLabelSprites=[]; ringMeshes=[]; textPool=[];
}
function worldY(py){ return (H-py)*S; }
function worldX(px){ return px*S; }
function tileCenter(tx,ty){ return [worldX(tx*T+T/2),worldY(ty*T+T/2)]; }
function buildTitle3D(){
  clearDyn();
  /* 月球表面(海报场景) */
  var ground=box(60,3.2,7,0x8a8a90);
  ground.position.set(0,-1.6,0); ground.receiveShadow=true;
  dynGroup.add(ground);
  var rego=box(60,0.5,7.02,0x9a9aa0);
  rego.position.set(0,0.18,0); dynGroup.add(rego);
  for(var i=0;i<8;i++){
    var rk=ball(rnd(0.2,0.6),0x7a7a80,6,5);
    rk.position.set(rnd(-14,14),0.3,rnd(-2.5,2.5));
    dynGroup.add(rk);
  }
  /* 牛来站在月球上 */
  mCalf=buildCalf(); mCalf.position.set(-5.5,0.45,1.6); mCalf.scale.setScalar(3.1); mCalf.rotation.y=0.5; dynGroup.add(mCalf);
  /* 黑旗+牛头骨(海报同款) */
  var pole=cyl(0.09,0.09,9,0xc4c9cf,8); pole.position.set(3.5,4.5,0); dynGroup.add(pole);
  var flagC=document.createElement("canvas"); flagC.width=256; flagC.height=160;
  var fg=flagC.getContext("2d");
  fg.fillStyle="#111114"; fg.fillRect(0,0,256,160);
  fg.strokeStyle="#2a2a30"; fg.lineWidth=4; fg.strokeRect(2,2,252,156);
  fg.fillStyle="#e8e8ec";
  fg.beginPath(); fg.arc(128,78,34,0,TAU); fg.fill();
  fg.fillStyle="#111114";
  fg.beginPath(); fg.ellipse(112,70,7,10,0,0,TAU); fg.fill();
  fg.beginPath(); fg.ellipse(144,70,7,10,0,0,TAU); fg.fill();
  fg.beginPath(); fg.moveTo(128,84); fg.lineTo(122,104); fg.lineTo(134,104); fg.closePath(); fg.fill();
  fg.strokeStyle="#e8e8ec"; fg.lineWidth=9; fg.lineCap="round";
  fg.beginPath(); fg.moveTo(100,52); fg.quadraticCurveTo(84,30,66,26); fg.stroke();
  fg.beginPath(); fg.moveTo(156,52); fg.quadraticCurveTo(172,30,190,26); fg.stroke();
  var flagTex=new THREE.CanvasTexture(flagC);
  var flagM=new THREE.Mesh(new THREE.PlaneGeometry(3.6,2.25),new THREE.MeshLambertMaterial({map:flagTex,side:THREE.DoubleSide}));
  flagM.position.set(5.45,7.9,0); dynGroup.add(flagM);
  GS.__titleFlag=flagM;
}
function buildDecor3D(tt,idx,seed,hgt){
  var x=wx(idx*T)+rnd(-6,6);
  if(hgt===undefined) hgt=worldY(12*T);
  var deco=tt.deco;
  var BZ=-5;
  var sc=rnd(0.85,1.25);
  if(deco==="tree"){
    var trunk=cyl(0.12,0.2,1.3,0x7a4a22,7); trunk.position.set(x,hgt+0.65,BZ); trunk.scale.setScalar(sc); dynGroup.add(trunk);
    var leaf1=ball(1.15,0x3f9a3f,9,7); leaf1.position.set(x,hgt+1.8,BZ); leaf1.scale.setScalar(sc); dynGroup.add(leaf1);
    var leaf2=ball(0.9,0x4fb04f,8,6); leaf2.position.set(x+0.35,hgt+2.5,BZ); leaf2.scale.setScalar(sc); dynGroup.add(leaf2);
    var leaf3=ball(0.62,0x57c25e,7,5); leaf3.position.set(x-0.3,hgt+2.2,BZ); leaf3.scale.setScalar(sc); dynGroup.add(leaf3);
  } else if(deco==="cactus"){
    var cc=cyl(0.4,0.5,2.2,0x3f9a4f,8); cc.position.set(x,hgt+1.1,BZ); cc.scale.setScalar(sc); dynGroup.add(cc);
    var arm=cyl(0.18,0.18,0.85,0x3f9a4f,6); arm.position.set(x+0.6,hgt+1.4,BZ); arm.rotation.z=-0.4; arm.scale.setScalar(sc); dynGroup.add(arm);
    var arm2=cyl(0.18,0.18,0.75,0x3f9a4f,6); arm2.position.set(x-0.55,hgt+1.2,BZ); arm2.rotation.z=0.4; arm2.scale.setScalar(sc); dynGroup.add(arm2);
  } else if(deco==="pine"){
    var tr=cyl(0.16,0.24,1.1,0x6a4a2a,7); tr.position.set(x,hgt+0.55,BZ); tr.scale.setScalar(sc); dynGroup.add(tr);
    var c1=ball(1.15,0x2f7a4a,9,7); c1.scale.set(sc*0.9,sc*1.5,sc*0.9); c1.position.set(x,hgt+1.5,BZ); dynGroup.add(c1);
    var c2=ball(0.8,0x3f8a5a,8,6); c2.scale.set(sc*0.8,sc*1.4,sc*0.8); c2.position.set(x,hgt+2.6,BZ); dynGroup.add(c2);
    var c3=ball(0.5,0x4f9a6a,7,5); c3.scale.set(sc*0.7,sc*1.3,sc*0.7); c3.position.set(x,hgt+3.5,BZ); dynGroup.add(c3);
  } else {
    var rk=ball(1.3,0x3a3030,8,6); rk.scale.set(sc*1.3,sc*0.9,sc); rk.position.set(x,hgt+0.6,BZ); dynGroup.add(rk);
  }
}
function buildWorld3D(){
  if(!THREE_OK) return;
  clearDyn();
  var tt=THEME3[curLV.theme];
  var i,j,spikeCount2=0;
  for(i=0;i<curLV.w*15;i++){ var c2=tiles[i]; if(c2===10) spikeCount2++; }
  var boxCount=0, grassCount=0;
  for(i=0;i<curLV.w*15;i++){ var c3=tiles[i];
    if(c3===1||c3===2||c3===3||c3===4||c3===5||c3===6||c3===7||c3===8||c3===9||c3===14) boxCount++;
    if(c3===1) grassCount++;
  }
  var texC=document.createElement("canvas"); texC.width=64; texC.height=64;
  var texG=texC.getContext("2d");
  texG.fillStyle="#ffffff"; texG.fillRect(0,0,64,64);
  texG.strokeStyle="rgba(0,0,0,0.30)"; texG.lineWidth=3;
  texG.strokeRect(1.5,1.5,61,61);
  texG.beginPath(); texG.moveTo(0,32); texG.lineTo(64,32); texG.moveTo(32,0); texG.lineTo(32,32); texG.moveTo(16,32); texG.lineTo(16,64); texG.moveTo(48,32); texG.lineTo(48,64); texG.stroke();
  var texB=new THREE.CanvasTexture(texC);
  texB.wrapS=texB.wrapT=THREE.RepeatWrapping;
  var matI=new THREE.MeshLambertMaterial({color:0xffffff,map:texB});
  var boxGeo=new THREE.BoxGeometry(3.2,3.2,2.6);
  instBox=new THREE.InstancedMesh(boxGeo,matI,Math.max(1,boxCount));
  instBox.castShadow=true; instBox.receiveShadow=true;
  var grGeo=new THREE.BoxGeometry(3.22,0.4,2.62);
  instGrass=new THREE.InstancedMesh(grGeo,new THREE.MeshLambertMaterial({color:0xffffff}),Math.max(1,grassCount));
  instGrass.receiveShadow=true;
  var spGeo=new THREE.ConeGeometry(1.1,2.2,4);
  instSpike=new THREE.InstancedMesh(spGeo,new THREE.MeshLambertMaterial({color:0xffffff}),Math.max(1,spikeCount2));
  instSpike.castShadow=true;
  var lavaCount=0;
  for(i=0;i<curLV.w*15;i++){ if(tiles[i]===11) lavaCount++; }
  instMatLava=new THREE.MeshLambertMaterial({color:0xff6a1f,emissive:0xff3300,emissiveIntensity:0.7});
  instLava=new THREE.InstancedMesh(new THREE.BoxGeometry(3.2,3.2,2.6),instMatLava,Math.max(1,lavaCount));
  var bi=0,gi=0,si=0,li=0;
  var m4=new THREE.Matrix4(), q4=new THREE.Quaternion(), v3=new THREE.Vector3(), s3=new THREE.Vector3();
  for(var ty=0;ty<15;ty++){
    for(var tx=0;tx<curLV.w;tx++){
      var c=tiles[ty*curLV.w+tx];
      var p=tileCenter(tx,ty);
      if(c===1){
        m4.compose(new THREE.Vector3(p[0],p[1],0),q4,new THREE.Vector3(1,1,1));
        instBox.setMatrixAt(bi,m4); instBox.setColorAt(bi,ccol(tt.dirt)); bi++;
        if(ty>0&&tiles[(ty-1)*curLV.w+tx]!==1){
          m4.compose(new THREE.Vector3(p[0],p[1]+1.72,0),q4,new THREE.Vector3(1,0.22,1));
          instGrass.setMatrixAt(gi,m4); instGrass.setColorAt(gi,ccol(tt.grass)); gi++;
        }
      } else if(c===2){
        m4.compose(new THREE.Vector3(p[0],p[1],0),q4,new THREE.Vector3(1,1,1));
        instBox.setMatrixAt(bi,m4); instBox.setColorAt(bi,ccol(tt.solid)); bi++;
      } else if(c===3){
        m4.compose(new THREE.Vector3(p[0],p[1],0),q4,new THREE.Vector3(1,1,1));
        instBox.setMatrixAt(bi,m4); instBox.setColorAt(bi,ccol(tt.brick)); worldBlocks[tx+","+ty]={kind:"brick",idx:bi}; bi++;
      } else if(c===4||c===5||c===6||c===7){
        m4.compose(new THREE.Vector3(p[0],p[1],0),q4,new THREE.Vector3(1,1,1));
        instBox.setMatrixAt(bi,m4); instBox.setColorAt(bi,ccol(tt.q));
        var lbl=makeTextSprite(c===4?"?":c===5?"奶":c===6?"★":"铃",1.3,"#fff");
        lbl.position.set(p[0],p[1]-0.3,1.45); lbl.userData.bx=tx; lbl.userData.by=ty;
        dynGroup.add(lbl); qLabelSprites.push(lbl);
        worldBlocks[tx+","+ty]={kind:"q",idx:bi,lbl:lbl};
        bi++;
      } else if(c===8){
        m4.compose(new THREE.Vector3(p[0],p[1],0),q4,new THREE.Vector3(1,1,1));
        instBox.setMatrixAt(bi,m4); instBox.setColorAt(bi,ccol(0x9a7a50)); worldBlocks[tx+","+ty]={kind:"used",idx:bi}; bi++;
      } else if(c===9){
        m4.compose(new THREE.Vector3(p[0],p[1]+1.12,0),q4,new THREE.Vector3(1,0.3,1));
        instBox.setMatrixAt(bi,m4); instBox.setColorAt(bi,ccol(tt.plat)); bi++;
      } else if(c===10){
        m4.compose(new THREE.Vector3(p[0],p[1]+2.6,0),q4,new THREE.Vector3(1,1,1));
        instSpike.setMatrixAt(si,m4); instSpike.setColorAt(si,ccol(tt.spike)); si++;
      } else if(c===11){
        m4.compose(new THREE.Vector3(p[0],p[1],0),q4,new THREE.Vector3(1,1,1));
        instLava.setMatrixAt(li,m4); li++;
      } else if(c===13||c===14){
        if(c===13){
          var pg=new THREE.Group();
          var rim=cyl(1.3,1.3,0.5,0x4aa03f,14); rim.position.y=-0.3; pg.add(rim);
          var rimTop=cyl(1.45,1.45,0.42,0x59c14d,14); rimTop.position.y=0.16; pg.add(rimTop);
          pg.position.set(p[0],p[1]+0.4,0);
          dynGroup.add(pg);
        } else {
          var pg2=new THREE.Group();
          var bodyT=cyl(1.15,1.15,3.2,0x4aa03f,14); bodyT.position.y=0; pg2.add(bodyT);
          var sheen=cyl(1.16,1.16,0.3,0x6ed15e,14); sheen.position.set(0,0.8,0); pg2.add(sheen);
          pg2.position.set(p[0],p[1],0);
          dynGroup.add(pg2);
        }
      } else if(c===12){
        var sp=new THREE.Group();
        var base=box(1.9,0.9,1.9,0xc4412f); base.position.y=-0.35; sp.add(base);
        var top=box(2.2,0.7,2.2,0x5ec04f); top.position.y=0.35; sp.add(top);
        var pad=box(1.3,0.5,1.3,0xd8d8d8); pad.position.y=0.85; sp.add(pad);
        sp.position.set(p[0],p[1]+1.6,0);
        dynGroup.add(sp);
        worldBlocks[tx+","+ty]={kind:"spring",g:sp};
      }
    }
  }
  instBox.count=bi; instGrass.count=gi; instSpike.count=si; instLava.count=li;
  instBox.instanceMatrix.needsUpdate=true; instGrass.instanceMatrix.needsUpdate=true;
  instSpike.instanceMatrix.needsUpdate=true; instLava.instanceMatrix.needsUpdate=true;
  if(instBox.instanceColor) instBox.instanceColor.needsUpdate=true;
  if(instGrass.instanceColor) instGrass.instanceColor.needsUpdate=true;
  if(instSpike.instanceColor) instSpike.instanceColor.needsUpdate=true;
  dynGroup.add(instBox); dynGroup.add(instGrass); dynGroup.add(instSpike); dynGroup.add(instLava);
  /* —— 旗杆:从地面立起来 + 牛头骨黑旗(海报同款) —— */
  if(curLV.flagX>0){
    var fpx=worldX(curLV.flagX*T+T/2);
    var gY=worldY(12*T);
    var pole=cyl(0.16,0.16,17.6,0xc4c9cf,10);
    pole.position.set(fpx,gY+8.8,0); dynGroup.add(pole);
    var knob=ball(0.34,0xffd23f,8,6); knob.position.set(fpx,gY+17.8,0); dynGroup.add(knob);
    var base=box(1.6,0.8,1.6,0x6a6a72); base.position.set(fpx,gY+0.4,0); dynGroup.add(base);
    var flagC=document.createElement("canvas"); flagC.width=256; flagC.height=160;
    var fg=flagC.getContext("2d");
    fg.fillStyle="#111114"; fg.fillRect(0,0,256,160);
    fg.strokeStyle="#2a2a30"; fg.lineWidth=4; fg.strokeRect(2,2,252,156);
    fg.fillStyle="#e8e8ec";
    fg.beginPath(); fg.arc(128,78,34,0,TAU); fg.fill();
    fg.fillStyle="#111114";
    fg.beginPath(); fg.ellipse(112,70,7,10,0,0,TAU); fg.fill();
    fg.beginPath(); fg.ellipse(144,70,7,10,0,0,TAU); fg.fill();
    fg.beginPath(); fg.moveTo(128,84); fg.lineTo(122,104); fg.lineTo(134,104); fg.closePath(); fg.fill();
    fg.strokeStyle="#e8e8ec"; fg.lineWidth=9; fg.lineCap="round";
    fg.beginPath(); fg.moveTo(100,52); fg.quadraticCurveTo(84,30,66,26); fg.stroke();
    fg.beginPath(); fg.moveTo(156,52); fg.quadraticCurveTo(172,30,190,26); fg.stroke();
    var flagTex=new THREE.CanvasTexture(flagC);
    var flagG=new THREE.Group();
    var flagM=new THREE.Mesh(new THREE.PlaneGeometry(3.6,2.25),new THREE.MeshLambertMaterial({map:flagTex,side:THREE.DoubleSide}));
    flagM.position.set(1.95,0,0); flagG.add(flagM);
    flagG.position.set(fpx,gY+16.2,0);
    dynGroup.add(flagG);
    GS.__flagG=flagG;
  }
  /* 装饰 */
  var decoAt=0;
  for(var dx=6;dx<curLV.w-4;dx+=Math.floor(rnd(6,10))){
    if(tiles[12*curLV.w+dx]!==1) continue;
    if(tiles[11*curLV.w+dx]!==0) continue;
    buildDecor3D(tt,dx,decoAt%3);
    decoAt++;
  }
  /* 金币 */
  for(j=0;j<coinsEnt.length;j++){
    var co=coinsEnt[j];
    var cm=cyl(0.5,0.5,0.12,0xf4b840,12);
    cm.rotation.z=Math.PI/2;
    cm.position.set(worldX(co.x),worldY(co.y),0);
    dynGroup.add(cm); co.mesh=cm;
  }
  /* 玩家 */
  mCalf=buildCalf();
  mCalf.scale.setScalar(1.55);
  dynGroup.add(mCalf);
  /* 敌人 */
  for(var k=0;k<ents.length;k++){
    var e=ents[k];
    if(e.k==="move"){
      var pm=new THREE.Group();
      var plx=box(e.w*S,0.5,e.w*S*0.8,0x9a9aa8); pm.add(plx);
      var plg=box(e.w*S*0.96,0.18,e.w*S*0.78,0x6b6b78); plg.position.y=-0.3; pm.add(plg);
      dynGroup.add(pm); e.mesh=pm;
    } else {
      var mm=null;
      if(e.k==="wolf") mm=buildWolf();
      else if(e.k==="leopard") mm=buildLeopard();
      else if(e.k==="raven") mm=buildRaven();
      else if(e.k==="bird") mm=buildBird();
      else if(e.k==="miniboss") mm=buildBoss();
      if(mm){ mm.scale.setScalar(e.k==="miniboss"?1.5:1.7); dynGroup.add(mm); e.mesh=mm; }
    }
  }
}
var _zeroM4=(typeof THREE!=="undefined")?new THREE.Matrix4().makeScale(0.0001,0.0001,0.0001):null;
function refreshWorldBlock(tx,ty){
  if(!THREE_OK||!instBox) return;
  var key=tx+","+ty;
  if(!worldBlocks[key]) return;
  var wb=worldBlocks[key];
  if(wb.kind==="brick"&&wb.idx!==undefined){
    instBox.setMatrixAt(wb.idx,_zeroM4);
    instBox.instanceMatrix.needsUpdate=true;
  } else if(wb.kind==="q"){
    if(wb.lbl){ dynGroup.remove(wb.lbl); var ii=qLabelSprites.indexOf(wb.lbl); if(ii>=0) qLabelSprites.splice(ii,1); }
    if(wb.idx!==undefined){
      instBox.setColorAt(wb.idx,ccol(0x9a7a50));
      if(instBox.instanceColor) instBox.instanceColor.needsUpdate=true;
    }
  } else if(wb.kind==="used"&&wb.idx!==undefined){
    instBox.setColorAt(wb.idx,ccol(0x9a7a50));
    if(instBox.instanceColor) instBox.instanceColor.needsUpdate=true;
  }
}
function spawnBoss3D(){
  if(!THREE_OK||!GS.boss) return;
  mBoss=buildBoss(); mBoss.scale.setScalar(2.9);
  dynGroup.add(mBoss);
}

function sync3D(){
  if(!THREE_OK) return;
  var gg=GS;
  /* 顶块弹跳动画 */
  if(bumps.length&&instBox&&instBox.instanceMatrix){
    var _mB=new THREE.Matrix4(), _pB=new THREE.Vector3(), _qB=new THREE.Quaternion(), _sB=new THREE.Vector3();
    for(var bi3=bumps.length-1;bi3>=0;bi3--){
      var bp=bumps[bi3];
      bp.t=(bp.t||0)+1/60;
      var wb=worldBlocks[bp.x+","+bp.y];
      if(wb&&wb.idx!==undefined){
        instBox.getMatrixAt(wb.idx,_mB);
        _mB.decompose(_pB,_qB,_sB);
        var lift=Math.sin(Math.min(bp.t,0.22)/0.22*Math.PI)*0.7;
        _pB.y+=lift;
        _mB.compose(_pB,_qB,_sB);
        instBox.setMatrixAt(wb.idx,_mB);
        instBox.instanceMatrix.needsUpdate=true;
      }
      if(bp.t>0.22){ bumps.splice(bi3,1); }
    }
  }
  var heart=Math.sin(GT*3)*0.04;
  if(mCalf){
    var inTitle=(GS.state==="title"||GS.state==="select"||GS.state==="gameover"||GS.state==="win");
    var moving=!inTitle&&Math.abs(PL.vx)>12&&PL.ground;
    var jy=inTitle?0:wy(PL.y+PL.h);
    mCalf.position.set(inTitle?-5.5:wx(PL.x+14),inTitle?0.45:jy,inTitle?1.6:1.4);
    mCalf.rotation.y=inTitle?(-Math.PI/2+Math.sin(GT*0.5)*0.28):0;
    mCalf.rotation.x=PL.star>0?GT*4:(!PL.ground&&!inTitle?clamp(-PL.vy*0.0003,-0.22,0.26):0);
    var lean=clamp(-PL.vx*0.00045,-0.16,0.16);
    mCalf.rotation.z=(moving?Math.sin(GT*13)*0.04:(PL.big?0:Math.sin(GT*2)*0.015))+lean;
    var sq=PL.squash>0?Math.sin(PL.squash/0.12*Math.PI):0;
    var stretch=(!PL.ground&&!inTitle)?clamp(-PL.vy*0.00022,-0.1,0.16):0;
    /* 牛来模式:超级巨大型霸屏 */
    var bgm=(GS.auto&&!PL.dead)?2.85:1;
    var baseSc=(PL.big?1.92:1.55)*bgm;
    if(inTitle){ mCalf.scale.set(3.1,3.1,3.1); }
    else { mCalf.scale.y=baseSc*(1-sq*0.18+stretch); mCalf.scale.x=baseSc*(1+sq*0.12-stretch*0.6); }
    var legs=mCalf.userData.legs;
    if(legs){ var sw=moving?Math.sin(GT*16)*0.7:(!PL.ground&&!inTitle?0.5:0);
      legs[0].rotation.x=sw; legs[1].rotation.x=-sw; }
    if(mCalf.userData.arms){
      var aw=moving?Math.sin(GT*16)*0.5:(!PL.ground&&!inTitle?-1.2:Math.sin(GT*2)*0.05);
      mCalf.userData.arms[0].rotation.x=aw; mCalf.userData.arms[1].rotation.x=-aw; }
    if(mCalf.userData.head){
      mCalf.userData.head.rotation.z=moving?Math.sin(GT*13)*0.05:Math.sin(GT*1.6)*0.03;
      mCalf.userData.head.position.y=1.95+heart;
    }
    if(mCalf.userData.tail) mCalf.userData.tail.rotation.z=0.6+Math.sin(GT*5)*0.3;
    if(PL.star>0){ mCalf.visible=true; mCalf.traverse(function(o){ if(o.isMesh&&o.material&&o.material.emissive){ o.material.emissive.setHex(0x333333); o.material.emissiveIntensity=0.8;} }); }
    else mCalf.traverse(function(o){ if(o.isMesh&&o.material&&o.material.emissive){ o.material.emissive.setHex(0x000000); o.material.emissiveIntensity=0;} });
    if(PL.inv>0&&(GT*12|0)%2===0) mCalf.visible=(GT*16|0)%2===0;
    else mCalf.visible=true;
    /* 牛来模式:巨步震屏 */
    if(GS.auto&&moving){ GS.__stompS=(GS.__stompS||0)+dt;
      if(GS.__stompS>0.16){ GS.__stompS=0; addShake(2.2); burst(PL.x+14,PL.y+PL.h,"dust",3,130); }
    }
    if(PL.dead){
      /* 死亡:向后侧翻倒下(不再倒立翻筋斗,不抽象) */
      var dk=Math.min(1,GS.deadT*3.2);
      mCalf.rotation.z=-Math.PI*0.42*dk+Math.sin(GT*6)*0.05*dk;
      mCalf.position.y=jy+(1-dk)*0.35;
    }
  }
  /* 敌人 */
  for(var i=0;i<ents.length;i++){ var e=ents[i]; if(!e.mesh) continue;
    if(e.k==="move"){
      e.mesh.position.set(worldX(e.x+e.w/2),worldY(e.y),0);
      continue;
    }
    e.mesh.position.set(worldX(e.x+e.w/2),worldY(e.y+e.h),1.0);
    e.mesh.rotation.y=e.face>0?0.3:Math.PI-0.3;
    if(e.k==="wolf"||e.k==="leopard"){
      var sw2=Math.sin(e.t*14)*0.55;
      if(e.mesh.userData){
        var lgs=e.mesh.userData.legs||[];
        for(var li=0;li<lgs.length;li++) lgs[li].rotation.x=(li%2===0)?sw2:-sw2;
      }
      if(e.dead){
        e.mesh.scale.y=Math.max(0.15,1.7*(e.squash/0.4));
      }
    } else if(e.k==="raven"){
      var fl=Math.sin(e.t*18)*0.8;
      if(e.mesh.userData.wingL){ e.mesh.userData.wingL.rotation.z=fl; e.mesh.userData.wingR.rotation.z=-fl; }
    } else if(e.k==="bird"){
      var fl2=Math.sin(e.t*14)*0.9;
      if(e.mesh.userData.wingL){ e.mesh.userData.wingL.rotation.z=fl2; e.mesh.userData.wingR.rotation.z=-fl2; }
    } else if(e.k==="miniboss"){
      var hb=e.hurtT>0&&(e.hurtT*14|0)%2===0;
      e.mesh.traverse(function(o){ if(o.isMesh&&o.material&&o.material.emissive&&!o.userData.keepGlow){ o.material.emissive.setHex(hb?0xaa2200:0x000000); } });
      if(e.mesh.userData.orbit) e.mesh.userData.orbit.rotation.y=GT*2.4;
      var lg2=e.mesh.userData.legs;
      if(lg2){ var sw3=Math.sin(e.t*12)*0.5; lg2[0].rotation.x=sw3; lg2[1].rotation.x=-sw3; }
      if(e.dead){ e.mesh.scale.y=Math.max(0.15,1.5*(e.squash/0.5)); }
    }
  }
  /* Boss */
  if(mBoss&&GS.boss){
    var b=GS.boss;
    mBoss.position.set(worldX(b.x+b.w/2),worldY(b.y+b.h),1.6);
    mBoss.rotation.y=b.face>0?0.3:Math.PI-0.3;
    var hurt2=b.hurt>0&&(b.hurt*12|0)%2===0;
    mBoss.traverse(function(o){ if(o.isMesh&&o.material&&o.material.emissive&&!o.userData.keepGlow){
      o.material.emissive.setHex(hurt2?0x992200:b.state==="warn"?(b.phase===2?0x550033:0x330000):0x000000); }});
    if(mBoss.userData.orbit){
      mBoss.userData.orbit.rotation.y=GT*(b.phase===2?4:2.2);
      mBoss.userData.orbit.position.y=2.2+Math.sin(GT*2)*0.15;
    }
    var lgB=mBoss.userData.legs;
    if(lgB){ var swB=(b.state==="dash")?Math.sin(GT*26)*0.7:Math.sin(GT*6)*0.15;
      lgB[0].rotation.x=swB; lgB[1].rotation.x=-swB; }
    mBoss.rotation.z=b.state==="dash"?Math.sin(GT*30)*0.06:(b.state==="stun"?Math.sin(GT*12)*0.12:0);
  }
  /* 道具 */
  for(var j=0;j<itms.length;j++){ var it=itms[j];
    if(!it.mesh){ it.mesh=buildItem3D(it.k); it.mesh.scale.setScalar(1.5); dynGroup.add(it.mesh); }
    it.mesh.position.set(worldX(it.x+10),worldY(it.y+it.h),1.2);
    if(it.k==="star") it.mesh.rotation.y+=0.1;
  }
  /* 火球 */
  for(var fq=0;fq<fires.length;fq++){ var ff=fires[fq];
    if(!ff.mesh){
      ff.mesh=new THREE.Mesh(new THREE.SphereGeometry(0.42,10,8),new THREE.MeshBasicMaterial({color:0xff7a2f}));
      var fm2=new THREE.Mesh(new THREE.SphereGeometry(0.6,8,6),new THREE.MeshBasicMaterial({color:0xffb03f,transparent:true,opacity:0.45}));
      ff.mesh.add(fm2);
      dynGroup.add(ff.mesh);
    }
    ff.mesh.position.set(worldX(ff.x),worldY(ff.y),1.2);
    ff.mesh.scale.setScalar(1+Math.sin(GT*20+fq)*0.12);
  }
  /* 金币旋转 */
  for(var k2=0;k2<coinsEnt.length;k2++){ var c2=coinsEnt[k2];
    if(c2.mesh){ if(c2.taken){ c2.mesh.visible=false; } else { c2.mesh.visible=true; c2.mesh.rotation.y=Math.sin(GT*5+k2)*0.8; c2.mesh.position.y=worldY(c2.y+Math.sin(c2.t*4)*3); } }
  }
  /* 弹簧压扁 */
  if(GS.springSq>0){
    for(var tk in worldBlocks){ var wb2=worldBlocks[tk];
      if(wb2.kind==="spring"&&wb2.g){
        var sc2=1-GS.springSq*0.35;
        wb2.g.scale.y=sc2;
      }
    }
  }
  /* 问号块跳动 */
  for(var oi=0;oi<qLabelSprites.length;oi++){
    var ql=qLabelSprites[oi];
    ql.position.z=1.45+Math.sin(GT*3+oi)*0.06;
    ql.scale.setScalar(1+Math.sin(GT*3+oi)*0.05);
  }
  /* 旗帜飘动 */
  if(GS.__flagG){ GS.__flagG.rotation.y=Math.sin(GT*3)*0.18; }
  if(GS.__titleFlag){ GS.__titleFlag.rotation.y=Math.sin(GT*1.2)*0.12; }
  /* 粒子 → 点云 */
  var n=Math.min(parts.length,pMax);
  for(var pi=0;pi<pMax;pi++){
    if(pi<n){ var pp=parts[pi];
      pPos[pi*3]=worldX(pp.x); pPos[pi*3+1]=worldY(pp.y); pPos[pi*3+2]=1.8;
      var col=ccol(pp.col||"#fff");
      pCol[pi*3]=col.r; pCol[pi*3+1]=col.g; pCol[pi*3+2]=col.b;
    } else { pPos[pi*3]=-999; pPos[pi*3+2]=-999; }
  }
  pGeo.attributes.position.needsUpdate=true;
  pGeo.attributes.color.needsUpdate=true;
  /* 文字弹出 → sprite 池 */
  var tp=texts;
  while(textPool.length<Math.min(tp.length,TEXTPOOL)){
    var sp=makeTextSprite("",1, "#fff"); sp.visible=false; dynGroup.add(sp); textPool.push(sp);
  }
  for(var ti=0;ti<textPool.length;ti++){
    var sp2=textPool[ti];
    if(ti<Math.min(tp.length,textPool.length)){
      var tx=tp[ti];
      sp2.visible=true;
      sp2.position.set(worldX(tx.x),worldY(tx.y-tx.t*46),3.2);
      renderPooledText(sp2,tx.txt,tx.col);
    } else sp2.visible=false;
  }
  if(instMatLava&&instMatLava.emissiveIntensity!==undefined) instMatLava.emissiveIntensity=0.6+Math.sin(GT*6)*0.25;
}
function renderPooledText(sp,txt,col){
  if(!sp.userData.cv){
    var c=document.createElement("canvas"); c.width=256;c.height=128;
    var g=c.getContext("2d");
    sp.userData.cv=c; sp.userData.g2=g;
    sp.userData.tex=new THREE.CanvasTexture(c);
    sp.material=new THREE.SpriteMaterial({map:sp.userData.tex,transparent:true});
  }
  var g2=sp.userData.g2;
  g2.clearRect(0,0,256,128);
  g2.font="bold 70px "+FONT; g2.textAlign="center"; g2.textBaseline="middle";
  g2.strokeStyle="rgba(60,30,0,0.9)"; g2.lineWidth=10; g2.strokeText(txt,128,64);
  g2.fillStyle=col||"#fff"; g2.fillText(txt,128,64);
  sp.userData.tex.needsUpdate=true;
}

/* ==================== 相机 & 渲染 ==================== */
var CAMZ=58;
function updateCamera(){
  if(!THREE_OK) return;
  var inTitle=(GS.state==="title"||GS.state==="select"||GS.state==="gameover"||GS.state==="win");
  var cx=inTitle?2:worldX(camX+W*0.5);
  cx+=(shake>0?rnd(-shake,shake)*S:0);
  var cy=inTitle?worldY(H*0.5):worldY(H*0.5);
  cy+=(shake>0?rnd(-shake,shake)*S:0);
  camera.position.set(cx,cy,CAMZ+((shake>0)?rnd(0,shake)*0.2:0));
  camera.lookAt(cx,cy,0);
}
var SKY_G=0;
var CLOUDS2D=[];
function initClouds2D(){
  CLOUDS2D=[];
  for(var i=0;i<9;i++){
    CLOUDS2D.push({x:hash(i*7)*1400,y:30+hash(i+40)*150,s:0.7+hash(i+90)*0.9,p:0.1+hash(i+130)*0.25});
  }
}
function makeSky(){
  if(GS.state==="title"||GS.state==="select"||GS.state==="win"){ SKY_G=4; return; }
  var th=curLV?curLV.theme:0;
  SKY_G=th;
}
var SKY_PAL=[
  {top:"#3f9df0",mid:"#7ec8ff",bot:"#cdefff",sun:"#ffec9e",sunGlow:"rgba(255,236,158,0.45)",hill:"#5fae4b",hillFar:"#8ccf7a",cloud:"rgba(255,255,255,0.95)"},
  {top:"#e88a3a",mid:"#ffbf6a",bot:"#ffe9c0",sun:"#fff0b0",sunGlow:"rgba(255,180,90,0.5)",hill:"#d9a04e",hillFar:"#e8bd7c",cloud:"rgba(255,240,210,0.95)"},
  {top:"#4a7adf",mid:"#8ab4ef",bot:"#d8ecff",sun:"#eef4ff",sunGlow:"rgba(220,235,255,0.5)",hill:"#b8d8f0",hillFar:"#d4e8f8",cloud:"rgba(255,255,255,0.95)"},
  {top:"#7a1418",mid:"#c04030",bot:"#ffb060",sun:"#ffcd80",sunGlow:"rgba(255,140,60,0.55)",hill:"#5a2418",hillFar:"#7c3a22",cloud:"rgba(255,120,60,0.5)"},
  {top:"#05060f",mid:"#0a0e22",bot:"#141a38",sun:"#8ab4ef",sunGlow:"rgba(90,140,255,0.2)",hill:"#1a2038",hillFar:"#12182c",cloud:"rgba(255,255,255,0.08)"}
];
var STARS2D=[];
function initStars2D(){
  STARS2D=[];
  for(var i=0;i<90;i++) STARS2D.push({x:hash(i*3.3)*W,y:hash(i+77)*H*0.8,s:0.5+hash(i+13)*1.6,tw:hash(i+5)*TAU});
}
function drawBG2D(c){
  if(typeof SKY_G!=="number"||!SKY_PAL[SKY_G]) SKY_G=0;
  var p=SKY_PAL[SKY_G];
  var g=c.createLinearGradient(0,0,0,H);
  g.addColorStop(0,p.top); g.addColorStop(0.55,p.mid); g.addColorStop(1,p.bot);
  c.fillStyle=g; c.fillRect(0,0,W,H);
  if(SKY_G===4){
    /* 太空:星星 + 地球(海报同款) */
    for(var st=0;st<STARS2D.length;st++){
      var s2=STARS2D[st];
      c.globalAlpha=0.4+0.6*Math.abs(Math.sin(GT*1.5+s2.tw));
      c.fillStyle="#fff";
      c.fillRect(s2.x,s2.y,s2.s,s2.s);
    }
    c.globalAlpha=1;
    var ex=70,ey=H-70;
    var eg=c.createRadialGradient(ex-12,ey-12,8,ex,ey,58);
    eg.addColorStop(0,"#7ab4ff"); eg.addColorStop(0.6,"#2a5ac0"); eg.addColorStop(1,"#0a1a50");
    c.fillStyle=eg; c.beginPath(); c.arc(ex,ey,56,0,TAU); c.fill();
    c.fillStyle="rgba(120,220,150,0.5)";
    c.beginPath(); c.arc(ex-18,ey+8,16,0,TAU); c.arc(ex+14,ey-16,11,0,TAU); c.fill();
    c.fillStyle="rgba(200,230,255,0.25)";
    c.beginPath(); c.arc(ex+8,ey+20,20,0,TAU); c.fill();
    return;
  }
  c.save();
  c.globalAlpha=0.9; c.fillStyle=p.sunGlow;
  c.beginPath(); c.arc(W-150,100,70,0,TAU); c.fill();
  c.globalAlpha=1; c.fillStyle=p.sun;
  c.beginPath(); c.arc(W-150,100,46,0,TAU); c.fill();
  c.restore();
  for(var i=0;i<CLOUDS2D.length;i++){
    var cl=CLOUDS2D[i];
    var cx=((cl.x-camX*cl.p)%(W+320)+W+320)%(W+320)-160;
    c.fillStyle=p.cloud; c.globalAlpha=0.85;
    cloud2D(c,cx,cl.y,cl.s);
  }
  c.globalAlpha=1;
  c.fillStyle=p.hillFar;
  for(var h=0;h<7;h++){
    var hx=((h*290-camX*0.18)%(W+500)+W+500)%(W+500)-250;
    mountain2D(c,hx,H-180,90+hash(h+7)*70,260);
  }
  c.fillStyle=p.hill;
  for(var h2=0;h2<6;h2++){
    var hx2=((h2*330+140-camX*0.32)%(W+520)+W+520)%(W+520)-260;
    mountain2D(c,hx2,H-120,70+hash(h2+21)*60,300);
  }
}
function cloud2D(c,x,y,s){
  c.beginPath();
  c.arc(x,y,22*s,0,TAU); c.arc(x+26*s,y+6*s,17*s,0,TAU); c.arc(x-26*s,y+5*s,15*s,0,TAU);
  c.arc(x+8*s,y-12*s,16*s,0,TAU);
  c.fill();
}
function mountain2D(c,x,base,h,w){
  c.beginPath(); c.moveTo(x-w/2,base);
  c.quadraticCurveTo(x-w*0.2,base-h*1.25,x,base-h);
  c.quadraticCurveTo(x+w*0.22,base-h*0.85,x+w/2,base);
  c.closePath(); c.fill();
}

/* ==================== HUD ==================== */
function hintText(c,txt,x,y,font,fill,align){ /* 带黑描边的文字:任何背景都看得清 */
  if(align) c.textAlign=align;
  c.font=font; c.lineWidth=4; c.lineJoin="round";
  c.strokeStyle="rgba(8,10,20,0.88)";
  c.strokeText(txt,x,y);
  c.fillStyle=fill; c.fillText(txt,x,y);
}
function drawHUD2D(c){
  c.textBaseline="middle";
  /* 顶部深色底条:文字不再糊在天空上 */
  var hg=c.createLinearGradient(0,0,0,56);
  hg.addColorStop(0,"rgba(8,10,20,0.62)");
  hg.addColorStop(1,"rgba(8,10,20,0)");
  c.fillStyle=hg; c.fillRect(0,0,W,56);
  c.save(); c.translate(24,25);
  c.beginPath(); c.arc(0,0,13,0,TAU); c.fillStyle="rgba(255,210,63,0.22)"; c.fill();
  c.fillStyle="#ffd23f"; c.beginPath(); c.arc(0,0,10,0,TAU); c.fill();
  c.fillStyle="#7a4a1e"; c.fillRect(-1,-12,2,4); c.fillRect(4,-12,2,4);
  c.fillStyle="#fff"; c.beginPath(); c.arc(-3,-2,3,0,TAU); c.arc(3,-2,3,0,TAU); c.fill();
  c.fillStyle="#2a1a10"; c.beginPath(); c.arc(-3,-2,1.5,0,TAU); c.arc(3,-2,1.5,0,TAU); c.fill();
  c.restore();
  c.textBaseline="middle"; c.textAlign="left";
  c.font="bold 18px "+FONT;
  hintText(c,"×"+Math.max(0,GS.lives),42,26,"bold 18px "+FONT,"#fff","left");
  c.fillStyle="#f4b840"; c.beginPath(); c.arc(96,25,7,0,TAU); c.fill();
  hintText(c,"×"+GS.coins,108,26,"bold 18px "+FONT,"#fff","left");
  hintText(c,("0000000"+GS.score).slice(-7),168,26,"bold 18px "+FONT,"#ffd23f","left");
  c.textAlign="center";
  hintText(c,curLV?curLV.name:"",W/2,16,"14px "+FONT,"rgba(255,255,255,0.95)","center");
  hintText(c,VER+" · "+(GS.hs>0?("最高 "+GS.hs):"牛来大冒险"),W/2,34,"11px "+FONT,"rgba(160,220,255,0.95)","center");
  c.textAlign="right";
  hintText(c,""+Math.max(0,Math.floor(GS.time)),W-20,25,"bold 24px "+FONT,GS.time<30?"#ff5a5a":"#fff","right");
  hintText(c,"TIME",W-20,42,"10px "+FONT,"rgba(255,255,255,0.8)","right");
  if(muted){ hintText(c,"MUTE",W-72,42,"10px "+FONT,"rgba(255,120,120,0.95)","right"); }
  c.textAlign="left";
  hintText(c,"M静音 · P暂停 · R重开 · Esc选关 · O牛来模式 · "+VER,16,H-12,"11px "+FONT,"rgba(255,255,255,0.85)","left");
  /* 空中连击 */
  if((GS.combo||0)>=2&&(GS.state==="play"||GS.state==="bossintro")){
    c.textAlign="center"; c.font="bold 22px "+FONT;
    hintText(c,"COMBO x"+GS.combo,W/2,66+Math.sin(GT*10)*2,"bold 22px "+FONT,GS.combo>=5?"#ff5a5a":"#ffd23f","center");
  }
  /* 牛来模式徽标 */
  if(GS.auto){
    c.save();
    c.globalAlpha=0.75+0.25*Math.sin(GT*4);
    c.fillStyle="#5ad4ff"; c.font="bold 15px "+FONT; c.textAlign="center";
    hintText(c,"[牛来模式 无敌闯关中]",W/2,H-40,"bold 15px "+FONT,"#5ad4ff","center");
    c.restore();
  }
  /* 牛模王血条 */
  if(GS.boss&&(GS.state==="play"||GS.state==="bossintro")&&!GS.boss.dead){
    var bw=320,bx=(W-bw)/2;
    c.fillStyle="rgba(0,0,0,0.5)"; c.fillRect(bx-3,H-36,bw+6,20);
    c.fillStyle="#3a2020"; c.fillRect(bx,H-31,bw,12);
    var frac=Math.max(0,GS.boss.hp/GS.boss.maxhp);
    var grd=c.createLinearGradient(bx,0,bx+bw,0);
    grd.addColorStop(0,"#ff5a5a"); grd.addColorStop(1,"#ffb03f");
    c.fillStyle=grd; c.fillRect(bx,H-31,bw*frac,12);
    hintText(c,"Anthropic Dario"+(GS.boss.phase===2?" · 封号模式":""),bx,H-42,"bold 12px "+FONT,"#fff","left");
  }
  /* 小牛模王血条 */
  var mb=null;
  for(var i=0;i<ents.length;i++){ if(ents[i].k==="miniboss"&&!ents[i].dead){ mb=ents[i]; break; } }
  if(mb&&GS.state==="play"&&Math.abs(mb.x-PL.x)<560){
    var bw2=180,bx2=(W-bw2)/2;
    c.fillStyle="rgba(0,0,0,0.45)"; c.fillRect(bx2-2,H-30,bw2+4,14);
    c.fillStyle="#3a2030"; c.fillRect(bx2,H-26,bw2,8);
    var fr2=Math.max(0,mb.hp/mb.maxhp);
    c.fillStyle="#c05aff"; c.fillRect(bx2,H-26,bw2*fr2,8);
    hintText(c,"牛模王分身",bx2,H-38,"bold 10px "+FONT,"#fff","left");
  }
  /* 牛来模式:霸屏喊妈妈 */
  if(GS.auto&&GS.holler&&GS.hollerT>0){
    GS.hollerT-=1/60;
    var hk=Math.min(1,(2.6-GS.hollerT)*6);
    var hb=1+Math.abs(Math.sin(GT*7))*0.06;
    var hs=Math.sin(Math.min(1,hk)*Math.PI/2)*(56*hb);
    if(hs>2){
      c.save();
      c.translate(W/2,150);
      c.rotate(Math.sin(GT*5)*0.03);
      c.scale(hs/56,hs/56);
      c.font="bold 56px "+FONT; c.textAlign="center"; c.textBaseline="middle";
      var hg2=c.createLinearGradient(0,-28,0,28);
      hg2.addColorStop(0,"#ff9adf"); hg2.addColorStop(0.5,"#ff5ad4"); hg2.addColorStop(1,"#ff2a9a");
      c.lineWidth=10; c.lineJoin="round"; c.strokeStyle="rgba(10,4,24,0.95)";
      c.strokeText(GS.holler,0,0);
      c.fillStyle=hg2; c.fillText(GS.holler,0,0);
      c.font="bold 20px "+FONT; c.fillStyle="#ffd23f";
      c.lineWidth=6; c.strokeStyle="rgba(10,4,24,0.9)";
      c.strokeText("妈妈!! 牛来霸屏!!",0,52); c.fillText("妈妈!! 牛来霸屏!!",0,52);
      c.restore();
    }
  }
}

/* ==================== 主渲染 ==================== */
function render(){
  ctx.clearRect(0,0,W,H);
  drawBG2D(ctx);
  if(!THREE_OK){ drawNoWebGL(); return; }
  updateCamera(); sync3D();
  renderer.render(scene,camera);
  ctx.drawImage(cv3d,0,0);
  drawFX2D();
  if(GS.state!=="title"&&GS.state!=="select"&&GS.state!=="gameover"&&GS.state!=="win") drawHUD2D(ctx);
  drawOverlays(ctx);
}
function drawNoWebGL(){
  ctx.fillStyle="#1a1a26"; ctx.fillRect(0,0,W,H);
  ctx.fillStyle="#fff"; ctx.font="bold 24px "+FONT; ctx.textAlign="center"; ctx.textBaseline="middle";
  ctx.fillText("需要 WebGL 支持才能运行 3D 版",W/2,H/2-30);
  ctx.font="15px "+FONT;
  ctx.fillText("请使用较新的 Chrome / Edge / Firefox / Safari",W/2,H/2+10);
}
function drawFX2D(){
  for(var i=0;i<parts.length;i++){
    var p=parts[i];
    if(p.type==="ring"){
      var k=p.t/p.life;
      ctx.strokeStyle=p.col||"#fff"; ctx.globalAlpha=1-k; ctx.lineWidth=3*(1-k);
      ctx.beginPath(); ctx.arc(p.x-camX,p.y,p.size+k*30,0,TAU); ctx.stroke();
      ctx.globalAlpha=1;
    } else if(p.type==="smoke"){
      var k2=p.t/p.life;
      ctx.fillStyle="rgba(255,255,255,0.6)"; ctx.globalAlpha=1-k2;
      ctx.beginPath(); ctx.arc(p.x-camX,p.y,p.size*(0.5+k2*1.6),0,TAU); ctx.fill();
      ctx.globalAlpha=1;
    }
  }
  for(var j=0;j<texts.length;j++){ var tx=texts[j];
    ctx.globalAlpha=1-tx.t/0.9; ctx.font="bold 20px "+FONT; ctx.textAlign="center"; ctx.textBaseline="middle";
    ctx.strokeStyle="rgba(60,30,0,0.9)"; ctx.lineWidth=4;
    var sx=tx.x-camX, sy=tx.y-tx.t*46;
    ctx.strokeText(tx.txt,sx,sy);
    ctx.fillStyle=tx.col; ctx.fillText(tx.txt,sx,sy);
  }
  ctx.globalAlpha=1;
}

/* ==================== 覆盖层 ==================== */
var titleImg=null;
try{ titleImg=new Image(); titleImg.src="logo.png"; }catch(e){ titleImg=null; }
function drawOverlays(c){
  if(GS.levelIntro>0&&(GS.state==="play"||GS.state==="bossintro")){
    GS.levelIntro-=1/60;
    var a=clamp(Math.min((2.0-GS.levelIntro)*2.2,GS.levelIntro),0,1);
    c.globalAlpha=a;
    c.fillStyle="rgba(12,12,22,0.4)"; c.fillRect(0,240,W,120);
    c.fillStyle="#ffd23f"; c.font="bold 42px "+FONT; c.textAlign="center"; c.textBaseline="middle";
    c.fillText(curLV.name,W/2,282);
    c.fillStyle="#fff"; c.font="16px "+FONT;
    c.fillText(GS.li>=15?"Anthropic Dario 就在里面——踩爆它的服务器!":"冲呀——小心牛模王拦路!",W/2,330);
    c.globalAlpha=1;
  }
  if(GS.state==="bossintro"){
    c.fillStyle="rgba(30,0,30,0.35)"; c.fillRect(0,0,W,H);
    /* 大喊"牛来" punch-in */
    var biT=2.2-GS.bossIntro;
    var sc3=biT<0.35?(3-biT/0.35*2):(1+Math.sin(GT*9)*0.03);
    c.save();
    c.translate(W/2,190);
    c.scale(sc3,sc3);
    c.font="bold 96px "+FONT;
    c.textAlign="center"; c.textBaseline="middle";
    c.lineWidth=18; c.strokeStyle="#3a0a3a";
    c.strokeText("牛 来 —!!",0,0);
    c.fillStyle=biT<0.35?"#fff":"#ff5adf";
    c.fillText("牛 来 —!!",0,0);
    c.restore();
    c.fillStyle="#c05aff"; c.font="bold 30px "+FONT; c.textAlign="center"; c.textBaseline="middle";
    c.fillText("Anthropic Dario 苏醒了!!",W/2,286);
    c.font="17px "+FONT; c.fillStyle="#fff"; c.fillText("AI 版牛模王成精了——引它撞墙,再踩它的金边眼镜!",W/2,322);
  }
  if(GS.state==="winseq"){
    c.fillStyle="rgba(0,0,0,0.35)"; c.fillRect(0,0,W,H);
    c.fillStyle="#ffd23f"; c.font="bold 44px "+FONT; c.textAlign="center"; c.textBaseline="middle";
    c.fillText("模型崩溃!!",W/2,200);
    c.fillStyle="#fff"; c.font="22px "+FONT;
    c.fillText("Anthropic Dario 被踩到宕机,蓝屏重启了!",W/2,260);
  }
  if(GS.state==="title") drawTitle2D(c);
  else if(GS.state==="select") drawSelect2D(c);
  else if(GS.state==="pause"){
    c.fillStyle="rgba(0,0,0,0.5)"; c.fillRect(0,0,W,H);
    c.fillStyle="#fff"; c.font="bold 42px "+FONT; c.textAlign="center"; c.textBaseline="middle";
    c.fillText("已暂停",W/2,H/2-16);
    c.font="16px "+FONT; c.fillText("按 P 继续 · 按 Esc 退回选关",W/2,H/2+22);
  }
  else if(GS.state==="gameover"){ drawOver2D(c); }
  else if(GS.state==="win"){ drawWin2D(c); }
  if(flash>0){ c.fillStyle="rgba(255,40,40,"+Math.min(0.5,flash)+")"; c.fillRect(0,0,W,H); }
}
function drawTitle2D(c){
  c.fillStyle="rgba(5,6,15,0.25)"; c.fillRect(0,0,W,H);
  c.textAlign="center"; c.textBaseline="middle";
  /* 海报立绘 */
  var bob=Math.sin(GT*1.4)*6;
  if(titleImg&&titleImg.complete&&titleImg.naturalWidth>0){
    var ih=270, iw=ih*titleImg.naturalWidth/titleImg.naturalHeight;
    var ix=W/2-iw/2+120, iy=60+bob;
    c.save();
    c.shadowColor="rgba(120,180,255,0.55)"; c.shadowBlur=36;
    c.drawImage(titleImg,ix,iy,ih*(titleImg.naturalWidth/titleImg.naturalHeight),ih);
    c.restore();
    var txx=ix-130;
    c.fillStyle="#ffd23f"; c.font="bold 64px "+FONT;
    c.strokeStyle="#2a1500"; c.lineWidth=10;
    c.strokeText("牛来大冒险",txx,140);
    c.fillText("牛来大冒险",txx,140);
    c.fillStyle="#8ecbff"; c.font="bold 30px "+FONT;
    c.fillText("Ox is Coming",txx,196);
    c.fillStyle="rgba(255,255,255,0.75)"; c.font="15px "+FONT;
    c.fillText("3D · 手工建模 · 一车牛来了",txx,238);
    c.fillStyle="#fff"; c.font="bold 19px "+FONT;
    hintText(c,"点击 / Enter 选关开始",W/2,392+bob*0.4,"bold 19px "+FONT,"#fff","center");
    hintText(c,"A = 牛来模式全自动闯关 · ←→/AD 移动 · 空格 跳 · Shift 冲刺",W/2,424,"14px "+FONT,"rgba(255,255,255,0.95)","center");
    hintText(c,"空中连踩出 COMBO · 全速冲刺撞飞敌人 · O 随时开启牛来模式",W/2,448,"14px "+FONT,"rgba(255,255,255,0.95)","center");
    if(GS.hs>0){ hintText(c,"最高分 "+GS.hs,W/2,478,"14px "+FONT,"#ffd23f","center"); }
  } else {
    c.fillStyle="#ffd23f"; c.font="bold 70px "+FONT;
    c.strokeStyle="#7a2a10"; c.lineWidth=13;
    c.strokeText("牛 来 大 冒 险",W/2,150+bob);
    c.fillText("牛 来 大 冒 险",W/2,150+bob);
    c.fillStyle="#8ecbff"; c.font="bold 34px "+FONT;
    c.fillText("Ox is Coming",W/2,210+bob);
    c.fillStyle="#fff"; c.font="bold 20px "+FONT;
    hintText(c,"点击 / Enter 选关开始",W/2,330,"bold 20px "+FONT,"#fff","center");
    hintText(c,"A = 牛来模式全自动闯关",W/2,362,"14px "+FONT,"rgba(255,255,255,0.95)","center");
    if(GS.hs>0){ hintText(c,"最高分 "+GS.hs,W/2,392,"14px "+FONT,"#ffd23f","center"); }
  }
  c.fillStyle="rgba(255,255,255,0.6)"; c.font="13px "+FONT;
  c.fillText("主角:牛来 · Boss:牛模王(Ox Alpha 模型成精) · "+VER+" · © 2026 MCapricorns · MIT",W/2,H-18);
  var gw2=320,gh2=42,gx2=W-gw2-20,gy2=H-70;
  GH.x=gx2; GH.y=gy2; GH.w=gw2; GH.h=gh2;
  c.save();
  c.fillStyle="rgba(16,20,34,0.88)"; c.fillRect(gx2,gy2,gw2,gh2);
  c.strokeStyle="#6ea8ff"; c.lineWidth=2; c.strokeRect(gx2,gy2,gw2,gh2);
  c.fillStyle="#ffd23f"; c.font="bold 15px "+FONT; c.textAlign="center"; c.textBaseline="middle";
  c.fillText("★ 点赞收藏 · github.com/MCapricorns/niu-lai-3d",gx2+gw2/2,gy2+gh2/2+1);
  c.restore();
}
var SEL_COLS=4,SEL_CW=170,SEL_CH=74,SEL_GX=18,SEL_GY=10;
function selGridX0(){ return (W-(SEL_COLS*SEL_CW+(SEL_COLS-1)*SEL_GX))/2; }
function selGridY0(){ return 102; }
function selCellAt(mx,my){
  var x0=selGridX0(),y0=selGridY0();
  for(var i=0;i<LEVELS.length;i++){
    var r=Math.floor(i/SEL_COLS),col=i%SEL_COLS;
    var x=x0+col*(SEL_CW+SEL_GX),y=y0+r*(SEL_CH+SEL_GY);
    if(mx>=x&&mx<=x+SEL_CW&&my>=y&&my<=y+SEL_CH) return i;
  }
  return -1;
}
function drawSelect2D(c){
  c.fillStyle="rgba(5,6,15,0.45)"; c.fillRect(0,0,W,H);
  c.textAlign="center"; c.textBaseline="middle";
  c.fillStyle="#ffd23f"; c.font="bold 34px "+FONT;
  c.fillText("选 关 · 直接开跳",W/2,58);
  c.fillStyle="rgba(255,255,255,0.6)"; c.font="13px "+FONT;
  c.fillText("方向键/点击选择 · Enter/点击开始 · Esc 返回",W/2,92);
  var x0=selGridX0(),y0=selGridY0();
  var worldCol=["#59c14d","#efc06e","#8ab4ef","#ff7a5a"];
  for(var i=0;i<LEVELS.length;i++){
    var r=Math.floor(i/SEL_COLS),col=i%SEL_COLS;
    var x=x0+col*(SEL_CW+SEL_GX),y=y0+r*(SEL_CH+SEL_GY);
    var sel=(i===GS.selIdx);
    c.fillStyle=sel?"rgba(255,210,63,0.22)":"rgba(16,16,30,0.6)";
    c.fillRect(x,y,SEL_CW,SEL_CH);
    c.strokeStyle=sel?"#ffd23f":worldCol[LEVELS[i].theme];
    c.lineWidth=sel?3:1.5;
    c.strokeRect(x,y,SEL_CW,SEL_CH);
    c.fillStyle=sel?"#ffd23f":"#fff";
    c.font="bold 20px "+FONT;
    c.fillText(LEVELS[i].name.split(" ")[0],x+SEL_CW/2,y+20);
    c.font="12px "+FONT;
    c.fillStyle=sel?"rgba(255,255,255,0.95)":"rgba(255,255,255,0.55)";
    c.fillText(LEVELS[i].name.split(" ").slice(1).join(" "),x+SEL_CW/2,y+41);
    var blv=0; try{ blv=parseInt(localStorage.getItem("niu_best_lv"+i)||"0",10)||0; }catch(e){}
    if(blv>0){ c.fillStyle="rgba(255,210,63,0.8)"; c.font="11px "+FONT; c.fillText("最佳 "+blv,x+SEL_CW/2,y+59); }
  }
  c.fillStyle="rgba(255,255,255,0.5)"; c.font="12px "+FONT;
  c.fillText("每关终点都有牛模王分身拦路 · 4-4 挑战牛模王真身 · "+VER,W/2,H-24);
}
function drawOver2D(c){
  c.fillStyle="rgba(10,5,5,0.72)"; c.fillRect(0,0,W,H);
  c.fillStyle="#ff5a5a"; c.font="bold 58px "+FONT; c.textAlign="center"; c.textBaseline="middle";
  c.fillText(GS.auto?"牛来被 Anthropic Dario 拿下了…":"牛来倒下了…",W/2,H/2-70);
  if(GS.boss&&GS.boss.dead){ /* noop */ }
  c.fillStyle="#ffd23f"; c.font="bold 26px "+FONT;
  c.fillText("你被封号了！！",W/2,H/2-30);
  c.fillStyle="#fff"; c.font="20px "+FONT;
  c.fillText("得分 "+GS.score+" · 金币 "+GS.coins+" · 最高连击 x"+GS.bestCombo,W/2,H/2+2);
  c.fillStyle="rgba(255,255,255,0.6)"; c.font="15px "+FONT;
  c.fillText("金币 "+GS.sCoin+" + 击杀 "+GS.sKill+" + 奖励 "+GS.sBonus,W/2,H/2+32);
  c.fillStyle="#ffd23f"; c.font="bold 22px "+FONT;
  c.fillText("按 Enter / 点击 返回标题",W/2,H/2+58);
}
function drawWin2D(c){
  c.fillStyle="rgba(8,8,20,0.72)"; c.fillRect(0,0,W,H);
  c.fillStyle="#ffd23f"; c.font="bold 58px "+FONT; c.textAlign="center"; c.textBaseline="middle";
  c.fillText("通关!!! Ox has Come!",W/2,H/2-90);
  c.fillStyle="#fff"; c.font="20px "+FONT;
  c.fillText("最终得分 "+GS.score+" · 金币 "+GS.coins+" · 最高连击 x"+GS.bestCombo,W/2,H/2-24);
  c.fillStyle="rgba(255,255,255,0.65)"; c.font="15px "+FONT;
  c.fillText("积分榜:金币 "+GS.sCoin+" + 击杀 "+GS.sKill+" + 奖励 "+GS.sBonus,W/2,H/2+6);
  c.fillStyle="rgba(160,220,255,0.9)"; c.font="16px "+FONT;
  c.fillText("牛模王被踩到格式化,牛来在月球插上了牛头骨大旗。谢谢玩!",W/2,H/2+16);
  c.fillStyle="rgba(255,255,255,0.7)"; c.font="14px "+FONT;
  c.fillText("最高分 "+GS.hs,W/2,H/2+50);
  c.fillStyle="rgba(110,168,255,0.85)"; c.font="13px "+FONT;
  c.fillText("★ github.com/MCapricorns/niu-lai-3d · 点赞收藏",W/2,H/2+78);
  c.fillStyle="#ffd23f"; c.font="bold 22px "+FONT;
  c.fillText("按 Enter / 点击 返回标题",W/2,H/2+110);
}

/* ==================== 主循环 ==================== */
var lastT=0;
function loop(ts){
  requestAnimationFrame(loop);
  var dt=Math.min(0.05,(ts-lastT)/1000||0.016);
  lastT=ts;
  update(dt);
  render();
}
cv.addEventListener("pointerdown",function(e){
  initAU(); if(AC&&AC.state==="suspended")AC.resume();
  var r=cv.getBoundingClientRect();
  var mx=(e.clientX-r.left)*W/r.width, my=(e.clientY-r.top)*H/r.height;
  if(GS.state==="title"&&mx>=GH.x&&mx<=GH.x+GH.w&&my>=GH.y&&my<=GH.y+GH.h){
    try{ window.open("https://github.com/MCapricorns/niu-lai-3d","_blank"); }catch(err){}
    sClick(); return;
  }
  if(GS.state==="title"){ GS.state="select"; makeSky(); sClick(); }
  else if(GS.state==="select"){
    var cell=selCellAt(mx,my);
    if(cell>=0){ GS.selIdx=cell; startLevel(cell); }
  }
  else if(GS.state==="gameover"||GS.state==="win"){ GS.auto=false; GS.state="title"; makeSky(); buildTitle3D(); sClick(); }
});
window.addEventListener("load",function(){
  initClouds2D();
  initStars2D();
  if(THREE_OK){
    makeSky(); buildTitle3D();
  }
  requestAnimationFrame(loop);
});