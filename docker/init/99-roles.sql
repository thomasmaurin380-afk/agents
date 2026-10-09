-- TEST UNIQUEMENT : mots de passe des rôles internes Supabase dans la pile de test locale.
alter user supabase_auth_admin with password 'postgres';
alter user authenticator with password 'postgres';
alter user supabase_storage_admin with password 'postgres';
