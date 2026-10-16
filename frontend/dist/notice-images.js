// API shape: images: [{url: 'https://…', alt: '…'}]. Preserve source order.
export function noticeImages(item){
 const sources=Array.isArray(item.images)?item.images:[];
 return sources.flatMap((entry,index)=>{
  const url=typeof entry==='string'?entry:entry?.url;
  try{const parsed=new URL(url);if(parsed.protocol!=='https:'||parsed.username||parsed.password)return [];
   return [{url:parsed.href,alt:typeof entry?.alt==='string'&&entry.alt.trim()?entry.alt.trim():`${item.title} 안내 이미지 ${index+1}`}];
  }catch{return [];}
 });
}
