-- The api/ service's database (hotelverify_app) is created automatically by
-- the postgres image via POSTGRES_DB. The issuer is a separate trust domain
-- with its own database, so we create it here as a second database on the
-- same Postgres instance.
CREATE DATABASE hotelverify_issuer;
