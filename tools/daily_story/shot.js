// node shot.js <outdir> [scenes...]  — serves this folder and screenshots page.html?s=<scene> at 1080x1920
const {chromium}=require('playwright');const http=require('http');const fs=require('fs');const path=require('path');
const dir=__dirname,out=process.argv[2]||'out',scenes=process.argv.slice(3).length?process.argv.slice(3):['story','intro','n0','n1','n2','regions','cta'];
const T={'.html':'text/html','.json':'application/json','.webp':'image/webp','.png':'image/png'};
const srv=http.createServer((q,r)=>{const u=decodeURIComponent(q.url.split('?')[0]);const f=(process.env.CAST_DIR&&u.startsWith('/cast/'))?path.join(process.env.CAST_DIR,u.slice(6)):path.join(dir,u);fs.readFile(f,(e,b)=>{if(e){r.writeHead(404);return r.end()}r.writeHead(200,{'content-type':T[path.extname(f)]||'application/octet-stream'});r.end(b)})}).listen(8799,async()=>{
 fs.mkdirSync(out,{recursive:true});const b=await chromium.launch();const p=await b.newPage({viewport:{width:1080,height:1920}});
 for(const s of scenes){await p.goto('http://localhost:8799/page.html?s='+s);await p.waitForSelector('body[data-ready]',{timeout:30000});await p.screenshot({path:path.join(out,s+'.png')});console.log('ok',s)}
 await b.close();srv.close();});
