import numpy as np, cv2
from PIL import Image
def rgba(p): return np.asarray(Image.open(p).convert('RGBA'))
def comp(a,bg=128):
    al=a[...,3:4]/255.; return (a[...,:3]*al+bg*(1-al)).astype(np.float32)
def xform(crop,s,r,fl):
    c=crop[:, ::-1] if fl else crop
    h,w=c.shape[:2]; M=cv2.getRotationMatrix2D((w/2,h/2),r,s)
    cos,sin=abs(M[0,0]),abs(M[0,1]); nw=int(h*sin+w*cos)+2; nh=int(h*cos+w*sin)+2
    M[0,2]+=nw/2-w/2; M[1,2]+=nh/2-h/2
    return cv2.warpAffine(c,M,(nw,nh),flags=cv2.INTER_LINEAR,borderValue=(0,0,0,0)),M
def search(master,part,scales,rots,flips=(False,),D=4,region=None):
    m=comp(master); mh=master.shape[0]
    ys,xs=np.where(part[...,3]>128); x0,y0,x1,y1=xs.min(),ys.min(),xs.max()+1,ys.max()+1
    crop=part[y0:y1,x0:x1]
    ms=cv2.resize(m,(mh//D,mh//D),interpolation=cv2.INTER_AREA)
    best=(1e18,)
    for fl in flips:
      for r in rots:
        for s in scales:
            t,_=xform(crop,s/D,r,fl)
            if t.shape[0]>=ms.shape[0] or t.shape[1]>=ms.shape[1] or t.shape[0]<4: continue
            msk=(t[...,3]>128).astype(np.float32)
            if msk.sum()<10: continue
            tc=comp(t)
            res=cv2.matchTemplate(ms,tc,cv2.TM_SQDIFF,mask=np.dstack([msk]*3))/msk.sum()
            mn,_,loc,_=cv2.minMaxLoc(res)
            if mn<best[0]: best=(mn,s,r,fl,loc[0]*D,loc[1]*D)
    return best,(x0,y0,x1,y1)
def refine(master,part,b,box,D=2):
    mn,s,r,fl,X,Y=b
    sc=np.linspace(s*.95,s*1.05,7); ro=[r-2,r-1,r,r+1,r+2]
    m=comp(master); x0,y0,x1,y1=box; crop=part[y0:y1,x0:x1]
    ms=cv2.resize(m,(1024//D,1024//D),interpolation=cv2.INTER_AREA); best=(1e18,)
    for ss in sc:
        for rr in ro:
            t,_=xform(crop,ss/D,rr,fl); msk=(t[...,3]>128).astype(np.float32); tc=comp(t)
            res=cv2.matchTemplate(ms,tc,cv2.TM_SQDIFF,mask=np.dstack([msk]*3))/msk.sum()
            mn2,_,loc,_=cv2.minMaxLoc(res)
            if mn2<best[0]: best=(mn2,ss,rr,fl,loc[0]*D,loc[1]*D)
    return best
def render(part,b,box):
    mn,s,r,fl,X,Y=b; x0,y0,x1,y1=box
    t,_=xform(part[y0:y1,x0:x1],s,r,fl)
    out=np.zeros((1024,1024,4),np.uint8); h,w=t.shape[:2]
    ox,oy=int(X),int(Y); sx0,sy0=max(0,-ox),max(0,-oy); dx0,dy0=max(0,ox),max(0,oy)
    ww=min(w-sx0,1024-dx0); hh=min(h-sy0,1024-dy0)
    out[dy0:dy0+hh,dx0:dx0+ww]=t[sy0:sy0+hh,sx0:sx0+ww]; return out
