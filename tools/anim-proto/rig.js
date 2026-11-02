/* ---------------- PART RIG (Codex cut-out parts) ---------------- */
const PM=__MANIFEST__; // part name -> [x,y] offset in 1024 master space
const HP=PM._pivots, WP=PM._wolf_pivots;
const D2R=Math.PI/180;
function rigMats(bones,pose){const W={};for(const b of bones){const p=pose[b.n]||{};const [px,py]=b.p;
  const L=new DOMMatrix().translate(px+(p.x||0),py+(p.y||0)).rotate(p.r||0).scale(1+(p.sx||0),1+(p.sy||0)).translate(-px,-py);
  W[b.n]=b.par?W[b.par].multiply(L):L;}return W}
function drawPart(c,base,M,name){const img=IM[name];if(!img)return;const o=PM[name];c.setTransform(base.multiply(M));c.drawImage(img,o[0],o[1]);}
// ---- hero ----
const HB=[{n:"root",p:HP.feet},{n:"hips",p:HP.hips,par:"root"},{n:"head",p:HP.neck,par:"hips"},
  {n:"armNu",p:HP.shN,par:"hips"},{n:"armNl",p:HP.elN,par:"armNu"},{n:"armFu",p:HP.shF,par:"hips"},{n:"armFl",p:HP.elF,par:"armFu"},
  {n:"legN",p:HP.hipN,par:"root"},{n:"legF",p:HP.hipF,par:"root"}];
