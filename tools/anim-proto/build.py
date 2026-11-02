import base64,json,os,glob
here=os.path.dirname(os.path.abspath(__file__)); root=os.path.join(here,'..','..')
def b64(p,mime='image/webp'): return f'data:{mime};base64,'+base64.b64encode(open(p,'rb').read()).decode()
art=lambda p: b64(os.path.join(root,'assets/art',p))
imgs={'wolf':art('wild-wolf-fire.webp')}
for p in ['idle-hold','idle-plant','idle-shoulder','slash','smash','thrust','cast','bow','hurt','win']: imgs[p]=art(f'hero/m-cloth-{p}.webp')
imgs.update({'w_sword':art('weapon-metal-2.webp'),'w_hammer':art('weapon-earth-2.webp'),'w_trident':art('weapon-water-2.webp'),'w_staff':art('weapon-wood-3.webp'),'w_bow':art('weapon-fire-2.webp')})
for f in sorted(glob.glob(os.path.join(here,'parts','*.webp'))): imgs[os.path.basename(f)[:-5]]=b64(f)
s=open(os.path.join(here,'src.html'),encoding='utf-8').read()
s=s.replace('__RIGJS__',open(os.path.join(here,'rig.js'),encoding='utf-8').read())
s=s.replace('__MANIFEST__',open(os.path.join(here,'parts','manifest.json')).read())
s=s.replace('__IMGS__',json.dumps(imgs))
open(os.path.join(here,'monster-anim-proto.html'),'w',encoding='utf-8').write(s)
