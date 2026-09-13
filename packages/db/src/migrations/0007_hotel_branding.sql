-- Per-hotel branding for the public booking engine: a banner/hero image and an
-- accent color the hotel can set from the staff Settings page.
--
-- banner_url follows the same MVP approach as room_type_photos (migration
-- 0006): a base64 data URL stored inline. See the "Production TODOs" note in
-- CLAUDE.md — for production these images belong in object storage (S3 / R2)
-- with only the URL stored here.
--
-- accent_color is a "#rrggbb" hex string; the booking engine maps it onto its
-- --primary / --ring theme tokens at runtime.
alter table hotels add column if not exists banner_url text;
alter table hotels add column if not exists accent_color text;
