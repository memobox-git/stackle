-- profiles.role is a NOT NULL user_role enum with no default.
-- Set a default of 'learner' so future inserts that forget to pass
-- it don't crash. Stackle V2 users are all 'learner' for now.

ALTER TABLE profiles ALTER COLUMN role SET DEFAULT 'learner'::user_role;
