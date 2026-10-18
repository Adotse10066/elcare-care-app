// fee_governance_tests.rs — Issue 078
//
// Admin-only fee configuration should explicitly reject a non-admin caller.
// These tests pin the authorization guard on `set_protocol_fee` (and its
// per-collection companion `set_collection_fee_bps`) so a regression in the
// role-check path is immediately visible.
//
// Acceptance criteria:
//   • A non-admin caller cannot update the global protocol fee.
//   • The fee state is unchanged after the rejected call.
//   • The authorized admin path continues to work (existing passing coverage
//     in `governance_tests.rs` and `fee_attribution_tests.rs` covers this;
//     the positive path here serves as a local sanity-check only).

use crate::test::mock_nft;
use crate::contract::{MarketplaceContract, MarketplaceContractClient};
use soroban_sdk::{testutils::Address as _, Address, Env};

// ── Setup ─────────────────────────────────────────────────────────────────────

fn setup() -> (Env, MarketplaceContractClient<'static>, Address) {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(MarketplaceContract, ());
    let client = MarketplaceContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    client.set_admin(&admin);
    client.migrate_roles(&admin);
    (env, client, admin)
}

// ── Global protocol fee — unauthorized rejection ──────────────────────────────

/// A non-admin caller must be rejected with `Unauthorized` (#5).
///
/// The stored fee must remain at the pre-call value so no partial state update
/// can occur even on a failed call.
#[test]
#[should_panic(expected = "Error(Contract, #5)")]
fn test_set_protocol_fee_rejects_non_admin_caller() {
    let (env, client, _admin) = setup();
    let stranger = Address::generate(&env);
    // Pre-condition: fee is 0 (default).
    assert_eq!(client.get_protocol_fee(), 0u32);
    // Attempt to set the fee as an unrelated address — must panic.
    client.set_protocol_fee(&stranger, &300u32);
}

/// After a rejected non-admin call, the fee state must be unchanged.
#[test]
fn test_set_protocol_fee_fee_unchanged_after_rejection() {
    let (env, client, _admin) = setup();
    let stranger = Address::generate(&env);

    let fee_before = client.get_protocol_fee();

    // Drive a rejected call; catch the panic so we can assert the invariant.
    let result = client.try_set_protocol_fee(&stranger, &500u32);
    assert!(result.is_err(), "non-admin call must be rejected");

    let fee_after = client.get_protocol_fee();
    assert_eq!(
        fee_before, fee_after,
        "fee state must be unchanged after a rejected non-admin call"
    );
}

/// Sanity check: the ProtocolConfig role holder (admin after `migrate_roles`)
/// can successfully update the protocol fee.  This confirms the guard itself
/// is working, not just that the contract always panics.
#[test]
fn test_set_protocol_fee_admin_succeeds() {
    let (_, client, admin) = setup();
    client.set_protocol_fee(&admin, &250u32);
    assert_eq!(client.get_protocol_fee(), 250u32);
}

// ── Per-collection fee override — unauthorized rejection ──────────────────────

/// A non-admin caller must be rejected for the per-collection fee override
/// (`set_collection_fee_bps`) as well.  Both entry-points share the same
/// `require_role(ProtocolConfig)` guard; this test ensures the guard fires on
/// the collection-level path too.
#[test]
#[should_panic(expected = "Error(Contract, #5)")]
fn test_set_collection_fee_bps_rejects_non_admin_caller() {
    let (env, client, _admin) = setup();
    let stranger = Address::generate(&env);
    let collection = env.register(mock_nft::MockNft, ());
    client.set_collection_fee_bps(&stranger, &collection, &700u32);
}

/// After a rejected non-admin call to `set_collection_fee_bps`, no override
/// must be stored for the collection.
#[test]
fn test_set_collection_fee_bps_state_unchanged_after_rejection() {
    let (env, client, _admin) = setup();
    let stranger = Address::generate(&env);
    let collection = env.register(mock_nft::MockNft, ());

    // No override exists yet.
    assert!(client.get_collection_fee_bps(&collection).is_none());

    let result = client.try_set_collection_fee_bps(&stranger, &collection, &700u32);
    assert!(result.is_err(), "non-admin call must be rejected");

    // Still no override after the rejected attempt.
    assert!(
        client.get_collection_fee_bps(&collection).is_none(),
        "collection fee override must not be stored after a rejected call"
    );
}