const REST_A={ua:136,fa:136,ufa:50,ffa:50};
const K=(a)=>a; // keys helper
const RW={
 sword:{idle:{ua:105,fa:40,ufa:75,ffa:100,d:-50},trail:[250,380],shout:[120,650],
  ua:[[0,105],[150,-110,"outQ"],[230,-120],[300,20,"inQ"],[380,60,"outQ"],[650,55],[950,105,"io"]],
  fa:[[0,40],[150,-150,"outQ"],[230,-165],[300,-5,"inQ"],[380,70,"outQ"],[650,60],[950,40,"io"]],
  d:[[0,-50],[150,-170,"outQ"],[230,-185],[300,-10,"inQ"],[380,80,"outQ"],[650,70],[950,-50,"io"]],
  ufa:[[0,75],[230,40],[300,120,"inQ"],[950,75,"io"]],ffa:[[0,100],[230,10],[300,150,"inQ"],[950,100,"io"]],
  lean:[[0,0],[150,-8],[230,-10],[300,10,"inQ"],[380,14],[650,6],[950,0,"io"]],
  x:[[0,0],[170,-.03,"outQ"],[270,.22,"inQ"],[580,.21],[950,0,"outC"]],
  legN:[[0,0],[230,10],[300,25,"inQ"],[650,20],[950,0,"io"]],legF:[[0,0],[230,-5],[300,-25,"inQ"],[650,-20],[950,0,"io"]]},
 hammer:{idle:{ua:150,fa:-60,ufa:75,ffa:100,d:-95},trail:[400,500],shout:[100,800],
  ua:[[0,150],[120,-120,"outQ"],[380,-150,"outQ"],[480,40,"inQ"],[560,55],[820,50],[1080,150,"io"]],
  fa:[[0,-60],[120,-130,"outQ"],[380,-170,"outQ"],[480,60,"inQ"],[560,75],[820,70],[1080,-60,"io"]],
  d:[[0,-95],[120,-140,"outQ"],[380,-190,"outQ"],[480,70,"inQ"],[560,80],[820,72],[1080,-95,"io"]],
  ufa:[[0,75],[120,-110,"outQ"],[380,-140],[480,30,"inQ"],[820,40],[1080,75,"io"]],ffa:[[0,100],[120,-140,"outQ"],[380,-165],[480,50,"inQ"],[820,60],[1080,100,"io"]],
  lean:[[0,0],[380,-14,"outQ"],[480,16,"inQ"],[820,8],[1080,0,"io"]],
  x:[[0,0],[330,-.04,"outQ"],[440,.2,"inQ"],[760,.19],[1080,0,"outC"]],y:[[0,0],[330,-.035,"outQ"],[420,-.07,"outQ"],[480,0,"inQ"]],
  sq:[[0,0],[300,-.06],[440,.05],[500,-.12,"outQ"],[680,0,"outBack"]],
  legN:[[0,0],[380,-10],[480,25,"inQ"],[820,20],[1080,0,"io"]],legF:[[0,0],[380,10],[480,-25,"inQ"],[820,-20],[1080,0,"io"]]},
 trident:{idle:{ua:120,fa:80,ufa:75,ffa:100,d:-90},trail:[230,330],shout:[150,700],
  ua:[[0,120],[90,150,"outQ"],[210,175,"outQ"],[300,5,"inQ"],[380,0],[760,40],[1000,120,"io"]],
  fa:[[0,80],[90,15,"outQ"],[210,20],[300,-2,"inQ"],[380,-2],[760,10],[1000,80,"io"]],
  d:[[0,-90],[90,-8,"outQ"],[210,-12],[300,-2,"inQ"],[860,-4],[1000,-90,"io"]],
  ufa:[[0,75],[90,20,"outQ"],[210,60],[300,-10,"inQ"],[760,20],[1000,75,"io"]],ffa:[[0,100],[90,0,"outQ"],[210,0],[300,-5,"inQ"],[760,0],[1000,100,"io"]],
  lean:[[0,0],[210,-6],[300,10,"inQ"],[760,4],[1000,0,"io"]],
  x:[[0,0],[210,-.03,"outQ"],[300,.16,"inQ"],[620,.15],[950,0,"outC"]],
  legN:[[0,0],[210,5],[300,25,"inQ"],[700,20],[1000,0,"io"]],legF:[[0,0],[300,-25,"inQ"],[700,-20],[1000,0,"io"]]},
 staff:{idle:{ua:120,fa:80,ufa:75,ffa:100,d:-90},trail:[480,560],shout:[100,800],open:[100,950],
  ua:[[0,120],[110,-110,"outQ"],[440,-120,"io"],[530,-20,"inQ"],[900,-10],[1060,120,"io"]],
  fa:[[0,80],[110,-95,"outQ"],[440,-100],[530,-25,"inQ"],[900,-20],[1060,80,"io"]],
  d:[[0,-90],[110,-90],[440,-105,"io"],[530,-30,"inQ"],[900,-35],[1060,-90,"io"]],
  ufa:[[0,75],[110,10,"outQ"],[530,-5],[900,0],[1060,75,"io"]],ffa:[[0,100],[110,-10,"outQ"],[530,-15],[900,-10],[1060,100,"io"]],
  lean:[[0,0],[440,-5],[530,6,"inQ"],[1060,0,"io"]],x:[[0,0],[480,-.025,"io"],[560,.04,"outQ"],[1000,0,"io"]]},
 bow:{idle:{ua:110,fa:60,ufa:75,ffa:100,d:60},shout:[300,700],
  ua:[[0,110],[110,-5,"outQ"],[820,-5],[960,110,"io"]],fa:[[0,60],[110,-8,"outQ"],[820,-8],[960,60,"io"]],d:[[0,60],[110,90,"outQ"],[820,90],[960,60,"io"]],
  ufa:[[0,75],[110,150,"outQ"],[470,185,"io"],[520,160,"outQ"],[820,160],[960,75,"io"]],ffa:[[0,100],[110,-5,"outQ"],[470,5],[520,-10],[820,-10],[960,100,"io"]],
  lean:[[0,0],[470,-3],[520,-7,"outQ"],[900,0,"io"]],x:[[0,0],[470,-.03,"io"],[520,-.06,"outQ"],[900,0,"io"]]}
};
const HR={tipPrev:null,midPrev:null};
function heroRigFrame(t){
  const h=S.hero,dt=h.act?t-h.t0:1e9,R=RW[WSEL],w=WPN[WSEL];const id=R.idle;
  const f={x:0,y:0,r:0,sq:0,lean:0,ua:id.ua,fa:id.fa,ufa:id.ufa,ffa:id.ffa,d:id.d,legN:0,legF:0,head:"h-head",flash:0,open:false,weapon:true,dt};
  const br=reduce?0:Math.sin(t*2*Math.PI/1700);
  if(h.act==="atk"){for(const k of ["x","y","sq","lean","ua","fa","ufa","ffa","d","legN","legF"]) if(R[k]) f[k]=sampleNum(R[k],dt);
    if(R.shout&&dt>R.shout[0]&&dt<R.shout[1])f.head="h-head-shout";
    if(R.open&&dt>R.open[0]&&dt<R.open[1])f.open=true;
    if(dt>R.ua[R.ua.length-1][0]+80)h.act=null;}
  else if(h.act==="hurt"){f.x=sampleNum([[0,0],[70,-.07,"outQ"],[600,0,"outBack"]],dt);f.lean=sampleNum([[0,0],[70,-14,"outQ"],[600,0,"outBack"]],dt);
    f.ua+=sampleNum([[0,0],[80,-60,"outQ"],[600,0,"io"]],dt);f.ufa+=sampleNum([[0,0],[80,50,"outQ"],[600,0,"io"]],dt);f.ffa+=sampleNum([[0,0],[80,70,"outQ"],[600,0,"io"]],dt);
    f.legN=sampleNum([[0,0],[80,14],[600,0]],dt);f.legF=sampleNum([[0,0],[80,8],[600,0]],dt);
    f.flash=sampleNum([[0,1],[200,0]],dt);if(dt<520)f.head="h-head-hurt";if(dt>650)h.act=null;}
  else if(h.act==="win"){if(h.winT==null)h.winT=t;const T0=h.winT;const k=clamp((t-T0)/300);const hop=Math.abs(Math.sin((t-T0)/200))*(t-T0<1300?1:0);
    f.ua=id.ua+(-100-id.ua)*k;f.fa=id.fa+(-115-id.fa)*k;f.d=id.d+(-80-id.d)*k;f.ufa=75+(-60-75)*k;f.ffa=100+(-90-100)*k;f.y=-hop*.03;f.head="h-head-happy";}
  // idle breathing
  f.sq+=.012*br;f.ua+=2*br;f.ufa-=2*br;
  return f;
}
function heroRigPose(f){const lean=f.lean;
  return {root:{x:0,y:0,r:f.r,sx:-f.sq*.5,sy:f.sq},hips:{r:lean},head:{r:-lean*.4},
    armNu:{r:f.ua-REST_A.ua-lean},armNl:{r:(f.fa-REST_A.fa)-(f.ua-REST_A.ua)},
    armFu:{r:f.ufa-REST_A.ufa-lean},armFl:{r:(f.ffa-REST_A.ffa)-(f.ufa-REST_A.ufa)},
    legN:{r:f.legN},legF:{r:f.legF}};}
