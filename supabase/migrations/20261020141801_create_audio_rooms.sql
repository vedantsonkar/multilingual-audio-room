-- All writes go through service-role-only, SECURITY INVOKER RPCs.
-- Anonymous authenticated clients can read only their own live membership.
create table public.rooms (
  code text primary key check (code ~ '^[A-Z0-9]{8}$'),
  epoch uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  empty_since timestamptz,
  alone_since timestamptz,
  started_at timestamptz
);

create table public.room_members (
  room_code text not null references public.rooms(code) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  tab_id uuid not null,
  name text not null check (length(trim(name)) between 1 and 40),
  speaking_language text not null,
  listening_language text not null,
  muted boolean not null default false,
  lease_expires_at timestamptz not null,
  left_at timestamptz,
  primary key (room_code, user_id)
);
create index room_members_user_idx on public.room_members(user_id, room_code);
create table public.request_buckets (
  key text primary key,
  window_start timestamptz not null,
  hits integer not null
);
alter table public.rooms enable row level security;
alter table public.room_members enable row level security;
alter table public.request_buckets enable row level security;
revoke all on public.rooms, public.room_members, public.request_buckets from anon, authenticated;
grant select on public.rooms, public.room_members to authenticated;
grant all on public.rooms, public.room_members, public.request_buckets to service_role;

create policy member_self_read on public.room_members for select to authenticated using (
  user_id = (select auth.uid()) and left_at is null and lease_expires_at > now()
);
create policy room_member_read on public.rooms for select to authenticated using (
  closed_at is null and (started_at is null or started_at + interval '30 minutes' > now()) and
  exists (select 1 from public.room_members m where m.room_code = rooms.code and m.user_id = (select auth.uid()) and m.left_at is null and m.lease_expires_at > now())
);

-- No messages are persisted. A fresh epoch is used whenever membership changes,
-- so an old socket cannot observe a new participant's signaling.
create policy room_signal_read on realtime.messages for select to authenticated using (
  extension = 'broadcast' and exists (
    select 1 from public.rooms r join public.room_members m on m.room_code = r.code
    where 'call:' || r.code || ':' || r.epoch::text = (select realtime.topic())
      and m.user_id = (select auth.uid()) and m.left_at is null
      and m.lease_expires_at > now() and r.closed_at is null
      and (r.started_at is null or r.started_at + interval '30 minutes' > now())
  )
);
create policy room_signal_write on realtime.messages for insert to authenticated with check (
  extension = 'broadcast' and exists (
    select 1 from public.rooms r join public.room_members m on m.room_code = r.code
    where 'call:' || r.code || ':' || r.epoch::text = (select realtime.topic())
      and m.user_id = (select auth.uid()) and m.left_at is null
      and m.lease_expires_at > now() and r.closed_at is null
      and (r.started_at is null or r.started_at + interval '30 minutes' > now())
  )
);

create function public.consume_request(p_key text, p_limit integer, p_window integer)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare v_hits integer; v_window timestamptz;
begin
  v_window := to_timestamp(floor(extract(epoch from now()) / p_window) * p_window);
  insert into public.request_buckets as b (key, window_start, hits) values (p_key, v_window, 1)
    on conflict (key) do update set window_start = excluded.window_start,
      hits = case when b.window_start = excluded.window_start then b.hits + 1 else 1 end
    returning hits into v_hits;
  return v_hits <= p_limit;
