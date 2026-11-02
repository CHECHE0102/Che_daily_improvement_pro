import numpy as np, cv2, json
from PIL import Image
S='/mnt/user-data/uploads/sidejob/picture/anim-hero/'
M=np.asarray(Image.open(S+'00-hero-tpose.png').convert('RGBA')).copy()
H,W=M.shape[:2]; yy,xx=np.mgrid[0:H,0:W].astype(np.float32)
al=M[...,3]>8
def arm(S0,F,t_sh,t_el,nlim_in,side):
    d=np.array(F,np.float32)-S0; d/=np.linalg.norm(d); n=np.array([d[1],-d[0]])
    rx,ry=xx-S0[0],yy-S0[1]; t=rx*d[0]+ry*d[1]; nn=rx*n[0]+ry*n[1]
    # 'side' = sign of n pointing toward the torso
    tor=nn*side
    ok=al&(t>t_sh)&(np.abs(nn)<95)&~((t<115)&(tor>nlim_in))
    up=ok&(t<=t_el); lo=ok&(t>t_el)
    return up,lo
# near arm (screen-left), far arm (screen-right)
nu,nl=arm(np.array([395,575],np.float32),(268,698),31,96,40,1)
fu,fl=arm(np.array([655,575],np.float32),(763,705),22,78,40,-1)
# check torso side sign by sampling
hem=np.interp(xx,[300,330,400,470,520,560,620,700,760],[720,735,742,765,778,770,750,742,730])
legs=al&(yy>hem)&~(nu|nl|fu|fl)
legN=legs&(xx<540); legF=legs&(xx>=540)
torso=al&~(nu|nl|fu|fl|legs)
parts=dict(armNu=nu,armNl=nl,armFu=fu,armFl=fl,legN=legN,legF=legF,torso=torso)
dbg=np.zeros((H,W,3),np.uint8)+200
cols=dict(armNu=(255,80,80),armNl=(255,180,0),armFu=(80,80,255),armFl=(0,200,255),legN=(80,200,80),legF=(0,120,0),torso=(160,160,160))
for k,m in parts.items(): dbg[m]=(np.array(cols[k])*0.6+M[m][:,:3]*0.4).astype(np.uint8)
Image.fromarray(dbg).save('hcut.png')
np.savez_compressed('hmasks.npz',**parts)