const heroOff=document.createElement("canvas");
function drawHeroRig(t){
  const f=heroRigFrame(t),w=WPN[WSEL],R=RW[WSEL];
  const k=Wd*.30/842; // figure height
  const sx=L.hx+f.x*Wd, sy=L.gy+f.y*Wd;
  if(heroOff.width!==hc.width){heroOff.width=hc.width;heroOff.height=hc.height}
  const c=heroOff.getContext("2d");c.setTransform(1,0,0,1,0,0);c.clearRect(0,0,heroOff.width,heroOff.height);
  const base=new DOMMatrix().scale(DPR,DPR).translate(sx,sy).scale(k,k).translate(-HP.feet[0],-HP.feet[1]);
  const M=rigMats(HB,heroRigPose(f));
  H.left=sx-Wd*.18;H.B=Wd*.36;
  drawPart(c,base,M.armFl,"h-armFl");
  if(f.open){const T=new DOMMatrix().translate(HP.elF[0],HP.elF[1]).rotate(REST_A.ffa-REST_A.fa).translate(-HP.elN[0],-HP.elN[1]);
    c.setTransform(base.multiply(M.armFl).multiply(T));const o=PM["h-armNl-open"];c.drawImage(IM["h-armNl-open"],o[0],o[1]);}
  drawPart(c,base,M.armFu,"h-armFu");
  drawPart(c,base,M.legF,"h-legF");drawPart(c,base,M.legN,"h-legN");
  drawPart(c,base,M.hips,"h-torso");drawPart(c,base,M.head,f.head);
  // weapon in the near fist (drawn under the forearm so the fist wraps it)
  const gm=base.multiply(M.armNl),gp=gm.transformPoint(new DOMPoint(HP.gripN[0],HP.gripN[1]));
  const hand=[gp.x/DPR,gp.y/DPR];let tip=null,mid=null;
  const [gx,gy,Lw]=w.grip,B=Wd*.36;
  c.setTransform(1,0,0,1,0,0);c.translate(gp.x,gp.y);c.scale(DPR,DPR);c.rotate((f.d+45)*D2R);
  { const m=c.getTransform(),P=(lx,ly)=>{const p=m.transformPoint(new DOMPoint(lx,ly));return [p.x/DPR,p.y/DPR]};
    tip=P((w.tip[0]-gx)*Lw*B,(w.tip[1]-gy)*Lw*B);mid=P((w.tip[0]-gx)*Lw*B*.45,(w.tip[1]-gy)*Lw*B*.45);
    c.drawImage(IM[w.img],-gx*Lw*B,-gy*Lw*B,Lw*B,Lw*B); }
  drawPart(c,base,M.armNu,"h-armNu");drawPart(c,base,M.armNl,"h-armNl");
  // bow: string pulled back to the far fist + arrow
  if(w.draw&&S.hero.act==="atk"&&f.dt>=w.draw[0]&&f.dt<w.draw[1]){const fp=base.multiply(M.armFl).transformPoint(new DOMPoint(HP.gripF[0],HP.gripF[1]));
    const bx=hand[0],by=hand[1],qx=fp.x/DPR,qy=fp.y/DPR;c.setTransform(DPR,0,0,DPR,0,0);c.lineCap="round";
    c.strokeStyle="#e8d8b0";c.lineWidth=1.5;c.beginPath();c.moveTo(bx,by-Wd*.07);c.lineTo(qx,qy);c.lineTo(bx,by+Wd*.07);c.stroke();
    c.strokeStyle="#5a3a22";c.lineWidth=3;c.beginPath();c.moveTo(qx,qy);c.lineTo(bx+Wd*.04,by);c.stroke();
    c.fillStyle=w.col[1];c.beginPath();c.moveTo(bx+Wd*.06,by);c.lineTo(bx+Wd*.035,by-Wd*.012);c.lineTo(bx+Wd*.035,by+Wd*.012);c.fill();
    const k2=clamp((f.dt-w.draw[0])/(w.draw[1]-w.draw[0]-60));if(k2>.6&&!reduce){c.globalAlpha=(k2-.6)*2.5;c.fillStyle=w.col[0];c.beginPath();c.arc(bx+Wd*.05,by,Wd*.014*(1+.3*Math.sin(t*.05)),0,7);c.fill();c.globalAlpha=1}}
  // flash
  if(f.flash>0){c.setTransform(1,0,0,1,0,0);c.globalCompositeOperation="source-atop";c.fillStyle=`rgba(255,255,255,${f.flash*.75})`;c.fillRect(0,0,heroOff.width,heroOff.height);c.globalCompositeOperation="source-over";}
  const hc2=hc.getContext("2d");hc2.setTransform(1,0,0,1,0,0);hc2.clearRect(0,0,hc.width,hc.height);hc2.drawImage(heroOff,0,0);
  // trail / staff orb / projectiles (shared with the other mode)
  if(tip&&R.trail&&S.hero.act==="atk"&&f.dt>=R.trail[0]&&f.dt<=R.trail[1]&&HR.tipPrev&&Math.hypot(tip[0]-HR.tipPrev[0],tip[1]-HR.tipPrev[1])<Wd*.14) S.trail.push({a:HR.midPrev,b:HR.tipPrev,c:mid,d:tip,t:0,col:w.col});
  HR.tipPrev=tip;HR.midPrev=mid;
  if(w.charge&&S.hero.act==="atk"&&f.dt>=w.charge[0]&&f.dt<w.charge[1]){const k3=clamp((f.dt-w.charge[0])/(w.charge[1]-w.charge[0]));H.orb={x:tip[0],y:tip[1],r:B*(.03+.08*k3)};
    if(Math.random()<.7&&!reduce){const a=Math.random()*7,Rr=B*.35;S.parts.push({x:tip[0]+Math.cos(a)*Rr,y:tip[1]+Math.sin(a)*Rr,vx:-Math.cos(a)*Rr*3.2,vy:-Math.sin(a)*Rr*3.2,life:0,max:.28,sz:2.2,c:w.col[1],g:0,glow:1})}}
  else H.orb=null;
  if(w.shoot&&S.hero.act==="atk"&&f.dt>=w.shoot[0]&&!S.hero.shot){S.hero.shot=true;const from=w.draw?[hand[0]+Wd*.05,hand[1]]:tip;
    S.proj.push({x0:from[0],y0:from[1],x1:L.wx-Wd*.04,y1:L.gy-Wd*.2,t:0,dur:(w.shoot[1]-w.shoot[0])/1000,kind:w.draw?"arrow":"orb",col:w.col,hist:[]});}
  H.rigBones=S.showBones?HB.map(b=>{const p=base.multiply(M[b.n]).transformPoint(new DOMPoint(b.p[0],b.p[1]));return [p.x/DPR,p.y/DPR,b.par?(()=>{const q=base.multiply(M[b.par]).transformPoint(new DOMPoint(HB.find(x=>x.n===b.par).p[0],HB.find(x=>x.n===b.par).p[1]));return [q.x/DPR,q.y/DPR]})():null]}):null;
}
// ---- wolf ----
const WB=[{n:"root",p:WP.feet},{n:"body",p:WP.body,par:"root"},{n:"head",p:WP.head,par:"body"},{n:"tail",p:WP.tail,par:"body"},
  {n:"legBN",p:WP.legBN,par:"root"},{n:"legBF",p:WP.legBF,par:"root"},{n:"legFN",p:WP.legFN,par:"root"},{n:"legFF",p:WP.legFF,par:"root"}];
