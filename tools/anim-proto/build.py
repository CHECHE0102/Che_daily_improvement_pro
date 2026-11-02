import base64,sys,os
here=os.path.dirname(os.path.abspath(__file__)); root=os.path.join(here,'..','..')
def uri(p): return 'data:image/webp;base64,'+base64.b64encode(open(os.path.join(root,p),'rb').read()).decode()
s=open(os.path.join(here,'src.html'),encoding='utf-8').read()
for k,p in {'__WOLF__':'assets/art/wild-wolf-fire.webp','__HERO_IDLE__':'assets/art/hero/m-cloth-idle.webp','__HERO_SLASH__':'assets/art/hero/m-cloth-slash.webp','__HERO_HURT__':'assets/art/hero/m-cloth-hurt.webp','__HERO_WIN__':'assets/art/hero/m-cloth-win.webp'}.items():
    s=s.replace(k,uri(p))
open(os.path.join(here,'monster-anim-proto.html'),'w',encoding='utf-8').write(s)
