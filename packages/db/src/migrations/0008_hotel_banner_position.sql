-- Vertical focal point for the booking-engine banner: which horizontal slice of
-- the image is shown when it's cropped to the banner's wide/short frame.
-- Stored as a percentage 0 (top) … 100 (bottom); 50 = centered (the default).
-- The engine maps it to CSS `object-position: center <n>%`.
alter table hotels add column if not exists banner_position int not null default 50;
