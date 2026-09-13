import {mkdtemp,writeFile,cp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createRequire} from 'node:module';
import {execFile} from 'node:child_process';
const root=await mkdtemp(join(tmpdir(),'topcard-startup-check-'));
const runtime=join(process.env.LOCALAPPDATA,'Programs/topcard/resources/runtime');
try {
 await cp(join(process.env.APPDATA,'TopCard/.topcard'),join(root,'data'),{recursive:true});
 await writeFile(join(root,'main.cjs'),`
const {app,utilityProcess}=require('electron');const http=require('http'),net=require('net');const {join}=require('path');
app.setPath('userData',join(__dirname,'profile'));
app.whenReady().then(async()=>{
const runtime=${JSON.stringify(runtime)};const listener=net.createServer();const port=await new Promise(r=>listener.listen(0,'127.0.0.1',()=>{const p=listener.address().port;listener.close(()=>r(p));}));
const begin=Date.now();
const child=utilityProcess.fork(${JSON.stringify(join(process.cwd(),'desktop/backend.cjs'))},[],{cwd:runtime,env:{...process.env,NODE_PATH:join(runtime,'node_modules'),NODE_ENV:'production',HOSTNAME:'127.0.0.1',PORT:String(port),TOPCARD_SERVER_ENTRY:join(runtime,'server.js'),TOPCARD_NODE_EXECUTABLE:process.execPath,TOPCARD_NODE_RUN_AS_NODE:'1',TOPCARD_DATA_DIR:join(__dirname,'data'),PI_WEB_PASSWORD:'startup-check-only'},stdio:'pipe'});
child.stdout.pipe(process.stdout);child.stderr.pipe(process.stderr);
const request=path=>new Promise(resolve=>{const t=Date.now();const req=http.get({hostname:'127.0.0.1',port,path,headers:{Authorization:'Basic '+Buffer.from('pi:startup-check-only').toString('base64')}},res=>{let bytes=0;res.on('data',d=>bytes+=d.length);res.on('end',()=>resolve({path,status:res.statusCode,ms:Date.now()-t,bytes}));});req.setTimeout(40000,()=>req.destroy(Error('timeout')));req.on('error',e=>resolve({path,error:e.message,ms:Date.now()-t}));});
try{let health;for(let i=0;i<100;i++){health=await request('/api/web-auth');if(health.status===200)break;await new Promise(r=>setTimeout(r,200));}console.log('health',JSON.stringify({...health,totalMs:Date.now()-begin}));for(const path of ['/api/card-queue/bootstrap','/api/card-queue','/api/card-queue/bootstrap'])console.log('request',JSON.stringify(await request(path)));}finally{child.kill();app.exit(0);}
});
`);
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 await new Promise(resolve=>execFile(createRequire(import.meta.url)('electron'),[join(root,'main.cjs')],{env,windowsHide:true,timeout:140000},(error,stdout,stderr)=>{console.log(stdout);if(error)console.log(error.message);if(stderr)console.log(stderr.slice(-2000));resolve();}));
}finally{await rm(root,{recursive:true,force:true});}
