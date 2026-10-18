// royalty_boundary_tests.rs — Issue 078 (royalty max boundary)
//
// The maximum valid royalty percentage should be covered at the exact boundary
// and immediately beyond it. These tests pin the validation rule so any
// accidental change to the maximum policy is immediately visible.
//
// Policy under test (marketplace):
//   • `royalty_bps` returned by a collection's `royalty_info()` must be
//     ≤ 10_000 (100 %).  A value > 10_000 reverts with `InvalidRoyalty` (#24)
//     at settlement time.
//
// Policy under test (launchpad / validate_recipients):
//   • `sum(recipient.percentage)` must be ≤ 10_000.  A value > 10_000 reverts
//     with `RoyaltyExceedsLimit` (#26) at listing creation time.
//
// Acceptance criteria:
//   • Exact maximum (10_000 bps) is accepted.
//   • One unit above the maximum (10_001 bps) is explicitly rejected.
//   • No partial state update occurs after invalid input.

use crate::test::{mock_nft, valid_recipients, MockNftClient};
use crate::types::{MarketplaceError, Recipient};
use crate::contract::{MarketplaceContract, MarketplaceContractClient};
use soroban_sdk::{
    symbol_short,
    testutils::Address as _,
    token::StellarAssetClient,
    vec, Address, Env,
};

// ── Setup ─────────────────────────────────────────────────────────────────────

fn setup() -> (
    Env,
    MarketplaceContractClient<'static>,
    Address, // artist / admin
    Address, // buyer
    Address, // payment_token
    Address, // collection
) {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(MarketplaceContract, ());
    let client = MarketplaceContractClient::new(&env, &contract_id);
    let artist = Address::generate(&env);
    let buyer = Address::generate(&env);
    let token_admin = Address::generate(&env);
    let payment_token = env
        .register_stellar_asset_contract_v2(token_admin.clone())
        .address();
    let sac = StellarAssetClient::new(&env, &payment_token);
    sac.mint(&artist, &100_000_000_000_i128);
    sac.mint(&buyer, &100_000_000_000_i128);
    let collection = env.register(mock_nft::MockNft, ());
    MockNftClient::new(&env, &collection).set_owner(&1u64, &artist);
    client.set_admin(&artist);
    client.add_token_to_whitelist(&artist, &payment_token);
    (env, client, artist, buyer, payment_token, collection)
}

// ── Boundary: recipient basis-points at listing creation ──────────────────────
//
// `validate_recipients` rejects input where sum(bps) > 10_000. The tests below
// use single-recipient listings so the total equals the single entry's value.

/// A single recipient at exactly 10_000 bps (100 %) is the maximum allowed
/// value. Creating a listing with this split must succeed.
#[test]
fn test_recipient_bps_at_exact_maximum_accepted() {
    let (env, client, artist, _buyer, token, collection) = setup();

    // Sole recipient at 10_000 bps is the exact maximum — must not panic.
    let recipients = vec![
        &env,
        Recipient {
            address: artist.clone(),
            percentage: 10_000,
        },
    ];

    let listing_id = client.create_listing(
        &artist,
        &10_000_000_i128,
        &symbol_short!("XLM"),
        &token,
        &collection,
        &1u64,
        &1u64,
        &recipients,
        &None::<u64>,
    );

    // Listing must have been created (non-zero id proves it was stored).
    let listing = client.get_listing(&listing_id);
    assert_eq!(listing.listing_id, listing_id);
    assert_eq!(
        listing.recipients.get(0).unwrap().percentage,
        10_000,
        "stored bps must equal the submitted maximum"
    );
}

/// One unit above the maximum (10_001 bps for a single recipient) must be
/// rejected. The error carries `RoyaltyExceedsLimit` (#26).
#[test]
#[should_panic(expected = "Error(Contract, #26)")]
fn test_recipient_bps_one_above_maximum_rejected() {
    let (env, client, artist, _buyer, token, collection) = setup();

    let recipients = vec![
        &env,
        Recipient {
            address: artist.clone(),
            percentage: 10_001, // one unit above the 10_000 cap
        },
    ];

    // Must panic with RoyaltyExceedsLimit.
    client.create_listing(
        &artist,
        &10_000_000_i128,
        &symbol_short!("XLM"),
        &token,
        &collection,
        &1u64,
        &1u64,
        &recipients,
        &None::<u64>,
    );
}

