import 'dotenv/config'; import express from 'express'; import cors from 'cors'; import helmet from 'helmet'; import {createClient} from '@supabase/supabase-js'; import {z} from 'zod';
const app=express(); app.use(helmet()); app.use(cors({origin:process.env.WEB_ORIGIN||'http://localhost:5173'})); app.use(express.json());
const admin=createClient(process.env.SUPABASE_URL||'https://placeholder.supabase.co',process.env.SUPABASE_SERVICE_ROLE_KEY||'placeholder',{auth:{persistSession:false}});
function userClient(req:any){return createClient(process.env.SUPABASE_URL||'https://placeholder.supabase.co',process.env.SUPABASE_ANON_KEY||'placeholder',{auth:{persistSession:false},global:{headers:{Authorization:req.headers.authorization||''}}});}
app.get('/health',(_,res)=>res.json({ok:true,service:'sports-api'}));
async function auth(req:any,res:any,next:any){const token=(req.headers.authorization||'').replace('Bearer ',''); if(!token)return res.status(401).json({error:'UNAUTHORIZED'}); const {data,error}=await admin.auth.getUser(token); if(error||!data.user)return res.status(401).json({error:'UNAUTHORIZED'}); req.user=data.user; next()}
app.get('/api/me',auth,async(req:any,res)=>{const {data,error}=await admin.from('profiles').select('id,display_name').eq('id',req.user.id).single(); if(error)return res.status(400).json({error:error.message});res.json(data)});
const inviteSchema=z.object({organization_id:z.string().uuid(),email:z.string().email(),role:z.enum(['ADMIN','STAFF'])});
app.post('/api/organization-members/invite',auth,async(req:any,res)=>{
  const parsed=inviteSchema.safeParse(req.body); if(!parsed.success)return res.status(422).json({error:'INVALID_INVITATION'});
  const {organization_id,email,role}=parsed.data;
  const {data:membership,error:membershipError}=await admin.from('organization_members').select('user_grp,user_role,active,organizations(workflow_status)').eq('organization_id',organization_id).eq('user_id',req.user.id).maybeSingle();
  if(membershipError)return res.status(400).json({error:membershipError.message});
  if(!membership?.active||!['OWNER','ADMIN'].includes(membership.user_role))return res.status(403).json({error:'FORBIDDEN'});
  if((membership.organizations as any)?.workflow_status!=='SETUP')return res.status(409).json({error:'LEAGUE_SETUP_LOCKED'});
  const {data:invited,error:inviteError}=await admin.auth.admin.inviteUserByEmail(email);
  if(inviteError)return res.status(400).json({error:inviteError.message});
  const {error:upsertError}=await admin.from('organization_members').upsert({organization_id,user_id:invited.user.id,user_grp:membership.user_grp,user_role:role,role:role==='ADMIN'?'ADMIN':'STATISTICIAN',active:true},{onConflict:'organization_id,user_id'});
  if(upsertError)return res.status(400).json({error:upsertError.message});
  await admin.from('audit_log').insert({organization_id,actor_id:req.user.id,action:'INVITE',entity_type:'ORGANIZATION_MEMBER',entity_id:invited.user.id,metadata:{email,role}});
  res.status(201).json({user_id:invited.user.id,email,role});
});
const eventSchema=z.object({game_id:z.string().uuid(),organization_id:z.string().uuid(),team_id:z.string().uuid(),player_id:z.string().uuid().nullable().optional(),event_type:z.enum(['FT_MADE','2PT_MADE','3PT_MADE','REBOUND_OFF','REBOUND_DEF','ASSIST','STEAL','BLOCK','TURNOVER','FOUL','TIMEOUT','SUB_IN','SUB_OUT']),period:z.number().int().min(1).max(20),clock_ms:z.number().int().min(0)});
app.post('/api/game-events',auth,async(req:any,res)=>{const parsed=eventSchema.safeParse(req.body);if(!parsed.success)return res.status(422).json(parsed.error.flatten()); const {data,error}=await userClient(req).rpc('record_game_event',{p_actor:req.user.id,p_payload:parsed.data});if(error)return res.status(400).json({error:error.message});res.status(201).json(data)});
app.post('/api/game-events/:id/reverse',auth,async(req:any,res)=>{const {data,error}=await userClient(req).rpc('reverse_game_event',{p_actor:req.user.id,p_event_id:req.params.id,p_reason:req.body?.reason||'Operator correction'});if(error)return res.status(400).json({error:error.message});res.json(data)});
app.listen(Number(process.env.API_PORT||4000),()=>console.log(`Sports API on :${process.env.API_PORT||4000}`));
