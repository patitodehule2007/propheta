-- Demo/test-only monitored accounts. Matches the fixture map in
-- mocks/x-api-mock so GET /2/users/by/username/:handle resolves to the same
-- platform_user_id seeded here.
INSERT INTO monitored_accounts (platform_user_id, handle, is_active)
VALUES
    ('25073877', 'realDonaldTrump', TRUE),
    ('1349149096909668362', 'WhiteHouse', TRUE),
    ('210437201', 'JDVance', TRUE)
ON CONFLICT (platform_user_id) DO NOTHING;