const WLEG={atk:[[0,[0,0]],[300,[10,-8]],[400,[-38,30]],[480,[-20,18]],[1050,[0,0]]],
  hit:[[0,[0,0]],[70,[14,-12]],[220,[-6,6]],[700,[0,0]]],
  ko:[[0,[0,0]],[80,[16,-14]],[380,[-6,8]],[900,[-30,34]]]};
function wolfLegs(act,d){if(!act||!WLEG[act])return [0,0];const ks=WLEG[act];
  const a=sampleNum(ks.map(k=>[k[0],k[1][0],k[2]||"io"]),d),b=sampleNum(ks.map(k=>[k[0],k[1][1],k[2]||"io"]),d);return [a,b];}
let wolfPts=null;const wolfOff=document.createElement("canvas");
function wolfEmberPts(){wolfPts=[];for(const [nm,bone] of [["w-tail","tail"],["w-head","head"]]){const im=IM[nm],o=PM[nm];const oc=document.createElement("canvas");oc.width=im.width;oc.height=im.height;const x=oc.getContext("2d");x.drawImage(im,0,0);
  let d;try{d=x.getImageData(0,0,im.width,im.height).data}catch(e){continue}
  for(let i=0;i<500&&wolfPts.length<400;i++){const px=(Math.random()*im.width)|0,py=(Math.random()*im.height*.6)|0;if(d[(py*im.width+px)*4+3]>200)wolfPts.push([px+o[0],py+o[1],bone])}}}
