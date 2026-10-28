import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, CheckCircle2, LockKeyhole, ShieldCheck, Trophy } from 'lucide-react';
import { supabase, configured } from '../lib/supabase';

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('eugene@pasigleague.ph');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [resetNotice, setResetNotice] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setError(''); setBusy(true);
    if (!configured) { setBusy(false); setError('Connect Supabase before signing in to the sports workspace.'); return; }
    const result = await supabase.auth.signInWithPassword({ email, password });
    if (result.error) { setBusy(false); setError(result.error.message); return; }
    const factors = await supabase.auth.mfa.listFactors();
    const verifiedTotp = factors.data?.totp?.find(factor => factor.status === 'verified');
    if (verifiedTotp) {
      if (!code) { await supabase.auth.signOut(); setBusy(false); setError('Enter the six-digit verification code for this account.'); return; }
      const verified = await supabase.auth.mfa.challengeAndVerify({ factorId: verifiedTotp.id, code });
      if (verified.error) { await supabase.auth.signOut(); setBusy(false); setError(verified.error.message); return; }
    }
    setBusy(false); navigate('/');
  }
  async function resetPassword() {
    setError(''); setResetNotice('');
    if (!configured) { setError('Connect Supabase before requesting a password reset.'); return; }
    if (!email.trim()) { setError('Enter your email address first.'); return; }
    const {error: resetError}=await supabase.auth.resetPasswordForEmail(email,{redirectTo:window.location.origin+'/login'});
    if(resetError)setError(resetError.message);else setResetNotice('If an account uses that email, a password reset link has been sent.');
  }
  return <div className="login-screen"><section className="login-story"><div className="login-brand"><div className="brand-symbol"><span className="basketball-seam">◌</span></div><span>EO2MATE <b>SPORTS</b></span></div><div className="story-copy"><PillText/><h1>Every game.<br/><em>In sync.</em></h1><p>One clear workspace for your league—before tip-off, courtside, and after the final buzzer.</p><div className="story-stat-row"><div><strong>64</strong><span>games completed</span></div><div><strong>16</strong><span>teams in season</span></div><div><strong>248</strong><span>players registered</span></div></div></div><div className="story-footer"><span>COMMUNITY CUP 2026</span><span>BUILT FOR THE GAME <Trophy size={14}/></span></div></section><section className="login-form-side"><form className="login-form" onSubmit={submit}><div className="mobile-brand"><span className="brand-symbol"><span className="basketball-seam">◌</span></span><b>EO2MATE SPORTS</b></div><div className="login-heading"><span className="eyebrow">WELCOME BACK</span><h2>Sign in to your league</h2><p>Use your staff account to continue to your workspace.</p></div><label>Email address<input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@yourleague.ph" required/></label><label>Password<span className="input-wrap"><input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Enter your password" required/><LockKeyhole size={16}/></span></label><label>Verification code <span className="optional-label">MFA</span><input className="code-input" value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,'').slice(0,6))} placeholder="••••••" inputMode="numeric" maxLength={6}/></label><div className="login-options"><label className="remember"><input type="checkbox"/> Keep me signed in</label><button type="button" className="text-link" onClick={()=>void resetPassword()}>Forgot password?</button></div>{error && <div className="login-error">{error}</div>}{resetNotice&&<div className="success-banner">{resetNotice}</div>}<button className="login-submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'} <ArrowRight size={17}/></button><div className="login-security"><ShieldCheck size={16}/><span>Secure sign-in · MFA verification when enabled</span></div>{!configured && <div className="demo-note"><CheckCircle2 size={15}/><span>Database mode requires Supabase URL and anon key configuration.</span></div>}<div className="privacy-note">By continuing, you agree to your organization’s access and privacy policies.</div></form></section></div>;
}
function PillText() { return <div className="story-pill"><span className="pulse-dot"/> LEAGUE OPERATIONS, MADE CLEAR</div>; }
