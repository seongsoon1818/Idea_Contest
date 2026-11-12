import {createServer, request} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve, extname, sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../dist/', import.meta.url));
const origin = 'http://127.0.0.1:8080';
const api = 'http://127.0.0.1:3000';
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8',
 '.css':'text/css; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2'};
createServer(async (req,res) => {
 if (req.headers.host !== '127.0.0.1:8080') return res.writeHead(403).end();
 try {
  const url = new URL(req.url,origin);
  if (url.origin !== origin) return res.writeHead(400).end();
  if (url.pathname.startsWith('/api/v1/')) {
   const upstream = request(api+url.pathname+url.search,{
    method:req.method,headers:{...req.headers,host:'127.0.0.1:3000'}
   },reply=>{res.writeHead(reply.statusCode,reply.headers);reply.pipe(res);});
   upstream.setTimeout(12000,()=>upstream.destroy());
   upstream.on('error',()=>{if(!res.headersSent)res.writeHead(502);res.end();});
   req.pipe(upstream);
   return;
  }
  if (!['GET','HEAD'].includes(req.method)) return res.writeHead(405).end();
  const pathname = decodeURIComponent(url.pathname);
  const file = resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
  if (!file.startsWith(resolve(root)+sep)) return res.writeHead(404).end();
  const data = await readFile(file);
  res.writeHead(200,{'Content-Type':types[extname(file)]??'application/octet-stream','Cache-Control':'no-store'});
  res.end(req.method==='HEAD'?undefined:data);
 } catch {
  res.writeHead(404).end();
 }
}).listen(8080,'127.0.0.1',()=>console.log('HSU PICK:',origin,'→',api+'/api/v1'));
