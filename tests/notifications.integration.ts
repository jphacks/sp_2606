import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
test("notification privacy, own receipts, visibility changes, deduplication and deletion cascade", async () => {
 const db=new PGlite();
 try {
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');create table auth.mfa_factors(id uuid primary key default gen_random_uuid(),user_id uuid references auth.users(id) on delete cascade,status text,factor_type text);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`);
 const dir=new URL('../supabase/migrations/',import.meta.url);
 for(const f of (await readdir(dir)).filter(f=>f.endsWith('.sql')).sort())await db.exec(await readFile(new URL(f,dir),'utf8'));
 const a='00000000-0000-4000-8000-000000000001',b='00000000-0000-4000-8000-000000000002',c='00000000-0000-4000-8000-000000000003';
 await db.query('insert into auth.users(id) values($1),($2),($3)',[a,b,c]);
 await db.exec("update private.preferences set profile_completed=true,visibility='public';update public.profiles set created_at=now()-interval '1 day'");
 const post=(await db.query<{id:string}>('insert into public.posts(owner_id,body) values($1,\'PRIVATE TEST CONTENT\') returning id',[a])).rows[0].id;
 await db.query("insert into public.comments(owner_id,post_id,body) values($1,$2,'SECRET COMMENT')",[b,post]);
 await db.query('insert into private.post_reactions(user_id,post_id) values($1,$2)',[b,post]);
 await db.query('insert into private.follows(follower,following) values($1,$2)',[b,a]);
 await db.query("insert into public.messages(sender,recipient,body,request_id) values($1,$2,'SECRET DM',gen_random_uuid())",[b,a]);
 async function as(user:string|null,sql:string,params:unknown[]=[]){await db.exec('reset role;set role '+(user?'authenticated':'anon'));await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",[user||'',JSON.stringify({sub:user,aal:'aal1'})]);return db.query<any>(sql,params);}
 async function owner(sql:string,params:unknown[]=[]){await db.exec('reset role');return db.query(sql,params);}
 async function list(user:string){return (await as(user,'select public.read_notifications() n')).rows[0].n;}
 await assert.rejects(as(null,'select public.read_notifications()'));
 await assert.rejects(as(a,'select * from private.notification_state'));
 const first=await list(a);assert.equal(first.items.length,4);assert.equal(first.unread,4);assert(!JSON.stringify(first).includes('SECRET'));assert(!JSON.stringify(first).includes('PRIVATE TEST'));
 assert.equal((await list(c)).items.length,0);
 await as(a,'select public.mark_notifications_read($1)',[first.snapshot]);assert.equal((await list(a)).unread,0);
 await assert.rejects(as(a,"select public.mark_notifications_read(now()+interval '1 day')"));
 assert.equal((await as(c,'select public.notification_post($1) p',[post])).rows[0].p.body,'PRIVATE TEST CONTENT');
 await owner("update private.preferences set visibility='private' where id=$1",[a]);
 assert.equal((await as(c,'select public.notification_post($1) p',[post])).rows[0].p,null);
 await owner('insert into private.blocks(blocker,blocked) values($1,$2)',[a,b]);
 assert.equal((await list(a)).items.length,0);
 await owner('delete from private.blocks');
 await owner('delete from private.post_reactions');
 assert(!(await list(a)).items.some((i:any)=>i.kind==='reaction'));
 await owner('delete from auth.users where id=$1',[b]);assert.equal((await list(a)).items.length,0);
 await owner('delete from auth.users where id=$1',[a]);assert.equal((await owner('select * from private.notification_state where user_id=$1',[a])).rows.length,0);
 }finally{await db.close();}
});
