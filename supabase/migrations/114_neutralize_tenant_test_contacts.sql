-- Migration 114: neutralize the production demo contacts introduced by 108.
--
-- Migration 108 is already part of the applied history, so it must not be
-- rewritten or removed. Its addresses looked fictitious but used real email
-- providers and could therefore belong to real people. Reserved example.com
-- addresses keep Tenant Test useful for demos without creating deliverability
-- or privacy risk if an outbound workflow is triggered accidentally.

update leads
set email = replace(id, 'lead-test-', 'lead') || '@example.com'
where tenant_id = 'tenant-tenant-test'
  and id in (
    select 'lead-test-' || lpad(series::text, 3, '0')
    from generate_series(1, 30) as series
  );
