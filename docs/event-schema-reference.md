# Event Schema Reference

This document describes the event schema used by the indexer.

## Event Types

- `LISTING_CREATED`
- `AUCTION_CREATED`
- `BID_PLACED`
- `AUCTION_FINALIZED`
- `AUCTION_CANCELLED`
- `ROYALTY_PAID`
- `PROTOCOL_FEE_PAID`
- `TRANSFER`

## Schema Format

Each event contains:
- `event_type`: The type of event
- `ledger_sequence`: The ledger sequence number
- `timestamp`: The event timestamp
- `data`: Event-specific data

## Event Data Structure

```json
{
  "event_type": "LISTING_CREATED",
  "ledger_sequence": 12345,
  "timestamp": "2024-01-01T00:00:00Z",
  "data": {
    "listing_id": 1,
    "asset_contract": "C...",
    "asset_id": "123",
    "price": "100000000"
  }
}
```

## Event Flow

```
┌─────────────┐     ┌─────────────┐
│  Contract   │────▶│  Indexer    │
└─────────────┘     └─────────────┘
        │
        ▼
┌─────────────┐
│  Database   │
└─────────────┘
```
