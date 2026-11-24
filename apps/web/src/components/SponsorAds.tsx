import { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { supabase } from '../lib/supabase';

type Ad={id:string;sponsor_name:string;headline:string;image_url:string;alt_text:string;target_url:string};
export default function SponsorAds({organizationId}:{organizationId?:string}){
  const [ads,setAds]=useState<Ad[]>([]);
  useEffect(()=>{let active=true;if(!organizationId){setAds([]);return;}void supabase.from('sponsor_ads').select('id,sponsor_name,headline,image_url,alt_text,target_url').eq('organization_id',organizationId).eq('active',true).order('created_at',{ascending:false}).then(({data})=>{if(active)setAds((data??[]) as Ad[]);});return()=>{active=false;};},[organizationId]);
  if(!ads.length)return null;
  return <section className="public-sponsor-strip" aria-label="Sponsor advertisements">{ads.map(ad=><a className="public-sponsor-ad" key={ad.id} href={ad.target_url} target="_blank" rel="sponsored noopener noreferrer"><img src={ad.image_url} alt={ad.alt_text}/><span className="public-sponsor-copy"><small>SPONSORED · {ad.sponsor_name}</small><b>{ad.headline||ad.sponsor_name}</b></span><ExternalLink size={14}/></a>)}</section>;
}
