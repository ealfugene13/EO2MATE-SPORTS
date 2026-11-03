import { supabase } from './supabase';
const configuredBase=import.meta.env.VITE_API_URL?.trim();
const base=(configuredBase||(import.meta.env.DEV?'http://localhost:4000':'')).replace(/\/+$/,'');
export async function api<T>(path:string, init:RequestInit={}):Promise<T>{
  if(!base)throw new Error('Sports API is not configured for this deployment. Set the VITE_API_URL build secret and redeploy.');
  const {data:{session}}=await supabase.auth.getSession();
  const headers=new Headers(init.headers);headers.set('Content-Type','application/json');if(session?.access_token)headers.set('Authorization',`Bearer ${session.access_token}`);
  let r:Response;try{r=await fetch(base+path,{...init,headers});}catch{throw new Error('Could not reach the Sports API. Check its URL and allow https://sports.eo2mate.com in the API WEB_ORIGIN setting.');}
  if(!r.ok){let message=`Request failed (${r.status})`;try{const body=await r.json();message=body.error||message;}catch{}throw new Error(message)}
  return r.json();
}
