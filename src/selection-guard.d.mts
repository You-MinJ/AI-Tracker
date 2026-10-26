export type SelectionTicket={version:number;key:string;channel:string;seq:number};
export class SelectionGuard{select(threadId:string|null,turnId?:string):void;capture(channel?:string):SelectionTicket;accepts(ticket:SelectionTicket):boolean;}
