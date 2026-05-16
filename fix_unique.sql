DO $$ 
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT i.relname AS index_name
        FROM pg_class t
        JOIN pg_index ix ON t.oid = ix.indrelid
        JOIN pg_class i ON i.oid = ix.indexrelid
        WHERE t.relname = 'Position' 
          AND ix.indisunique = true
    ) LOOP
        IF r.index_name != 'Position_pkey' THEN
            EXECUTE 'DROP INDEX IF EXISTS "' || r.index_name || '" CASCADE;';
        END IF;
    END LOOP;
END $$;
