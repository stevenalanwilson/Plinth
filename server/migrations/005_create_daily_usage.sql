-- How many picks each visitor has had on each day (UTC), and in total, so a daily limit can be
-- kept across restarts and across instances. The subject is a device id, a hash of an address
-- (for requests that carry no device token), or 'global'. Rows older than a day are removed by a
-- daily clean-up, so this never holds more than a couple of days.
CREATE TABLE daily_usage (
  subject text NOT NULL,
  day date NOT NULL,
  count integer NOT NULL,
  PRIMARY KEY (subject, day)
);

CREATE INDEX daily_usage_day ON daily_usage (day);
