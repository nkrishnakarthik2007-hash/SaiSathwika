import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json"};
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 if(req.method!=="POST")return new Response(JSON.stringify({error:"Method not allowed"}),{status:405,headers:cors});
 try{
  const url=Deno.env.get("SUPABASE_URL")!,anon=Deno.env.get("SUPABASE_ANON_KEY")!,secret=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const token=(req.headers.get("Authorization")??"").replace(/^Bearer\s+/i,"");
  if(!token)return new Response(JSON.stringify({error:"Sign in required."}),{status:401,headers:cors});
  const auth=createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:authData,error:authError}=await auth.auth.getUser(token),user=authData.user;
  if(authError||!user?.email||!user.email_confirmed_at)return new Response(JSON.stringify({error:"A verified signed-in account is required."}),{status:401,headers:cors});
  const db=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:caller,error:callerError}=await db.from("profiles").select("id,role,is_active").eq("id",user.id).single();
  if(callerError||!caller?.is_active)return new Response(JSON.stringify({error:"Your account is inactive."}),{status:403,headers:cors});
  const body=await req.json().catch(()=>({})),action=String(body.action??"");
  if(action==="accept"){
   const {data:invite,error}=await db.from("team_invitations").select("id,role").eq("email",user.email.toLowerCase()).is("accepted_at",null).is("revoked_at",null).gt("expires_at",new Date().toISOString()).order("created_at",{ascending:false}).limit(1).maybeSingle();
   if(error)throw error;if(!invite)return new Response(JSON.stringify({accepted:false,role:caller.role}),{headers:cors});
   const {error:updateError}=await db.from("profiles").update({role:invite.role,is_active:true}).eq("id",user.id);if(updateError)throw updateError;
   const {error:markError}=await db.from("team_invitations").update({accepted_at:new Date().toISOString()}).eq("id",invite.id);if(markError)throw markError;
   return new Response(JSON.stringify({accepted:true,role:invite.role}),{headers:cors});
  }
  if(!["super_admin","owner"].includes(caller.role))return new Response(JSON.stringify({error:"Only Super Admin or Owner can manage invitations."}),{status:403,headers:cors});
  if(action==="list"){
   const {data,error}=await db.from("team_invitations").select("id,email,role,created_at,expires_at,accepted_at,revoked_at").order("created_at",{ascending:false}).limit(100);if(error)throw error;
   return new Response(JSON.stringify({invitations:data??[]}),{headers:cors});
  }
  if(action==="revoke"){
   const id=String(body.id??"");if(!id)return new Response(JSON.stringify({error:"Invitation ID required."}),{status:400,headers:cors});
   const {error}=await db.from("team_invitations").update({revoked_at:new Date().toISOString()}).eq("id",id).is("accepted_at",null).is("revoked_at",null);if(error)throw error;
   return new Response(JSON.stringify({success:true}),{headers:cors});
  }
  if(action==="invite"){
   const email=String(body.email??"").trim().toLowerCase(),role=String(body.role??"");
   if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return new Response(JSON.stringify({error:"Enter a valid email address."}),{status:400,headers:cors});
   if(!["admin","owner"].includes(role))return new Response(JSON.stringify({error:"Choose Admin or Owner."}),{status:400,headers:cors});
   if(caller.role==="owner"&&role!=="admin")return new Response(JSON.stringify({error:"Owners can invite Admins only."}),{status:403,headers:cors});
   if(email===user.email.toLowerCase())return new Response(JSON.stringify({error:"You cannot invite your own account."}),{status:400,headers:cors});
   const {data:existingUsers}=await db.auth.admin.listUsers({page:1,perPage:1000});
   const existing=existingUsers?.users?.find(x=>x.email?.toLowerCase()===email);
   if(existing){const {data:profile}=await db.from("profiles").select("role").eq("id",existing.id).maybeSingle();if(profile&&profile.role!=="customer")return new Response(JSON.stringify({error:"This account already has a team role."}),{status:409,headers:cors});}
   await db.from("team_invitations").update({revoked_at:new Date().toISOString()}).eq("email",email).is("accepted_at",null).is("revoked_at",null);
   const {data:invitation,error}=await db.from("team_invitations").insert({email,role,invited_by:user.id}).select("id,email,role,expires_at").single();if(error)throw error;
   return new Response(JSON.stringify({invitation}),{headers:cors});
  }
  return new Response(JSON.stringify({error:"Unknown action."}),{status:400,headers:cors});
 }catch(error){return new Response(JSON.stringify({error:error instanceof Error?error.message:"Unexpected server error."}),{status:500,headers:cors});}
});