/// After a rejection for bps > 10_000, the listing count must not increase.
/// This confirms no partial state write occurs.
#[test]
fn test_recipient_bps_above_maximum_no_partial_state_update() {
    let (env, client, artist, _buyer, token, collection) = setup();

    let count_before = client.get_total_listings();

    let over_recipients = vec![
        &env,
        Recipient {
            address: artist.clone(),
            percentage: 10_001,
        },
    ];

    let result = client.try_create_listing(
        &artist,
        &10_000_000_i128,
        &symbol_short!("XLM"),
        &token,
        &collection,
        &1u64,
        &1u64,
        &over_recipients,
        &None::<u64>,
    );
    assert!(result.is_err(), "listing with bps > 10_000 must be rejected");

    let count_after = client.get_total_listings();
    assert_eq!(
        count_before, count_after,
        "listing count must not change after a validation failure"
    );
}

// ── Boundary: collection royalty_bps from royalty_info() at settlement ────────
//
// At settlement (`buy_artwork`) the contract calls `royalty_info()` on the
// collection contract and rejects any value > 10_000 with `InvalidRoyalty` (#24).

/// A collection whose `royalty_info` reports exactly 10_000 bps (100 %) is at
/// the boundary. Settlement must not reject this value.
///
/// Note: At 10_000 bps the royalty consumes the entire sale amount.  The
/// single recipient (the artist) is also the royalty receiver, so the royalty
/// path is skipped (seller == royalty receiver), making the test safe to run
/// without minting tokens to a separate receiver.
#[test]
fn test_collection_royalty_bps_at_exact_maximum_accepted_at_settlement() {
    let (env, client, artist, buyer, token, collection) = setup();

    // Configure the mock NFT to report 10_000 bps royalty — royalty receiver
    // is the artist themselves, so the skip-self-royalty path fires and the
    // settlement completes normally without an extra transfer.
    MockNftClient::new(&env, &collection).set_royalty(&artist, &10_000);

    let listing_id = client.create_listing(
        &artist,
        &10_000_000_i128,
        &symbol_short!("XLM"),
        &token,
        &collection,
        &1u64,
        &1u64,
        &valid_recipients(&env, &artist),
        &None::<u64>,
    );

    // buy_artwork must succeed without an InvalidRoyalty panic.
    client.buy_artwork(&buyer, &listing_id);

    let listing = client.get_listing(&listing_id);
    assert_eq!(
        listing.status,
        crate::types::ListingStatus::Sold,
        "listing must be Sold after a successful purchase at the royalty boundary"
    );
}

/// A collection whose `royalty_info` reports 10_001 bps (one above the
/// 10_000 limit) must be rejected at settlement with `InvalidRoyalty` (#24).
#[test]
#[should_panic(expected = "Error(Contract, #24)")]
fn test_collection_royalty_bps_one_above_maximum_rejected_at_settlement() {
    let (env, client, artist, buyer, token, collection) = setup();

    // Configure the mock NFT to report a royalty that exceeds the cap.
    MockNftClient::new(&env, &collection).set_royalty(&artist, &10_001);

    let listing_id = client.create_listing(
        &artist,
        &10_000_000_i128,
        &symbol_short!("XLM"),
        &token,
        &collection,
        &1u64,
        &1u64,
        &valid_recipients(&env, &artist),
        &None::<u64>,
    );

    // Must panic with InvalidRoyalty.
    client.buy_artwork(&buyer, &listing_id);
}

/// After a settlement rejection caused by royalty > 10_000 bps, the listing
/// status must remain Active (no partial state update occurred).
#[test]
fn test_collection_royalty_above_maximum_listing_remains_active() {
    let (env, client, artist, buyer, token, collection) = setup();

    MockNftClient::new(&env, &collection).set_royalty(&artist, &10_001);

    let listing_id = client.create_listing(
        &artist,
        &10_000_000_i128,
        &symbol_short!("XLM"),
        &token,
        &collection,
        &1u64,
        &1u64,
        &valid_recipients(&env, &artist),
        &None::<u64>,
    );

    let result = client.try_buy_artwork(&buyer, &listing_id);
    assert!(result.is_err(), "buy_artwork must be rejected for royalty > 10_000");

    // Listing must still be Active — no partial settlement committed.
    let listing = client.get_listing(&listing_id);
    assert_eq!(
        listing.status,
        crate::types::ListingStatus::Active,
        "listing status must remain Active after a failed settlement"
    );
}
