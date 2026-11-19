// No caching/fetch interception: this worker only handles server Web Push.
self.addEventListener('push',event=>{
 event.waitUntil((async()=>{
  let n;try{n=event.data?.json();}catch{return;}
  if(!n||!['deadline','recommendation'].includes(n.type)||typeof n.id!=='string'||!n.id||typeof n.title!=='string'||!n.title)return;
  if(n.type==='deadline'&&(typeof n.itemId!=='string'||!n.itemId))return;
  const url=n.type==='deadline'?'#notice/'+encodeURIComponent(n.itemId):'#recommend';
  await self.registration.showNotification(n.title.slice(0,200),{body:typeof n.body==='string'?n.body.slice(0,500):'',tag:'hsupick-'+n.id,renotify:false,icon:'assets/hsu-pick-logo.png',data:{id:n.id,url}});
  for(const client of await self.clients.matchAll({type:'window',includeUncontrolled:true}))client.postMessage({type:'hsu-notification-refresh'});
 })());
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();event.waitUntil((async()=>{
  const hash=event.notification.data?.url;
  if(typeof hash!=='string'||!(hash==='#recommend'||/^#notice\/[A-Za-z0-9%_.~-]+$/.test(hash)))return;
  const target=new URL('./'+hash,self.registration.scope);
  if(typeof event.notification.data?.id==='string')target.searchParams.set('notification',event.notification.data.id);
  const url=target.href;
  for(const client of await self.clients.matchAll({type:'window',includeUncontrolled:true}))if(new URL(client.url).origin===self.location.origin){await client.navigate(url);await client.focus();return;}
  await self.clients.openWindow(url);
 })());
});