end;
$$;
revoke all on function public.consume_request(text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_request(text, integer, integer) to service_role;

create function public.room_action(p_action text, p_code text, p_user uuid, p_tab uuid, p_profile jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  r public.rooms; m public.room_members; v_now timestamptz := now();
  v_count integer; v_before integer; v_transition timestamptz; v_members jsonb;
begin
  if p_action not in ('create', 'join', 'state', 'heartbeat', 'settings', 'wait', 'leave') then
    return jsonb_build_object('error', 'Unknown room action.', 'status', 400);
  end if;
  if p_action = 'create' then
    insert into public.rooms(code, empty_since) values (p_code, v_now) on conflict do nothing;
    if not found then return jsonb_build_object('error', 'Room code collision.', 'status', 409); end if;
  end if;
  select * into r from public.rooms where code = p_code for update;
  if not found then return jsonb_build_object('error', 'Room not found. Check the code.', 'status', 404); end if;
  if r.closed_at is not null then return jsonb_build_object('error', 'This room has ended. Create a new room.', 'status', 410); end if;
  if r.started_at is not null and r.started_at + interval '30 minutes' <= v_now then
    update public.rooms set closed_at = r.started_at + interval '30 minutes' where code = p_code;
    update public.room_members set left_at = v_now where room_code = p_code and left_at is null;
    return jsonb_build_object('error', 'The 30-minute call has ended.', 'status', 410);
  end if;

  select count(*) into v_before from public.room_members where room_code = p_code and left_at is null;
  -- Leases and solo timeouts are reconciled before a heartbeat can renew them.
  update public.room_members set left_at = lease_expires_at where room_code = p_code and left_at is null and lease_expires_at <= v_now;
  select count(*) into v_count from public.room_members where room_code = p_code and left_at is null;
  if v_count <> v_before then
    select max(left_at) into v_transition from public.room_members where room_code = p_code;
    r.epoch := gen_random_uuid();
    r.alone_since := case when v_count = 1 then v_transition else null end;
    r.empty_since := case when v_count = 0 then coalesce(v_transition, v_now) else null end;
  end if;
  if v_count = 1 and r.alone_since + interval '2 minutes' <= v_now then
    update public.room_members set left_at = r.alone_since + interval '2 minutes' where room_code = p_code and left_at is null;
    r.empty_since := r.alone_since + interval '2 minutes'; r.alone_since := null;
    r.epoch := gen_random_uuid(); v_count := 0;
  end if;
  update public.rooms set epoch = r.epoch, alone_since = r.alone_since, empty_since = r.empty_since where code = p_code;
  if v_count = 0 and r.empty_since + interval '30 seconds' <= v_now then
    update public.rooms set closed_at = r.empty_since + interval '30 seconds' where code = p_code;
    return jsonb_build_object('error', 'This empty room has expired. Create a new room.', 'status', 410);
  end if;

  select * into m from public.room_members where room_code = p_code and user_id = p_user;
  if p_action in ('create', 'join') then
    if m.left_at is null and m.user_id is not null and m.tab_id <> p_tab then
      return jsonb_build_object('error', 'You already have this room open in another tab.', 'status', 409);
    end if;
    if m.user_id is null or m.left_at is not null then
      if v_count >= 2 then return jsonb_build_object('error', 'This room is full. Only two people can join.', 'status', 409); end if;
      -- One browser guest may hold only one live room, even with a different code.
      perform pg_advisory_xact_lock(hashtextextended(p_user::text, 0));
      if exists (select 1 from public.room_members where user_id = p_user and room_code <> p_code and left_at is null and lease_expires_at > v_now) then
        return jsonb_build_object('error', 'Leave your other call before joining this room.', 'status', 409);
      end if;
      r.epoch := gen_random_uuid();
      if v_count = 0 then r.alone_since := v_now;
      else r.alone_since := null; r.started_at := coalesce(r.started_at, v_now); end if;
      r.empty_since := null;
    end if;
    insert into public.room_members (room_code, user_id, tab_id, name, speaking_language, listening_language, lease_expires_at)
      values (p_code, p_user, p_tab, p_profile->>'name', p_profile->>'speakingLanguage', p_profile->>'listeningLanguage', v_now + interval '15 seconds')
      on conflict (room_code, user_id) do update set tab_id = excluded.tab_id, name = excluded.name,
        speaking_language = excluded.speaking_language, listening_language = excluded.listening_language,
        lease_expires_at = excluded.lease_expires_at, left_at = null;
  else
    if m.user_id is null or m.left_at is not null or m.tab_id <> p_tab then
      return jsonb_build_object('error', 'Your seat is no longer active. Join the room again.', 'status', 403);
    end if;
    if p_action = 'leave' then
      update public.room_members set left_at = v_now where room_code = p_code and user_id = p_user;
      r.epoch := gen_random_uuid();
      r.alone_since := case when v_count = 2 then v_now else null end;
      r.empty_since := case when v_count = 1 then v_now else null end;
    else
      if p_action = 'wait' and v_count = 1 then r.alone_since := v_now; end if;
      if p_action in ('heartbeat', 'settings', 'wait') then
        update public.room_members set lease_expires_at = v_now + interval '15 seconds' where room_code = p_code and user_id = p_user;
      end if;
      if p_action = 'settings' then
        update public.room_members set name = coalesce(p_profile->>'name', name),
          speaking_language = coalesce(p_profile->>'speakingLanguage', speaking_language),
          listening_language = coalesce(p_profile->>'listeningLanguage', listening_language),
          muted = coalesce((p_profile->>'muted')::boolean, muted)
          where room_code = p_code and user_id = p_user;
      end if;
    end if;
  end if;
  update public.rooms set epoch = r.epoch, empty_since = r.empty_since, alone_since = r.alone_since, started_at = r.started_at where code = p_code;
  select coalesce(jsonb_agg(jsonb_build_object('id', user_id, 'name', name,
    'speakingLanguage', speaking_language, 'listeningLanguage', listening_language, 'muted', muted) order by user_id), '[]')
    into v_members from public.room_members where room_code = p_code and left_at is null and lease_expires_at > v_now;
  return jsonb_build_object('code', r.code, 'epoch', r.epoch, 'serverNow', v_now,
    'aloneSince', r.alone_since, 'endsAt', r.started_at + interval '30 minutes', 'members', v_members);
end;
$$;
revoke all on function public.room_action(text, text, uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.room_action(text, text, uuid, uuid, jsonb) to service_role;
