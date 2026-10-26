const secretKey=/^(?:api[_-]?key|password|passwd|passphrase|secret|client[_-]?secret|access[_-]?token|refresh[_-]?token|id[_-]?token|auth[_-]?token|session[_-]?token|token|authorization|credential(?:s)?|private[_-]?key|aws[_-]?secret[_-]?access[_-]?key|cookie|set-cookie)$/i;
function maskText(value){return value
 .replace(/"(?:\\.|[^"\\])*"/g,token=>{if(!token.includes('\\"'))return token;try{const decoded=JSON.parse(token);if(typeof decoded==='string'&&/^\s*[\[{"]/.test(decoded))return JSON.stringify(sanitizeJson(decoded,1));}catch{}return token;})
 .replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/g,'[비밀키 숨김]')
 .replace(/\b(?:sk-|ghp_|github_pat_|xox[baprs]-)[A-Za-z0-9_-]{12,}/g,'[토큰 숨김]')
 .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,'[토큰 숨김]')
 .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9+/_.=-]+/gi,'$1 [숨김]')
 .replace(/("(?:api[_-]?key|password|passwd|passphrase|secret|client[_-]?secret|access[_-]?token|refresh[_-]?token|id[_-]?token|auth[_-]?token|session[_-]?token|token|authorization|credentials?|private[_-]?key|aws[_-]?secret[_-]?access[_-]?key|cookie|set-cookie)"\s*:\s*)"(?:\\.|[^"\\])*"/gi,'$1"[숨김]"')
 .replace(/('(?:api[_-]?key|password|secret|access[_-]?token|refresh[_-]?token|token|authorization)'\s*:\s*)'(?:\\.|[^'\\])*'/gi,"$1'[숨김]'")
 .replace(/((?:api[_-]?key|password|passwd|secret|client[_-]?secret|access[_-]?token|refresh[_-]?token|auth[_-]?token|session[_-]?token|token|authorization|private[_-]?key)\s*[=:]\s*)(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s,;}\]]+)/gi,'$1[숨김]')
 .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,'[이메일 숨김]')
 .replace(/\b(?:01[016789]|0[2-6][1-5]?)[- .]?\d{3,4}[- .]?\d{4}\b/g,'[전화번호 숨김]');}
function sanitizeJson(value,depth){
 if(depth>12)return '[중첩 표시 제한]';
 if(Array.isArray(value))return value.map(v=>sanitizeJson(v,depth+1));
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,v])=>[key,secretKey.test(key)?'[숨김]':sanitizeJson(v,depth+1)]));
 if(typeof value==='string'){
  try{const nested=JSON.parse(value);if(typeof nested==='object'&&nested!==null)return JSON.stringify(sanitizeJson(nested,depth+1));if(typeof nested==='string'&&nested!==value)return JSON.stringify(sanitizeJson(nested,depth+1));}catch{}
  return maskText(value);
 }
 return value;
}
export function redactSecrets(input){const text=String(input??'');try{const parsed=JSON.parse(text);return (typeof parsed==='object'&&parsed!==null)||typeof parsed==='string'?JSON.stringify(sanitizeJson(parsed,0)):maskText(text);}catch{return maskText(text);}}