function drawWolfRig(meshPose,t,u,w){
  // reuse the mesh keyframes: bones root/body/head/tail map 1:1 (mesh was 512px, parts are 1024px)
  const P=n=>{const i=BONES.findIndex(b=>b.n===n),c=meshPose[i];return {x:c[0]*2,y:c[1]*2,r:c[2]/D2R,sx:c[3],sy:c[4]}};
  const d=w.act?t-w.t0:0,[lf,lb]=w.ko&&!w.act?wolfLegs("ko",900):wolfLegs(w.act,d);
  const tail=P("tail"),t2=P("tail2");tail.r+=t2.r*.6;
  const pose={root:P("root"),body:P("body"),head:P("head"),tail,legFN:{r:lf},legFF:{r:lf*.8},legBN:{r:lb},legBF:{r:lb*.8}};
  const k=Wd*.52/IW*.5; // mesh drew 512px at Wd*.52; parts are 1024px
  const base=new DOMMatrix().scale(DPR,DPR).translate(L.wx,L.gy).scale(-k,k).translate(-WP.feet[0],-WP.feet[1]);
  const M=rigMats(WB,pose);lastWolfRig={base,M};
  if(wolfOff.width!==pc.width){wolfOff.width=pc.width;wolfOff.height=pc.height}
  const c=wolfOff.getContext("2d");c.setTransform(1,0,0,1,0,0);c.clearRect(0,0,wolfOff.width,wolfOff.height);
  const head=(w.act==="hit"&&d<450)||w.ko?"w-head-hurt":(w.act==="atk"&&d>200&&d<700)?"w-head-angry":"w-head";
  drawPart(c,base,M.legBF,"w-leg-back-far");drawPart(c,base,M.legFF,"w-leg-front-far");drawPart(c,base,M.tail,"w-tail");drawPart(c,base,M.body,"w-body");
  drawPart(c,base,M.legBN,"w-leg-back-near");drawPart(c,base,M.legFN,"w-leg-front-near");drawPart(c,base,M.head,head);
  c.setTransform(1,0,0,1,0,0);
  c.globalCompositeOperation="source-atop";
  if(u.g>0){c.fillStyle=`rgba(96,92,90,${u.g*.72})`;c.fillRect(0,0,wolfOff.width,wolfOff.height)}
  if(u.r>0){c.fillStyle=`rgba(255,70,50,${u.r})`;c.fillRect(0,0,wolfOff.width,wolfOff.height)}
  if(u.f>0){c.fillStyle=`rgba(255,255,255,${u.f})`;c.fillRect(0,0,wolfOff.width,wolfOff.height)}
  c.globalCompositeOperation="source-over";
  const pc2=pc.getContext("2d");pc2.setTransform(1,0,0,1,0,0);pc2.clearRect(0,0,pc.width,pc.height);pc2.globalAlpha=u.a;pc2.drawImage(wolfOff,0,0);pc2.globalAlpha=1;
}
let lastWolfRig=null;
function wolfRigEmber(){if(!wolfPts)wolfEmberPts();if(!wolfPts.length||!lastWolfRig)return;const [x,y,b]=wolfPts[(Math.random()*wolfPts.length)|0];
  const p=lastWolfRig.base.multiply(lastWolfRig.M[b]).transformPoint(new DOMPoint(x,y));
  S.parts.push({x:p.x/DPR,y:p.y/DPR,vx:(Math.random()-.5)*14,vy:-20-Math.random()*30,life:0,max:.9+Math.random()*.8,sz:1.5+Math.random()*2.2,c:Math.random()<.6?"#FFB347":"#FF6B3D",g:-10,glow:1})}
