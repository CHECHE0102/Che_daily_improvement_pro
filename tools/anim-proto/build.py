import base64,json,os
here=os.path.dirname(os.path.abspath(__file__)); root=os.path.join(here,'..','..')
def uri(p): return 'data:image/webp;base64,'+base64.b64encode(open(os.path.join(root,'assets/art',p),'rb').read()).decode()
imgs={'wolf':'wild-wolf-fire.webp'}
for p in ['idle-hold','idle-plant','idle-shoulder','slash','smash','thrust','cast','bow','hurt','win']: imgs[p]=f'hero/m-cloth-{p}.webp'
imgs.update({'w_sword':'weapon-metal-2.webp','w_hammer':'weapon-earth-2.webp','w_trident':'weapon-water-2.webp','w_staff':'weapon-wood-3.webp','w_bow':'weapon-fire-2.webp'})
s=open(os.path.join(here,'src.html'),encoding='utf-8').read()
s=s.replace('__IMGS__',json.dumps({k:uri(v) for k,v in imgs.items()}))
open(os.path.join(here,'monster-anim-proto.html'),'w',encoding='utf-8').write(s)
