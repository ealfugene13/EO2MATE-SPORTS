import { supabase } from './supabase';
const base=import.meta.env.VITE_API_URL||'http://localhost:4000';
export async function api<T>(path:string, init:RequestInit={}):Promise<T>{
  const {data:{session}}=await supabase.auth.getSession();
  const headers=new Headers(init.headers);headers.set('Content-Type','application/json');if(session?.access_token)headers.set('Authorization',`Bearer ${session.access_token}`);
  const r=await fetch(base+path,{...init,headers});
  if(!r.ok){let message=`Request failed (${r.status})`;try{const body=await r.json();message=body.error||message;}catch{}throw new Error(message)}
  return r.json();
}