function drawRigBones(c){if(!lastWolfRig)return;c.setTransform(DPR,0,0,DPR,0,0);
  const pts=WB.map(b=>{const p=lastWolfRig.base.multiply(lastWolfRig.M[b.n]).transformPoint(new DOMPoint(b.p[0],b.p[1]));return [p.x/DPR,p.y/DPR,b.par]});
  c.strokeStyle="#FFD54A";c.lineWidth=3;WB.forEach((b,i)=>{if(!b.par)return;const j=WB.findIndex(x=>x.n===b.par);c.beginPath();c.moveTo(pts[j][0],pts[j][1]);c.lineTo(pts[i][0],pts[i][1]);c.stroke()});
  pts.forEach(([x,y])=>{c.fillStyle="#FFD54A";c.beginPath();c.arc(x,y,5,0,7);c.fill();c.strokeStyle="#1B2421";c.lineWidth=1.5;c.stroke()});
  if(H.rigBones){c.strokeStyle="#7fe3ff";c.lineWidth=3;H.rigBones.forEach(([x,y,p])=>{if(p){c.beginPath();c.moveTo(p[0],p[1]);c.lineTo(x,y);c.stroke()}});
    H.rigBones.forEach(([x,y])=>{c.fillStyle="#7fe3ff";c.beginPath();c.arc(x,y,4.5,0,7);c.fill();c.strokeStyle="#1B2421";c.lineWidth=1.5;c.stroke()});}}
