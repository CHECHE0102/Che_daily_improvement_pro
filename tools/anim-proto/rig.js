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
const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]),ang=(a,b)=>Math.atan2(b[1]-a[1],b[0]-a[0])/D2R;
const ARM={N:{sh:HP.shN,a:dist(HP.shN,HP.elN),b:dist(HP.elN,HP.gripN),ru:ang(HP.shN,HP.elN),rf:ang(HP.elN,HP.gripN)},
           F:{sh:HP.shF,a:dist(HP.shF,HP.elF),b:dist(HP.elF,HP.gripF),ru:ang(HP.shF,HP.elF),rf:ang(HP.elF,HP.gripF)}};
// 2-bone IK: shoulder S, target T -> absolute upper/forearm angles (deg). Elbow is kept on the lower side.
const STMAX=1.75;
function ik(S,T,a0,b0,up){let dx=T[0]-S[0],dy=T[1]-S[1],d=Math.hypot(dx,dy);const th=Math.atan2(dy,dx);const st=Math.max(1,Math.min(STMAX,d/(a0+b0-.5)));const a=a0*st,b=b0*st;d=Math.max(Math.abs(a-b)+1,Math.min(a+b-.5,d));
  const A=Math.acos(Math.max(-1,Math.min(1,(a*a+d*d-b*b)/(2*a*d))));let best=null;
  for(const s of [1,-1]){const u=th+s*A,E=[S[0]+a*Math.cos(u),S[1]+a*Math.sin(u)];const H=[S[0]+d*Math.cos(th),S[1]+d*Math.sin(th)];
    const c={ua:u/D2R,fa:Math.atan2(H[1]-E[1],H[0]-E[0])/D2R,ey:E[1],st,E};if(!best||(up?c.ey<best.ey:c.ey>best.ey))best=c;}
  return best;}
