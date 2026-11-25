-- Promote only the explicitly designated, verified Google account on first sign-in.
-- All other new accounts remain customers.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  initial_role public.app_role := 'customer';
begin
  if lower(coalesce(new.email, '')) = 'nkrishnakarthik2007@gmail.com'
     and new.email_confirmed_at is not null
     and coalesce(new.raw_app_meta_data->>'provider', '') = 'google' then
    initial_role := 'super_admin';
  end if;

  insert into public.profiles(id, full_name, avatar_url, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.raw_user_meta_data->>'avatar_url',
    initial_role
  )
  on conflict (id) do nothing;

  return new;
end;
$function$;
