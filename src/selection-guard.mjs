export class SelectionGuard {
 constructor(){this.version=0;this.key='';this.sequence=new Map();}
 select(threadId,turnId=''){this.key=`${threadId??''}:${turnId}`;this.version++;this.sequence.clear();}
 capture(channel='detail'){let seq=(this.sequence.get(channel)??0)+1;this.sequence.set(channel,seq);return{version:this.version,key:this.key,channel,seq};}
 accepts(ticket){return ticket.version===this.version&&ticket.key===this.key&&this.sequence.get(ticket.channel)===ticket.seq;}
}