// keyframes: [t, value(s), ease]. P(...) = [hx,hy,d]  (main hand target in body space, weapon tip direction)
const RW={
 sword:{impact:300,trail:[250,380],shout:[150,620],main:"N",
  hand:[[0,[480,690,-25]],[180,[420,335,-122],"outQ"],[235,[414,322,-130]],[300,[700,610,-8],"inQ"],[360,[650,770,80],"outQ"],[620,[630,750,70]],[950,[480,690,-25],"io"]],
  far:[[0,[720,700]],[180,[800,560],"outQ"],[300,[600,720],"inQ"],[620,[620,720]],[950,[720,700],"io"]],
  lean:[[0,0],[180,-18,"outQ"],[235,-20],[300,22,"inQ"],[360,28,"outQ"],[620,14],[950,0,"io"]],
  x:[[0,0],[180,-.05,"outQ"],[235,-.05],[300,.26,"inQ"],[620,.25],[950,0,"outC"]],
  y:[[0,0],[180,-.025,"outQ"],[300,0,"inQ"]],
  sq:[[0,0],[180,-.05],[300,.04],[360,-.07],[600,0]],
  legN:[[0,0],[180,-10],[300,30,"inQ"],[620,24],[950,0,"io"]],legF:[[0,0],[180,12],[300,-32,"inQ"],[620,-26],[950,0,"io"]]},
 hammer:{impact:600,trail:[548,615],shout:[200,950],main:"N",two:75,
  hand:[[0,[520,720,75]],[200,[490,700,130],"io"],[480,[440,300,222],"outQ"],[540,[436,290,228]],[600,[690,735,415],"inQ"],[640,[695,745,420]],[900,[690,740,418]],[1300,[520,720,435],"io"]],
  lean:[[0,0],[200,-6],[480,-22,"outQ"],[540,-24],[600,32,"inQ"],[640,34],[900,24],[1300,0,"io"]],
  x:[[0,0],[200,.04,"io"],[480,.1],[540,.11],[600,.22,"inQ"],[900,.22],[1300,0,"io"]],
  y:[[0,0],[200,.01],[420,-.03,"outQ"],[540,-.075,"outQ"],[600,0,"inQ"]],
  sq:[[0,0],[200,.04],[480,-.06],[540,-.07],[600,-.16,"inQ"],[650,-.18],[760,.03],[900,-.02],[1300,0]],
  legN:[[0,0],[200,6],[480,-14],[600,32,"inQ"],[900,26],[1300,0,"io"]],legF:[[0,0],[200,-6],[480,16],[600,-34,"inQ"],[900,-28],[1300,0,"io"]]},
 trident:{impact:300,trail:[220,320],shout:[150,700],main:"N",two:85,
  hand:[[0,[600,720,-55]],[200,[340,640,-8],"outQ"],[300,[740,620,-3],"inQ"],[380,[725,624,-3]],[760,[680,640,-5]],[1000,[600,720,-55],"io"]],
  lean:[[0,0],[200,-14,"outQ"],[300,22,"inQ"],[760,8],[1000,0,"io"]],
  x:[[0,0],[200,-.05,"outQ"],[300,.22,"inQ"],[760,.2],[1000,0,"outC"]],
  sq:[[0,0],[200,-.04],[300,.05,"inQ"],[380,-.03],[600,0]],
  legN:[[0,0],[200,-10],[300,32,"inQ"],[760,24],[1000,0,"io"]],legF:[[0,0],[200,10],[300,-34,"inQ"],[760,-26],[1000,0,"io"]]},
 staff:{impact:680,trail:[575,625],shout:[150,900],main:"N",charge:[150,560],shoot:[600,680],open:[150,1000],
  hand:[[0,[640,725,-70]],[250,[460,330,-92],"outQ"],[560,[455,318,-96]],[620,[720,560,-12],"inQ"],[900,[705,570,-16]],[1150,[640,725,-70],"io"]],
  far:[[0,[720,700]],[250,[720,420],"outQ"],[560,[725,410]],[620,[880,560],"inQ"],[900,[870,570]],[1150,[720,700],"io"]],
  lean:[[0,0],[250,-12,"outQ"],[560,-14],[620,18,"inQ"],[900,12],[1150,0,"io"]],
  x:[[0,0],[560,-.03],[620,.07,"inQ"],[1150,0,"io"]],
  y:[[0,0],[250,-.03,"outQ"],[560,-.045],[620,0,"inQ"]],
  sq:[[0,0],[250,-.05],[560,-.06],[620,.05,"inQ"],[700,0]],
  legN:[[0,0],[560,-6],[620,18,"inQ"],[900,14],[1150,0,"io"]],legF:[[0,0],[560,6],[620,-18,"inQ"],[900,-14],[1150,0,"io"]]},
 bow:{impact:740,shout:[250,760],main:"F",draw:[200,660],shoot:[660,740],grip:[.43,.47,.46],
  hand:[[0,[760,720,70]],[200,[900,575,90],"outQ"],[900,[900,575,90]],[1150,[760,720,70],"io"]],
  far:[[0,[470,680]],[200,[860,580],"outQ"],[600,[460,530],"outC"],[655,[455,526]],[700,[360,500],"outQ"],[900,[430,580]],[1150,[470,680],"io"]],
  lean:[[0,0],[200,-4],[600,-10],[660,-10],[700,-16,"outQ"],[1150,0,"io"]],
  x:[[0,0],[660,0],[700,-.05,"outQ"],[1150,0,"io"]],
  sq:[[0,0],[600,-.03],[700,.03],[900,0]],
  legN:[[0,0],[200,12],[1000,12],[1150,0,"io"]],legF:[[0,0],[200,-14],[1000,-14],[1150,0,"io"]]}
};
const IDLE_FAR=[720,700];
function sampleVec(keys,t){const n=keys[0][1].length,out=[];for(let i=0;i<n;i++)out.push(sampleNum(keys.map(k=>[k[0],k[1][i],k[2]]),t));return out;}
const HR={tipPrev:null,midPrev:null};
function heroRigFrame(t){
  const h=S.hero,dt=h.act?t-h.t0:1e9,R=RW[WSEL];
  const f={x:0,y:0,r:0,sq:0,lean:0,legN:0,legF:0,head:"h-head",flash:0,open:false,dt,phase:"idle"};
  let H=R.hand[0][1].slice(),FH=(R.far?R.far[0][1]:IDLE_FAR).slice();
  const br=reduce?0:Math.sin(t*2*Math.PI/1700);
  if(h.act==="atk"){f.phase="atk";H=sampleVec(R.hand,dt);if(R.far)FH=sampleVec(R.far,dt);
    for(const k of ["x","y","r","sq","lean","legN","legF"]) if(R[k]) f[k]=sampleNum(R[k],dt);
    if(R.shout&&dt>R.shout[0]&&dt<R.shout[1])f.head="h-head-shout";
    if(R.open&&dt>R.open[0]&&dt<R.open[1])f.open=true;
    if(dt>R.hand[R.hand.length-1][0]+80)h.act=null;}
  else if(h.act==="hurt"){f.x=sampleNum([[0,0],[70,-.07,"outQ"],[600,0,"outBack"]],dt);f.lean=sampleNum([[0,0],[70,-14,"outQ"],[600,0,"outBack"]],dt);
    const k=sampleNum([[0,0],[80,1,"outQ"],[600,0,"io"]],dt);H=[H[0]-60*k,H[1]-40*k,H[2]-40*k];FH=[FH[0]+30*k,FH[1]-60*k];
    f.legN=12*k;f.legF=8*k;f.flash=sampleNum([[0,1],[200,0]],dt);if(dt<520)f.head="h-head-hurt";if(dt>650)h.act=null;}
  else if(h.act==="win"){if(h.winT==null)h.winT=t;const T0=h.winT,k=E.outC(clamp((t-T0)/350));const hop=Math.abs(Math.sin((t-T0)/200))*(t-T0<1300?1:0);
    const up=R.main==="F"?[720,470,-80]:[430,470,-80];H=H.map((v,i)=>v+(up[i]-v)*k);FH=FH.map((v,i)=>v+((R.main==="F"?[440,480]:[680,470])[i]-v)*k);f.y=-hop*.03;f.head="h-head-happy";}
  H[1]+=3*br;f.sq+=.012*br;
  f.H=H;f.FH=FH;return f;
}
const heroOff=document.createElement("canvas");
function drawHeroRig(t){
  const f=heroRigFrame(t),w=WPN[WSEL],R=RW[WSEL];
  const k=Wd*.30/842,sx=L.hx+f.x*Wd,sy=L.gy+f.y*Wd;
  if(heroOff.width!==hc.width){heroOff.width=hc.width;heroOff.height=hc.height}
  const c=heroOff.getContext("2d");c.setTransform(1,0,0,1,0,0);c.clearRect(0,0,heroOff.width,heroOff.height);
  const base=new DOMMatrix().scale(DPR,DPR).translate(sx,sy).scale(k,k).translate(-HP.feet[0],-HP.feet[1]);
  // body-space shoulders after the lean
  const hipsL=new DOMMatrix().translate(HP.hips[0],HP.hips[1]).rotate(f.lean).translate(-HP.hips[0],-HP.hips[1]);
  const shp=p=>{const q=hipsL.transformPoint(new DOMPoint(p[0],p[1]));return [q.x,q.y]};
  const mainK=R.main,otherK=mainK==="N"?"F":"N",A1=ARM[mainK],A2=ARM[otherK];
  const s1=ik(shp(A1.sh),f.H,A1.a,A1.b),u=[Math.cos(f.H[2]*D2R),Math.sin(f.H[2]*D2R)];
  // second hand: on the handle (two-handed) or its own target
  let T2=f.FH;if(R.two&&f.phase!=="hurt"){const hand1=[s1.E[0]+A1.b*s1.st*Math.cos(s1.fa*D2R),s1.E[1]+A1.b*s1.st*Math.sin(s1.fa*D2R)];T2=[hand1[0]+u[0]*R.two,hand1[1]+u[1]*R.two];}
  const s2=ik(shp(A2.sh),T2,A2.a,A2.b);
  const ang={};ang["u"+mainK]=s1.ua;ang["f"+mainK]=s1.fa;ang["u"+otherK]=s2.ua;ang["f"+otherK]=s2.fa;
  const pose={root:{r:f.r,sx:-f.sq*.5,sy:f.sq},hips:{r:f.lean},head:{r:-f.lean*.4},
    armNu:{r:ang.uN-ARM.N.ru-f.lean},armNl:{r:(ang.fN-ARM.N.rf)-(ang.uN-ARM.N.ru)},
    armFu:{r:ang.uF-ARM.F.ru-f.lean},armFl:{r:(ang.fF-ARM.F.rf)-(ang.uF-ARM.F.ru)},legN:{r:f.legN},legF:{r:f.legF}};
  const M=rigMats(HB,pose);
  const dS=(a,k)=>new DOMMatrix().rotate(a).scale(k,1).rotate(-a);
  for(const [K,sol] of [[mainK,s1],[otherK,s2]]){const A=ARM[K],Sh=shp(A.sh),E=sol.E,el=K==="N"?HP.elN:HP.elF;
    M["arm"+K+"u"]=M.root.multiply(new DOMMatrix().translate(Sh[0],Sh[1]).rotate(sol.ua-A.ru).multiply(dS(A.ru,sol.st)).translate(-A.sh[0],-A.sh[1]));
    M["arm"+K+"l"]=M.root.multiply(new DOMMatrix().translate(E[0],E[1]).rotate(sol.fa-A.rf).multiply(dS(A.rf,sol.st)).translate(-el[0],-el[1]));}
  H.left=sx-Wd*.18;H.B=Wd*.36;
  const rootM=base.multiply(M.root),rootInv=M.root.inverse();
  const fistOf=(K)=>{const p=M[K==="N"?"armNl":"armFl"].transformPoint(new DOMPoint(...(K==="N"?HP.gripN:HP.gripF)));const q=rootInv.transformPoint(p);return [q.x,q.y]};
  const g1=fistOf(mainK),S_=w.grip[2]*1010,[gx,gy]=R.grip||w.grip;let tip=null,mid=null;const wb=[];
  const drawWeapon=()=>{c.setTransform(rootM);c.translate(g1[0],g1[1]);c.rotate((f.H[2]+45)*D2R);
    const m=c.getTransform(),P=(lx,ly)=>{const p=m.transformPoint(new DOMPoint(lx,ly));return [p.x/DPR,p.y/DPR]};
    tip=P((w.tip[0]-gx)*S_,(w.tip[1]-gy)*S_);mid=P((w.tip[0]-gx)*S_*.45,(w.tip[1]-gy)*S_*.45);
    const X=u=>-gx*S_+u*S_,Y=v=>-gy*S_+v*S_;
    if(WSEL==="bow"){ // hide the painted string, we draw our own
      const A=[.76,.26],B=[.33,.80],e=[B[0]-A[0],B[1]-A[1]],n=[-.78,-.62],o=.016,A2=[A[0]+n[0]*o-e[0]*3,A[1]+n[1]*o-e[1]*3],B2=[B[0]+n[0]*o+e[0]*3,B[1]+n[1]*o+e[1]*3];
      c.save();c.beginPath();c.moveTo(X(A2[0]),Y(A2[1]));c.lineTo(X(B2[0]),Y(B2[1]));c.lineTo(X(B2[0]+n[0]*3),Y(B2[1]+n[1]*3));c.lineTo(X(A2[0]+n[0]*3),Y(A2[1]+n[1]*3));c.closePath();c.clip();
      c.drawImage(IM[w.img],X(0),Y(0),S_,S_);c.restore();wb.push(P(X(A[0]),Y(A[1])),P(X(B[0]),Y(B[1])));}
    else c.drawImage(IM[w.img],X(0),Y(0),S_,S_);};
  const two=!!R.two;
  // draw order
  // A held weapon always sits in the same layer as the hand holding it (like a Spine weapon slot):
  // far arm/legs -> torso -> [far forearm + weapon] -> near arm -> head when raised.
  // It never goes behind the torso, so the hand and the blade can't end up on different sides of the body.
  const raised=false; // CheChe: weapon and hands may cover the face, keep them in front
  const farFront=two||mainK==="F";
  if(!farFront){drawPart(c,base,M.armFl,"h-armFl");if(f.open)openHand(c,base,M);}
  drawPart(c,base,M.armFu,"h-armFu");
  drawPart(c,base,M.legF,"h-legF");drawPart(c,base,M.legN,"h-legN");
  drawPart(c,base,M.hips,"h-torso");if(!raised)drawPart(c,base,M.head,f.head);
  if(mainK==="F"){drawPart(c,base,M.armFl,"h-armFl");drawWeapon();}
  else{drawWeapon();if(two)drawPart(c,base,M.armFl,"h-armFl");}
  drawPart(c,base,M.armNu,"h-armNu");drawPart(c,base,M.armNl,"h-armNl");
  if(raised)drawPart(c,base,M.head,f.head);
  // bow string + arrow
  if(WSEL==="bow"&&wb.length){const nh=fistOf("N"),nm=rootM.transformPoint(new DOMPoint(nh[0],nh[1])),hx=nm.x/DPR,hy=nm.y/DPR;
    const drawing=S.hero.act==="atk"&&f.dt>=R.draw[0]&&f.dt<R.draw[1];const [a,b]=wb;c.setTransform(DPR,0,0,DPR,0,0);c.lineCap="round";
    c.strokeStyle="#f3e6c4";c.lineWidth=1.6;c.beginPath();c.moveTo(a[0],a[1]);if(drawing)c.lineTo(hx,hy);c.lineTo(b[0],b[1]);c.stroke();
    if(drawing&&f.dt>R.draw[0]+80){const gp=rootM.transformPoint(new DOMPoint(g1[0],g1[1])),bx=gp.x/DPR,by=gp.y/DPR,an=Math.atan2(by-hy,bx-hx),Lr=Math.hypot(bx-hx,by-hy)+Wd*.05;
      c.save();c.translate(hx,hy);c.rotate(an);c.strokeStyle="#6b4527";c.lineWidth=3;c.beginPath();c.moveTo(0,0);c.lineTo(Lr,0);c.stroke();
      c.fillStyle="#d9d4c7";c.beginPath();c.moveTo(-2,0);c.lineTo(-Wd*.022,-Wd*.01);c.lineTo(-Wd*.014,0);c.lineTo(-Wd*.022,Wd*.01);c.fill();
      c.fillStyle=w.col[1];c.beginPath();c.moveTo(Lr+Wd*.028,0);c.lineTo(Lr,-Wd*.012);c.lineTo(Lr,Wd*.012);c.fill();
      const k2=clamp((f.dt-480)/180);if(k2>0&&!reduce){c.globalAlpha=k2;c.fillStyle=w.col[0];c.beginPath();c.arc(Lr+Wd*.012,0,Wd*.016*(1+.3*Math.sin(t*.05)),0,7);c.fill();c.globalAlpha=1}
      c.restore();H.arrowFrom=[hx+Math.cos(an)*Lr,hy+Math.sin(an)*Lr];}}
  if(f.flash>0){c.setTransform(1,0,0,1,0,0);c.globalCompositeOperation="source-atop";c.fillStyle=`rgba(255,255,255,${f.flash*.75})`;c.fillRect(0,0,heroOff.width,heroOff.height);c.globalCompositeOperation="source-over";}
  const hc2=hc.getContext("2d");hc2.setTransform(1,0,0,1,0,0);hc2.clearRect(0,0,hc.width,hc.height);hc2.drawImage(heroOff,0,0);
  const gS=tip?(()=>{const q=rootM.transformPoint(new DOMPoint(g1[0],g1[1]));return [q.x/DPR,q.y/DPR]})():null;
  if(tip&&R.trail&&S.hero.act==="atk"&&f.dt>=R.trail[0]&&f.dt<=R.trail[1]&&HR.prev){const P0=HR.prev,vt=[tip[0]-gS[0],tip[1]-gS[1]],vm=[mid[0]-gS[0],mid[1]-gS[1]];
    const a0=Math.atan2(P0.vt[1],P0.vt[0]),a1=Math.atan2(vt[1],vt[0]);let da=a1-a0;while(da>Math.PI)da-=2*Math.PI;while(da<-Math.PI)da+=2*Math.PI;
    const lt0=Math.hypot(...P0.vt),lt1=Math.hypot(...vt),lm0=Math.hypot(...P0.vm),lm1=Math.hypot(...vm),n=Math.max(1,Math.ceil(Math.abs(da)/.1));
    const at=k=>{const a=a0+da*k,g=[P0.g[0]+(gS[0]-P0.g[0])*k,P0.g[1]+(gS[1]-P0.g[1])*k],lt=lt0+(lt1-lt0)*k,lm=lm0+(lm1-lm0)*k;return [[g[0]+Math.cos(a)*lm,g[1]+Math.sin(a)*lm],[g[0]+Math.cos(a)*lt,g[1]+Math.sin(a)*lt]]};
    let pr=at(0);for(let i=1;i<=n;i++){const cu=at(i/n);S.trail.push({a:pr[0],b:pr[1],c:cu[0],d:cu[1],t:(1-i/n)*.02,col:w.col,ox:sx});pr=cu;}}
  HR.prev=tip?{g:gS,vt:[tip[0]-gS[0],tip[1]-gS[1]],vm:[mid[0]-gS[0],mid[1]-gS[1]]}:null;
  const B=Wd*.36;H.sx=sx;
  if(R.charge&&S.hero.act==="atk"&&f.dt>=R.charge[0]&&f.dt<R.charge[1]){const k3=clamp((f.dt-R.charge[0])/(R.charge[1]-R.charge[0]));H.orb={x:tip[0],y:tip[1],r:B*(.03+.08*k3)};
    if(Math.random()<.7&&!reduce){const a=Math.random()*7,Rr=B*.35;S.parts.push({x:tip[0]+Math.cos(a)*Rr,y:tip[1]+Math.sin(a)*Rr,vx:-Math.cos(a)*Rr*3.2,vy:-Math.sin(a)*Rr*3.2,life:0,max:.28,sz:2.2,c:w.col[1],g:0,glow:1})}}
  else H.orb=null;
  if(R.shoot&&S.hero.act==="atk"&&f.dt>=R.shoot[0]&&!S.hero.shot){S.hero.shot=true;const from=WSEL==="bow"?(H.arrowFrom||tip):tip;
    S.proj.push({x0:from[0],y0:from[1],x1:L.wx-Wd*.04,y1:L.gy-Wd*.2,t:0,dur:(R.shoot[1]-R.shoot[0])/1000,kind:WSEL==="bow"?"arrow":"orb",col:w.col,hist:[]});}
  H.rigBones=S.showBones?HB.map(b=>{const p=base.multiply(M[b.n]).transformPoint(new DOMPoint(b.p[0],b.p[1]));const pb=b.par&&HB.find(x=>x.n===b.par);const q=pb&&base.multiply(M[b.par]).transformPoint(new DOMPoint(pb.p[0],pb.p[1]));return [p.x/DPR,p.y/DPR,q?[q.x/DPR,q.y/DPR]:null]}):null;
}
function openHand(c,base,M){const T=new DOMMatrix().translate(HP.elF[0],HP.elF[1]).rotate(ARM.F.rf-ARM.N.rf).translate(-HP.elN[0],-HP.elN[1]);
  c.setTransform(base.multiply(M.armFl).multiply(T));const o=PM["h-armNl-open"];c.drawImage(IM["h-armNl-open"],o[0],o[1]);}
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
