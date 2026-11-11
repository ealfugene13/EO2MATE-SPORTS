import { supabase } from './supabase';
const base=(import.meta.env.VITE_SUPABASE_URL||'').trim().replace(/\/+$/,'');
const apiKey=(import.meta.env.VITE_SUPABASE_ANON_KEY||'').trim();

function functionTarget(path:string, init:RequestInit){
  const body=typeof init.body==='string'?JSON.parse(init.body||'{}'):{};
  const routes:[RegExp,string,(match:RegExpMatchArray)=>Record<string,unknown>][]=[
    [/^\/api\/games\/([^/]+)\/start$/,'game-start',match=>({game_id:decodeURIComponent(match[1])})],
    [/^\/api\/game-events\/([^/]+)\/reverse$/,'game-event-reverse',match=>({event_id:decodeURIComponent(match[1])})],
  ];
  for(const [pattern,name,extra] of routes){const match=path.match(pattern);if(match)return{name,init:{...init,body:JSON.stringify({...body,...extra(match)})}};}
  const simple:Record<string,string>={'/api/me':'me','/api/organization-members/invite':'organization-member-invite','/api/game-events':'game-event','/api/game-substitutions':'game-substitution','/api/support-admin':'support-admin'};
  const name=simple[path];if(!name)throw new Error(`Unknown Sports API route: ${path}`);return{name,init};
}

export async function api<T>(path:string, init:RequestInit={}):Promise<T>{
  if(!base||!apiKey)throw new Error('Supabase API configuration is missing. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then rebuild the website.');
  const target=functionTarget(path,init);
  const {data:{session}}=await supabase.auth.getSession();
  if(!session?.access_token)throw new Error('Your session expired. Sign in again, then retry.');
  const headers=new Headers(target.init.headers);headers.set('apikey',apiKey);headers.set('Authorization',`Bearer ${session.access_token}`);if(target.init.body)headers.set('Content-Type','application/json');
  let r:Response;try{r=await fetch(`${base}/functions/v1/${target.name}`,{...target.init,headers});}catch{throw new Error('Could not reach the Supabase Edge Function. Check the Supabase project URL and confirm the function has been deployed.');}
  if(!r.ok){let message=`Request failed (${r.status})`;try{const body=await r.json();message=body.error||message;}catch{}throw new Error(message)}
  return r.json();
}
