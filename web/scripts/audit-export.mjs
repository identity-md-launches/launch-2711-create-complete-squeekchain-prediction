/* Static-hosting integrity and conservative submission-byte accounting. */
import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
process.chdir(fileURLToPath(new URL('../../',import.meta.url)));
const root=resolve('dist');
async function files(dir) {const result=[];for(const item of await readdir(dir,{withFileTypes:true})){const path=resolve(dir,item.name);result.push(...item.isDirectory()?await files(path):[path]);}return result;}
const paths=await files(root);const references=[];const broken=[];const absolute=[];
for(const path of paths.filter(p=>/\.(html|css)$/.test(p))){
  const text=await readFile(path,'utf8');
  const refs=path.endsWith('.html')?[...text.matchAll(/(?:src|href)=["']([^"']+)["']/g)].map(m=>m[1]):[...text.matchAll(/url\(["']?([^"')]+)["']?\)/g)].map(m=>m[1]);
  for(const ref of refs){if(/^(https?:|data:|#)/.test(ref))continue;references.push({from:relative(root,path),asset:ref});if(ref.startsWith('/'))absolute.push(ref);const target=resolve(dirname(path),decodeURIComponent(ref.split(/[?#]/)[0]));try{await stat(target);}catch{broken.push(ref);}}
}
const git=(...args)=>execFileSync('git',args,{encoding:'utf8'}).split('\n').filter(Boolean);
const addedOrChanged=[...new Set([...git('diff','--name-only','--diff-filter=ACMRT'),...git('ls-files','--others','--exclude-standard')])].filter(p=>!p.startsWith('.imd/')&&!p.startsWith('test/scratch/'));
const generated=addedOrChanged.filter(p=>/(^|\/)(node_modules|\.vite|playwright-report|test-results|npm-cache)(\/|$)|\.tgz$/.test(p));
const protectedPaths=git('diff','--name-only').filter(p=>/^(src\/|lib\/|\.git\/|\.github\/|foundry\.(toml|lock)$|remappings\.txt$|\.gitmodules$)|(^|\/)(package\.json|[^/]*lock[^/]*|\.env(?:\.[^/]*)?)$/.test(p));
let bytes=0;const submission=[];
for(const path of addedOrChanged){try{const info=await stat(path);if(info.isFile()){bytes+=info.size;submission.push({path,bytes:info.size});}}catch{}}
const total=(await Promise.all(paths.map(p=>stat(p)))).reduce((sum,s)=>sum+s.size,0);
const index=await readFile(resolve(root,'index.html'),'utf8');
const metadata={title:/<title>[^<]+<\/title>/.test(index),description:/name="description"/.test(index),favicon:/rel="icon"/.test(index),ogTitle:/property="og:title"/.test(index),ogImage:/property="og:image"/.test(index)};
const report={export:'dist/',fileCount:paths.length,exportBytes:total,localReferences:references,absoluteAssetUrls:absolute,missingLocalAssets:broken,metadata,protectedChanges:protectedPaths,generatedPathsInSubmission:generated,addedOrChangedFileBytes:bytes,budgetBytes:8388608,accounting:'Conservative full sizes of added/changed files; excludes removed files and disposable assignment/scratch inputs. Git binary deltas may be smaller. The report itself is finalized on a subsequent audit.',submissionFiles:submission};
await writeFile('artifacts/export-audit.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({fileCount:paths.length,exportBytes:total,addedOrChangedFileBytes:bytes,budgetBytes:8388608,protectedChanges:protectedPaths,missingLocalAssets:broken,absoluteAssetUrls:absolute,generatedPathsInSubmission:generated,metadata},null,2));
if(broken.length||absolute.length||generated.length||protectedPaths.length||bytes>8388608||Object.values(metadata).some(v=>!v))process.exitCode=1;
