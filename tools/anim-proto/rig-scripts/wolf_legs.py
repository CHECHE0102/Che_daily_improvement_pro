import numpy as np, cv2, json
from PIL import Image
S='/mnt/user-data/uploads/sidejob/picture/anim-firewolf/'
def paws(a):
    r,g,b,al=[a[...,i].astype(int) for i in range(4)]
    m=((al>200)&(r>45)&(r<140)&(r-b>12)&(g<110)&(r-g>5)&(r-g<45)).astype(np.uint8)
    m=cv2.morphologyEx(m,cv2.MORPH_OPEN,np.ones((5,5),np.uint8)); m=cv2.dilate(m,np.ones((19,19),np.uint8))
    n,lab,st,cen=cv2.connectedComponentsWithStats(m)
    comps=[(st[i],cen[i]) for i in range(1,n) if st[i][4]>800]
    return comps
M=np.asarray(Image.open(S+'00-firewolf-full.png').convert('RGBA'))
mp=sorted([c for c in paws(M) if c[1][1]>780],key=lambda c:c[1][0])
for st,c in mp: print('master paw',st,c)
legs=['05-leg-back-near','02-leg-back-far','06-leg-front-near','03-leg-front-far']
out={}
for i,l in enumerate(legs):
    P=np.asarray(Image.open(S+l+'.png').convert('RGBA'))
    pp=sorted([c for c in paws(P) if c[1][1]>700],key=lambda c:-c[0][4])
    st,c=pp[0]; tst,tc=mp[i]
    s=tst[2]/st[2]
    # place: scale about paw bottom-centre, move to target paw bottom-centre
    src=(st[0]+st[2]/2, st[1]+st[3]); dst=(tst[0]+tst[2]/2, tst[1]+tst[3])
    A=np.array([[s,0,dst[0]-s*src[0]],[0,s,dst[1]-s*src[1]]],np.float32)
    W=cv2.warpAffine(P,A,(1024,1024),flags=cv2.INTER_LINEAR,borderValue=(0,0,0,0))
    Image.fromarray(W).save(f'aligned/anim-firewolf-{l}.png'); out[l]=dict(scale=float(s),paw=[float(x) for x in dst]); print(l,st,s)
json.dump(out,open('wolf_legs.json','w'),indent=1)
