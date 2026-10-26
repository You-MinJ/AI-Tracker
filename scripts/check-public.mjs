// Inspect staged blobs only. Reports categories/paths, never matched values.
import {execFileSync} from 'node:child_process';
const git=(...args)=>execFileSync('git',args,{encoding:'utf8',maxBuffer:8*1024*1024});
const files=git('diff','--cached','--name-only','--diff-filter=ACMR','-z').split('\0').filter(Boolean);
if(!files.length){console.error('No staged files: stage an explicit allowlist before checking.');process.exit(1);}
const prohibited=/(?:^|\/)(?:data|backups|node_modules|dist|logs|exports|\.codex|\.agents|\.ssh|\.aws|\.github\/workflows)(?:\/|$)|(?:^|\/)(?:\.env(?:\.|$)|\.npmrc$|\.netrc$|auth\.json$|credentials\.json$)|\.(?:log|jsonl|db|sqlite\w*|png|jpe?g|gif|webp|pem|key|p12|pfx|tar|tar\.gz|tgz|zip)$/i;
const rules=[
 ['personal-home-path',/\/(?:Users|home)\/[A-Za-z0-9_.-]+/g],
 ['private-key',/-----BEGIN [^-]*PRIVATE KEY-----/g],
 ['credential-token',/\b(?:sk-|ghp_|github_pat_|xox[baprs]-)[A-Za-z0-9_-]{12,}/g],
 ['jwt',/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g],
 ['email',/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi],
 ['runtime-uuid',/\b[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\b/gi],
];
let failed=false;
for(const file of files){
 if(prohibited.test(file)){console.error('Forbidden path:',file);failed=true;continue;}
 const content=git('show',':'+file);
 for(const [category,pattern]of rules){for(const match of content.matchAll(pattern)){
  const value=match[0],test=file.startsWith('test/');
  const synthetic=test&&(category==='runtime-uuid'&&/^00000000-0000-0000-0000-\d{12}$/.test(value)||category==='email'&&value.endsWith('@example.com')||category==='credential-token'&&/^sk-\d+$/.test(value));
  if(!synthetic){console.error('Review required:',category,file);failed=true;break;}
 }}
}
if(failed)process.exit(1);
console.log(`Public staged-pattern check passed: ${files.length} files. Manual full diff review is still required.`);
