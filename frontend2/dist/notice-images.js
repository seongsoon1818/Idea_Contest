// Canonical: images: [{url, alt}] or URL strings. Also accept the simple DB
// URL fields imageUrls: string[] and imageUrl: string at the read boundary.
// An explicit images array (including []) wins over the alternate fields.
export function noticeImages(item={}){
 const sources=Array.isArray(item.images)?item.images:Array.isArray(item.imageUrls)?item.imageUrls:typeof item.imageUrl==='string'?[item.imageUrl]:[];
 const seen=new Set();
 return sources.flatMap((entry,index)=>{
  const url=typeof entry==='string'?entry:entry?.url;
  try{const parsed=new URL(url);if(parsed.protocol!=='https:'||parsed.username||parsed.password)return [];
   if(seen.has(parsed.href))return [];seen.add(parsed.href);
   return [{url:parsed.href,alt:typeof entry?.alt==='string'&&entry.alt.trim()?entry.alt.trim():`${item.title} 안내 이미지 ${index+1}`}];
  }catch{return [];}
 });
}
