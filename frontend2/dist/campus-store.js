import {campusApi} from './account-api.js?v=3';

// Scope responses to this page session. An invalidated request can finish, but
// cannot repopulate the cache or repaint the previous user's screen.
export class CampusStore {
 constructor(request=(path,options)=>campusApi.call(path,options)) {
  this.request=request;
  this.entries=new Map();
 }
 read(path,changed) {
  let entry=this.entries.get(path);
  if(entry && (entry.pending || Date.now()-entry.finished<60_000))return entry;
  entry={pending:true};
  this.entries.set(path,entry);
  this.request(path).then(data=>{entry.data=data;},error=>{entry.error=error;}).finally(()=>{
   entry.pending=false;
   entry.finished=Date.now();
   if(this.entries.get(path)===entry)changed();
  });
  return entry;
 }
 invalidate() {this.entries.clear();}
}

