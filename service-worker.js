const CACHE='tbu-v2-2-online-gameplay-v1';
const CORE=[
  './','./index.html','./edition-config.js','./online.js','./manifest.webmanifest','./icons/icon-192.png','./icons/icon-512.png','./icons/apple-touch-icon.png',
  './assets/diceSound.mp3','./assets/pawn-red.png','./assets/pawn-blue.png','./assets/pawn-green.png','./assets/pawn-yellow.png',
  './assets/redPlane.png','./assets/bluePlane.png','./assets/greenPlane.png','./assets/yellowPlane.png',
  './assets/redTaxi.png','./assets/blueTaxi.png','./assets/greenTaxi.png','./assets/yellowTaxi.png'
];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('message',event=>{if(event.data==='SKIP_WAITING')self.skipWaiting()});
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||!['http:','https:'].includes(url.protocol)||url.origin!==self.location.origin)return;
  const isFreshCode=event.request.mode==='navigate'||url.pathname.endsWith('/online.js')||url.pathname.endsWith('/index.html');
  if(isFreshCode){event.respondWith(fetch(event.request).then(response=>{
    if(response&&response.status===200&&response.type==='basic'){let copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy))}
    return response;
  }).catch(()=>caches.match(event.request).then(cached=>cached||(event.request.mode==='navigate'?caches.match('./index.html'):undefined))));return}
  event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request).then(response=>{
    if(response&&response.status===200&&response.type==='basic'){let copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy))}
    return response;
  }).catch(()=>event.request.mode==='navigate'?caches.match('./index.html'):undefined)));
});
