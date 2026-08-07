-- Demo/test-only monitored accounts. Matches the fixture map in
-- mocks/x-api-mock so GET /2/users/by/username/:handle resolves to the same
-- platform_user_id seeded here.
INSERT INTO monitored_accounts (platform_user_id, handle, is_active)
VALUES
    ('25073877', 'realDonaldTrump', true),
    ('1349149096909668362', 'WhiteHouse', true),
    ('210437201', 'JDVance', true)
ON CONFLICT (platform_user_id) DO NOTHING;
