import numpy as np, cv2, json, os
from PIL import Image, ImageDraw
SH='/mnt/user-data/uploads/sidejob/picture/anim-hero/'
os.makedirs('out',exist_ok=True)
M=np.asarray(Image.open(SH+'00-hero-tpose.png').convert('RGBA')).copy()
mk=np.load('hmasks.npz'); H,W=M.shape[:2]; yy,xx=np.mgrid[0:H,0:W]
OUT=(27,36,33,255)
def cap(img,c,r,col):
    d=ImageDraw.Draw(img); d.ellipse([c[0]-r-7,c[1]-r-7,c[0]+r+7,c[1]+r+7],fill=OUT); d.ellipse([c[0]-r,c[1]-r,c[0]+r,c[1]+r],fill=col)
def sample(c):
    x,y=int(c[0]),int(c[1]); a=M[y-4:y+5,x-4:x+5].reshape(-1,4); a=a[a[:,3]>200]; return tuple(int(v) for v in np.median(a,0)[:3])+(255,)
def part_from_mask(m,caps=()):
    im=Image.new('RGBA',(W,H))
    for c,r,col in caps: cap(im,c,r,col)
    a=M.copy(); a[~m]=0; im.alpha_composite(Image.fromarray(a)); return im
manifest={}
def save(name,im):
    a=np.asarray(im)[...,3]; ys,xs=np.where(a>24); x0,y0,x1,y1=xs.min(),ys.min(),xs.max()+1,ys.max()+1
    im.crop((x0,y0,x1,y1)).save(f'out/{name}.webp',quality=90,method=6); manifest[name]=[int(x0),int(y0)]
P=dict(shN=(373,597),elN=(326,642),shF=(669,592),elF=(705,635),hipN=(450,772),hipF=(612,772),neck=(540,468),hips=(530,775),gripN=(268,698),gripF=(763,705),feet=(540,935))
skin=sample((300,632)); skinF=sample((690,612)); pants=sample((450,790))
save('h-armNu',part_from_mask(mk['armNu'],[(P['shN'],24,skin)]))
save('h-armNl',part_from_mask(mk['armNl'],[(P['elN'],24,skin)]))
save('h-armFu',part_from_mask(mk['armFu'],[(P['shF'],22,skinF)]))
save('h-armFl',part_from_mask(mk['armFl'],[(P['elF'],22,skinF)]))
save('h-legN',part_from_mask(mk['legN'],[(P['hipN'],34,pants)]))
save('h-legF',part_from_mask(mk['legF'],[(P['hipF'],34,pants)]))
tor=mk['torso']&(yy>=455)
save('h-torso',part_from_mask(tor))
for k in ['09-head','10-head-shout','11-head-hurt','12-head-happy']:
    save('h-'+k[3:],Image.open('aligned/anim-hero-'+k+'.png'))
# open hand mapped onto near forearm
O=np.asarray(Image.open(SH+'15-hand-front-open.png').convert('RGBA'))
src=np.float32([[446,600],[278,748]]); dst=np.float32([P['elN'],P['gripN']])
def sim(a,b):
    va=a[1]-a[0]; vb=b[1]-b[0]; s=np.linalg.norm(vb)/np.linalg.norm(va); ang=np.arctan2(vb[1],vb[0])-np.arctan2(va[1],va[0])
    c,si=s*np.cos(ang),s*np.sin(ang); R=np.array([[c,-si],[si,c]]); t=b[0]-R@a[0]; return np.hstack([R,t[:,None]]).astype(np.float32)
Wo=cv2.warpAffine(O,sim(src,dst),(W,H),flags=cv2.INTER_LINEAR)
save('h-armNl-open',Image.fromarray(Wo))
manifest['_pivots']={k:list(v) for k,v in P.items()}
# wolf
SW='aligned/anim-firewolf-'
for k in ['01-tail','04-body','07-head','10-head-hurt','11-head-angry','02-leg-back-far','03-leg-front-far','05-leg-back-near','06-leg-front-near']:
    save('w-'+k[3:],Image.open(SW+k+'.png'))
manifest['_wolf_pivots']=dict(tail=[330,520],head=[640,600],body=[560,720],legBN=[300,650],legBF=[510,640],legFN=[670,670],legFF=[850,690],feet=[600,900])
json.dump(manifest,open('out/manifest.json','w'),indent=1)
# preview assembled hero
can=Image.new('RGBA',(W,H),(210,210,210,255))
for n in ['h-armFl','h-armFu','h-legF','h-legN','h-torso','h-head','h-armNu','h-armNl']:
    x,y=manifest[n]; can.alpha_composite(Image.open(f'out/{n}.webp').convert('RGBA'),(x,y))
can2=Image.new('RGBA',(W,H),(210,210,210,255))
for n in ['w-leg-back-far','w-leg-front-far','w-tail','w-body','w-leg-back-near','w-leg-front-near','w-head']:
    x,y=manifest[n]; can2.alpha_composite(Image.open(f'out/{n}.webp').convert('RGBA'),(x,y))
Wd=Image.new('RGB',(1024,512)); Wd.paste(can.convert('RGB').resize((512,512)),(0,0)); Wd.paste(can2.convert('RGB').resize((512,512)),(512,0)); Wd.save('asm.png')
print(json.dumps({k:v for k,v in manifest.items() if not k.startswith('_')}))
